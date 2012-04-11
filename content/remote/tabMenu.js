/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/object",
    "remote/module",
    "chrome/menu",
    "lib/string",
],
function(FBTrace, Firebug, Obj, RemoteModule, Menu, Str) {

// ********************************************************************************************* //
// Module

/**
 * @module
 */
var RemoteTabMenu = Obj.extend(Firebug.Module,
/** @lends RemoteTabMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        RemoteModule.addListener(this);
        //this.updateUI();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        RemoteModule.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menu

    updateUI: function()
    {
        var menu = Firebug.chrome.$("httpMonitorRemoteTabMenu");
        var isConnected = RemoteModule.isConnected();

        var label = "Connect Me!";
        if (isConnected)
            label = "Select Remote Tab";

        var tab = RemoteModule.getCurrentTab();
        if (tab)
            label = Str.cropString(tab.title, 100);

        menu.setAttribute("label", label + " ");
        menu.setAttribute("tooltiptext", tab ? tab.url : "Remote tab not selected");

        // Set tooltip for the Connect button.
        var connectItem = Firebug.chrome.$("fbRemoteConnect");
        connectItem.setAttribute("tooltiptext",
            "Use following preferences:\n\nextensions.firebug.remotebug.serverHost\n" +
            "extensions.firebug.remotebug.serverPort");

    },

    onMenuShowing: function(popup)
    {
        var isConnected = RemoteModule.isConnected();
        Firebug.chrome.$("cmd_httpMonitorConnect").setAttribute("disabled", isConnected ? "true" : "false");
        Firebug.chrome.$("cmd_httpMonitorDisconnect").setAttribute("disabled", isConnected ? "false" : "true");

        // Remove previous fetched tabs.
        while (popup.childNodes.length > 2)
            popup.removeChild(popup.lastChild);

        if (!isConnected)
            return;

        // Get list of opened tabs from the server.
        var self = this;
        RemoteModule.getTabList(function(packet)
        {
            if (popup.state != "showing")
                return;

            Menu.createMenuSeparator(popup);

            var currentTabActor = RemoteModule.getCurrentTabActor();
            var tabs = packet.tabs;

            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                var item = {
                    label: tab.title ? tab.title : tab.url,
                    type: "radio",
                    checked: currentTabActor == tab.actor,
                    command: Obj.bindFixed(self.selectTab, self, tab)
                };
                Menu.createMenuItem(popup, item);
            }
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Model Listener

    onConnect: function()
    {
        this.updateUI();
    },

    onDisconnect: function()
    {
        this.updateUI();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Model Commands

    selectTab: function(tab)
    {
        // Attach to the selected tab (actor)
        RemoteModule.selectTab(tab);
    },

    onTabSelected: function(tabActor)
    {
        this.updateUI();
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(RemoteTabMenu);

return RemoteTabMenu;

// ********************************************************************************************* //
});
