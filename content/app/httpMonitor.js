/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/tabWatcher",
    "chrome/window",
    "chrome/menu",
    "net/netMonitor",
    "lib/array",
    "lib/css",
    "lib/locale",
    "lib/events",
    "lib/dom",
    "lib/options",
    "lib/string",
    "remote/module"
],
function(FBTrace, TabWatcher, Win, Menu, NetMonitor, Arr, Css, Locale, Events, Dom, Options, Str,
    RemoteModule) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Default Preferences

/**
 * HTTP Monitor extension is restartless and so, we need to register default preference
 * manually (defaults/prefeneces dir doesn't work in this case)
 */
var defaultPrefs =
{
    "textSize": 0,
    "showInfoTips": true,
    "toolbarCustomizationDone": false,

// Console
    "showNetworkErrors": true,

// Net
    "netFilterCategory": "all",
    "net.logLimit": 500,
    "net.enableSites": false,
    "netDisplayedResponseLimit": 102400,
    "netDisplayedPostBodyLimit": 10240,
    "net.hiddenColumns": "netProtocolCol netLocalAddressCol",
    "netPhaseInterval": 1000,
    "sizePrecision": 1,
    "netParamNameLimit": 25,
    "netShowPaintEvents": false,
    "netShowBFCacheResponses": true,
    "netHtmlPreviewHeight": 100,

// JSON Preview
    "sortJsonPreview": false,

// Cache
    "cache.mimeTypes": "",
    "cache.responseLimit": 5242880,
}

// ********************************************************************************************* //
// Implementation

/**
 * HttpMonitor object represents the entir application.
 */
