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
],
function(FBTrace, TabWatcher, Win, Menu, NetMonitor, Arr, Css, Locale, Events, Dom, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Implementation

/**
 * HttpMonitor represents the main application object.
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

        // Initialize modules.
        Events.dispatch(Firebug.modules, "initialize", []);
        Events.dispatch(Firebug.modules, "initializeUI", []);
    },

    destroy: function()
    {
        NetMonitor.shutdown();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

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
    // List of tabs

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
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    updateLabel: function()
    {
        var button = this.win.document.getElementById("currentTab");
        button.setAttribute("label", "Select Browser Tab ");

        if (this.currentTab)
            button.setAttribute("label", this.currentTab.label + " ");
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
        var browser = this.win.document.getElementById("content");
        return browser.contentDocument;
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
