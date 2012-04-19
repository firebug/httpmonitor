/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/object",
    "chrome/menu",
    "lib/string",
    "lib/events",
    "chrome/module",
],
function(FBTrace, Firebug, Obj, Menu, Str, Events, Module) {

// ********************************************************************************************* //
// Module

/**
 * @module
 */
var TabListMenu = Obj.extend(Module,
/** @lends TabListMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        this.updateUI();
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Event Handlers

    onShowing: function(popup)
    {
        // Create temporary menu item.
        Menu.createMenuItem(popup, {
            nol10n: true,
            image: "chrome://httpmonitor/skin/loading_16.gif",
            label: "Fetching list of remote tabs...",
            disabled: true,
        });

        var self = this;
        var proxy = this.getProxy();

        proxy.getTabs(function(tabs)
        {
            self.clear(popup);

            // Populate the popup menu with entries (list of tab titles).
            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                var item = {
                    nol10n: true,
                    label: tab.label,
                    type: "radio",
                    checked: self.currentTab == tab.id,
                    command: self.selectTab.bind(self, tab)
                };
                Menu.createMenuItem(popup, item);
            }
        });

        // Yep, show the menu immediattely. Note that it can be populated asynchronously.
        return true;
    },

    onHidden: function(popup)
    {
        this.clear(popup);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    updateUI: function()
    {
        var menu = Firebug.chrome.$("httpMonitorTabListMenu");

        var proxy = this.getProxy();

        var label = "Select Tab";
        var tab = proxy.context ? proxy.context.tab : null;
        if (tab)
            label = Str.cropString(tab.label, 100);

        menu.setAttribute("label", label + " ");
    },

    clear: function(popup)
    {
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection Listener

    onConnect: function()
    {
        this.updateUI();
    },

    onDisconnect: function()
    {
        this.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    selectTab: function(tab)
    {
        Events.dispatch(this.fbListeners, "onSelectTab", [tab]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Globals

    getProxy: function()
    {
        //xxxHonza: Could we get the proxy without using the app singleton?
        return top.HttpMonitor.proxy;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(TabListMenu);

return TabListMenu;

// ********************************************************************************************* //
});