var HttpMonitor = 
{
    initialize: function(win)
    {
        // The parent XUL window.
        this.win = win;

        // Update current tab label.
        this.updateLabel();

        this.tabWatcher = new TabWatcher(this.getPanelDocument());

        this.internationalizeUI(win.document);

        // Initialize options and pass in the pref domain for this application.
        Options.initialize("extensions.httpmonitor");
        Options.registerDefaultPrefs(defaultPrefs);

        // Initialize modules. Modules represent independent application
        // components that are registered during apppliation load and
        // their life cycle is maintained here.
        Events.dispatch(Firebug.modules, "initialize");
        Events.dispatch(Firebug.modules, "initializeUI");
    },

    destroy: function()
    {
        Events.dispatch(modules, "disable");
        Events.dispatch(modules, "shutdown");

        Options.shutdown();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    /**
     * Dynamically construct a context mene if the user clicks anywhere within the content
     * area (content of the application window/panel)
     */
    onContextShowing: function(event)
    {
        var popup = event.target;
        if (popup.id != "monitorContextMenu")
            return;

        var context = this.tabWatcher.context;
        var target = this.win.document.popupNode;
        var panel = context.getPanel("net");

        Dom.eraseNode(popup);

        var object;
        if (target && target.ownerDocument == document)
            object = Firebug.getRepObject(target);
        else if (target && panel)
            object = panel.getPopupObject(target);
        else if (target)
            object = Firebug.getRepObject(target);

        var rep = Firebug.getRep(object, context);
        var realObject = rep ? rep.getRealObject(object, context) : null;
        var realRep = realObject ? Firebug.getRep(realObject, context) : null;

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("chrome.onContextShowing object:"+object+" rep: "+rep+
                " realObject: "+realObject+" realRep:"+realRep);

        if (realObject && realRep)
        {
            // 1. Add the custom menu items from the realRep
            var menu = realRep.getContextMenuItems(realObject, target, context);
            if (menu)
            {
                for (var i = 0; i < menu.length; ++i)
                    Menu.createMenuItem(popup, menu[i]);
            }
        }

        if (object && rep && rep != realRep)
        {
            // 1. Add the custom menu items from the original rep
            var items = rep.getContextMenuItems(object, target, context);
            if (items)
            {
                for (var i = 0; i < items.length; ++i)
                    Menu.createMenuItem(popup, items[i]);
            }
        }

        // 1. Add the custom menu items from the panel
        if (panel)
        {
            var items = panel.getContextMenuItems(realObject, target);
            if (items)
            {
                for (var i = 0; i < items.length; ++i)
                    Menu.createMenuItem(popup, items[i]);
            }
        }

        // 3. Add menu items from uiListeners
        var items = [];
        Events.dispatch(Firebug.uiListeners, "onContextMenu", [items, object, target,
            context, panel, popup]);

        if (items)
        {
            for (var i = 0; i < items.length; ++i)
                Menu.createMenuItem(popup, items[i]);
        }

        if (!popup.firstChild)
            return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    connect: function()
    {
        RemoteModule.connect();
    },

    disconnect: function()
    {
        RemoteModule.disconnect();
    },

    onConnectionMenuShowing: function(event)
    {
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // List of tabs

    /**
     * The user wants to pick an existing tab so, let's create a list of all existing
     * tabs (from all existing browser windows)
     */
    onTabListMenuShowing: function(popup)
    {
        var tabs = [];
        Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            Win.iterateBrowserTabs(win, function(tab)
            {
                tabs.push(tab);
            });
        });

        // Populate the popup menu with entries (list of tab titles).
        for (var i=0; i<tabs.length; ++i)
        {
            var tab = tabs[i];
            var item = {
                nol10n: true,
                label: tab.label,
                type: "radio",
                checked: this.currentTab == tab,
                command: this.onSelectTab.bind(this, tab)
            };
            Menu.createMenuItem(popup, item);
        }

        // Yep, show the menu.
        return true;
    },

    onTabListMenuHidden: function(popup)
    {
        // As soon as the list of tabs (a popup menu) is closed let's remove all menu items
        // to destroy references to tab objects.
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    updateLabel: function()
    {
        var button = this.win.document.getElementById("currentTab");
        button.setAttribute("label", "Select Browser Tab ");

        if (!this.currentTab)
            return;

        var label = Str.cropString(this.currentTab.label, 40);
        button.setAttribute("label", label + " ");
        button.setAttribute("tooltiptext", this.currentTab.label);
    },

    onSelectTab: function(tab)
    {
        if (this.currentTab == tab)
            return;

        this.currentTab = tab;
        this.updateLabel();

        if (!this.currentTab)
            return;

        try
        {
            // Start watching the new tab (the previsous one, if any, is unwatched automatically).
            this.tabWatcher.watchTab(tab);
        }
        catch (e)
        {
            FBTrace.sysout("httpMonitor.onSelectTab; EXCEPTION " + e, e);
        }

        FBTrace.sysout("httpMonitor.onSelectTab; " + this.tabWatcher.context.getName());
    },

    getPanelDocument: function()
    {
        var browser = this.getPanelBrowser();
        return browser.contentDocument;
    },

    /**
     * Returns reference to the <browser> element that represents the main application UI.
     */
    getPanelBrowser: function()
    {
        return this.win.document.getElementById("content");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Localization

    /**
     * Substitute strings in the UI, with fall back to en-US
     */
    internationalizeUI: function(doc)
    {
        if (!doc)
            return;

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Firebug.internationalizeUI");

        var elements = doc.getElementsByClassName("fbInternational");
        elements = Arr.cloneArray(elements);
        var attributes = ["label", "tooltiptext", "aria-label"];
        for (var i=0; i<elements.length; i++)
        {
            var element = elements[i];
            Css.removeClass(elements[i], "fbInternational");
            for (var j=0; j<attributes.length; j++)
            {
                if (element.hasAttribute(attributes[j]))
                    Locale.internationalize(element, attributes[j]);
            }
        }
    },
}

// ********************************************************************************************* //
// Registration

return HttpMonitor;

// ********************************************************************************************* //
});
