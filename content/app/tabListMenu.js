/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/object",
    "remote/module",
    "chrome/menu",
    "lib/string",
    "app/httpMonitorProxy",
],
function(FBTrace, Firebug, Obj, RemoteModule, Menu, Str, HttpMonitorProxy) {

// ********************************************************************************************* //
// Module

/**
 * @module
 */
var TabListMenu = Obj.extend(Firebug.Module,
/** @lends TabListMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.updateUI();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XUL Event Handlers

    onShowing: function(popup)
    {
        var self = this;
        var proxy = this.getProxy();

        proxy.getTabs(function(tabs)
        {
            // Populate the popup menu with entries (list of tab titles).
            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                var item = {
                    nol10n: true,
                    label: tab.label,
                    type: "radio",
                    checked: self.currentTab == tab,
                    command: self.selectTab.bind(self, tab)
                };
                Menu.createMenuItem(popup, item);
            }
        });

        // xxxHonza: show one menu item with a throbber.

        // Yep, show the menu immediattely. It'll be populated asynchronously.
        return true;
    },

    onHidden: function(popup)
    {
        // As soon as the list of tabs (a popup menu) is closed let's remove all menu items.
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    updateUI: function()
    {
        var menu = Firebug.chrome.$("httpMonitorTabListMenu");
        var isConnected = RemoteModule.isConnected();

        var proxy = this.getProxy();

        var label = "Select Tab";
        var tab = proxy.getCurrentTab();
        if (tab)
            label = Str.cropString(tab.title, 100);

        menu.setAttribute("label", label + " ");
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
    // HTTP Monitor Proxy Listener

    onTabSelected: function(tabActor)
    {
        this.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    selectTab: function(tab)
    {
        // Attach to the selected tab (actor)
        var proxy = this.getProxy();
        proxy.attach(tab);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Proxy

    getProxy: function()
    {
        //xxxHonza: Could we get the proxy without using the app singleton?
        return top.HttpMonitor.proxy;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(TabListMenu);

return TabListMenu;

// ********************************************************************************************* //
});
