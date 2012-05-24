/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/chrome/tabWatcher",
    "httpmonitor/lib/menu",
    "httpmonitor/lib/array",
    "httpmonitor/lib/css",
    "httpmonitor/lib/locale",
    "httpmonitor/lib/events",
    "httpmonitor/lib/dom",
    "httpmonitor/lib/options",
    "httpmonitor/app/tabListMenu",
    "httpmonitor/app/connectionMenu",
    "httpmonitor/chrome/localProxy",
    "httpmonitor/remote/remoteProxy",
    "httpmonitor/chrome/chrome",
    "httpmonitor/net/netMonitor",

    // These are independent modules. We don't actually need to reference them, but
    // they need to be loaded.
    "httpmonitor/chrome/infotip",
    "httpmonitor/net/netPanel",
    "httpmonitor/cache/tabCacheModel",
],
function(FBTrace, TabWatcher, Menu, Arr, Css, Locale, Events, Dom, Options,
    TabListMenu, ConnectionMenu, LocalProxy, RemoteProxy, Chrome,
    NetMonitor) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Implementation

/**
 * {@HttpMonitor} object represents the entire application. This module also represents
 * the main root that must be loaded. All the other modules are specified as (direct or
 * indirect) dependencies.
 */
var HttpMonitor =
/** @lends HttpMonitor */
{
    initialize: function(win, config)
    {
        Chrome.config = config || {};

        top = win;
        win.HttpMonitor = HttpMonitor;

        // Should be set to false in final release.
        FBTrace.DBG_ERRORS = true;

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

        // Initialize modules. Modules represent independent application
        // components that are registered during application load and
        // their life cycle is maintained here.
        Events.dispatch(Chrome.modules, "initialize");
        Events.dispatch(Chrome.modules, "initializeUI");
    },

    destroy: function()
    {
        this.tabWatcher.unwatchTab(this.proxy);

        Events.dispatch(Chrome.modules, "disable");
        Events.dispatch(Chrome.modules, "shutdown");

        Options.shutdown();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection Hooks

    onConnect: function()
    {
        this.tabWatcher.unwatchTab(this.proxy);

        this.proxy = new RemoteProxy(this.ConnectionMenu.connection);

        TabListMenu.updateUI();

        // Attach to the remote Tracing service.
        if (Options.get("remoteTrace"))
            this.proxy.attachTrace();
    },

    onDisconnect: function()
    {
        // Remote tracing is detached automatically in TraceActor.disconnect()
        // when the connection is closed

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
    // UI Commands

    clear: function()
    {
        NetMonitor.clear(Chrome.currentContext);
    },

    togglePersist: function()
    {
        NetMonitor.togglePersist(Chrome.currentContext);
    },

    onToggleFilter: function(filter)
    {
        NetMonitor.onToggleFilter(Chrome.currentContext, filter);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    /**
     * Dynamically construct a context menu if the user clicks anywhere within the content
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
            object = Chrome.getRepObject(target);
        else if (target && panel)
            object = panel.getPopupObject(target);
        else if (target)
            object = Chrome.getRepObject(target);

        var rep = Chrome.getRep(object, context);
        var realObject = rep ? rep.getRealObject(object, context) : null;
        var realRep = realObject ? Chrome.getRep(realObject, context) : null;

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
        Events.dispatch(Chrome.uiListeners, "onContextMenu", [items, object, target,
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
            FBTrace.sysout("HTTPMonitor.internationalizeUI");

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
