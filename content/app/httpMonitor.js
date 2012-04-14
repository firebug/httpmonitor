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
    "remote/tabMenu",
    "app/DefaultPrefs",
    "app/tabListMenu",
    "remote/connectionMenu",
    "app/localProxy",
    "remote/proxy",
],
function(FBTrace, TabWatcher, Win, Menu, NetMonitor, Arr, Css, Locale, Events, Dom, Options, Str,
    RemoteTabMenu, DefaultPrefs, TabListMenu, ConnectionMenu,
    LocalProxy, RemoteProxy) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

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

        // Used from XUL
        this.TabListMenu = TabListMenu;
        this.ConnectionMenu = ConnectionMenu;

        // Listen for connection events (onConnect, onDisconnect) and tab selection
        // events (onSelectTab)
        this.ConnectionMenu.addListener(this);
        this.TabListMenu.addListener(this);

        this.tabWatcher = new TabWatcher(this.getPanelDocument());
        this.proxy = new LocalProxy();

        // Localize all strings in the application UI.
        this.internationalizeUI(win.document);

        // Initialize options and pass in the pref domain for this application.
        Options.initialize("extensions.httpmonitor");
        Options.registerDefaultPrefs(DefaultPrefs);

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
    // Connection Hooks

    onConnect: function()
    {
        this.tabWatcher.unwatchTab(this.proxy);

        this.proxy = new RemoteProxy(this.ConnectionMenu.connection);

        TabListMenu.updateUI();
    },

    onDisconnect: function()
    {
        this.tabWatcher.unwatchTab(this.proxy);

        this.proxy = new LocalProxy();

        TabListMenu.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tab Selection Hook

    onSelectTab: function(tab)
    {
        this.tabWatcher.watchTab(tab, this.proxy, function()
        {
            TabListMenu.updateUI();
        });
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
