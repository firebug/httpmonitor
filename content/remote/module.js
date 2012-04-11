/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/object",
    "lib/events",
    "lib/options",
    "remote/connection"
],
function(FBTrace, Firebug, Obj, Events, Options, Connection) {

// ********************************************************************************************* //
// Module

/**
 * @module
 */
var RemoteModule = Obj.extend(Firebug.Module,
/** @lends RemoteModule */
{
    currentTab: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; RemoteNetModule.initialize");

        var onConnect = Obj.bind(this.onConnect, this);
        var onDisconnect = Obj.bind(this.onDisconnect, this);

        // Create connection.
        //this.connection = new Connection(onConnect, onDisconnect);

        // Connect by default
        //this.connect();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        //this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Server Connection

    isConnected: function()
    {
        return (this.connection && this.connection.isConnected());
    },

    getConnection: function()
    {
        return this.connection;
    },

    connect: function()
    {
        if (this.isConnected())
        {
            if (FBTrace.DBG_REMOTEBUG)
                FBTrace.sysout("remotebug; Already connected!");
            return;
        }

        // Connect remote server
        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Connecting to " + host + ":" + port + " ...");

        try
        {
            this.connection.open(host, port);
        }
        catch (err)
        {
            if (FBTrace.DBG_REMOTEBUG || FBTrace.DBG_ERRORS)
                FBTrace.sysout("remotebug; connect EXCEPTION " + err, err);
        }
    },

    disconnect: function()
    {
        if (!this.isConnected())
            return;

        try
        {
            this.connection.close();
        }
        catch(err)
        {
            if (FBTrace.DBG_REMOTEBUG || FBTrace.DBG_ERRORS)
                FBTrace.sysout("remotebug; disconnect EXCEPTION " + err, err);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection hooks

    onConnect: function()
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Connected OK");

        Events.dispatch(this.fbListeners, "onConnect");
    },

    onDisconnect: function()
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Disconnected");

        this.currentTab = null;

        Events.dispatch(this.fbListeners, "onDisconnect");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Remote Tabs

    getTabList: function(callback)
    {
        if (this.isConnected())
            this.connection.sendPacket("root", "listTabs", true, callback);
    },

    selectTab: function(tab)
    {
        if (!this.isConnected())
            return;

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Selected remote tab: " + tab.title, tab);

        var self = this;
        this.connection.sendPacket(tab.actor, "attach", true, function(packet)
        {
            if (FBTrace.DBG_REMOTEBUG)
                FBTrace.sysout("remotebug; Remote tab selected: " + packet.from, packet);

            self.currentTab = tab;

            self.onTabSelected(tab.actor);

            Events.dispatch(self.fbListeners, "onTabSelected", [tab.actor]);
        });
    },

    getCurrentTab: function()
    {
        return this.currentTab;
    },

    getCurrentTabActor: function()
    {
        return this.currentTab ? this.currentTab.actor : null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Remote Protocol API

    getNetActor: function(tabActor, callback)
    {
        var conn = this.getConnection();
        conn.sendPacket(tabActor, "networkMonitorActor", true, callback);
    },

    subscribe: function(netActor, callback)
    {
        if (this.currentSubscription)
            this.unsubscribe(this.currentSubscription);

        var conn = this.getConnection();
        conn.sendPacket(netActor, "subscribe", false, callback);
        this.currentSubscription = netActor;
    },

    unsubscribe: function(netActor)
    {
        var conn = this.getConnection();
        conn.removeCallback(netActor);
        conn.sendPacket(netActor, "unsubscribe", true, function(packet)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; Unsubscribed from: " + packet.from);
            return;
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // RemoteBug.Module Listener

    /**
     * Executed by RemoteBug.Module if a remote tab is selected.
     * @param {Object} tab The selcted tab descriptor
     */
    onTabSelected: function(tabActor)
    {
        var self = this;
        var callback = Obj.bind(this.onNetworkEvent, this);

        // A tab has been selected so, subscribe to the Net monitor actor. The callback
        // will receive events about any HTTP traffic within the target tab.
        this.getNetActor(tabActor, function(packet)
        {
            self.subscribe(packet.actor, callback);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // NetActor Events

    onNetworkEvent: function(packet)
    {
        if (packet.subscribe)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; Subscribed to: " + packet.from);
            return;
        }

        if (packet.type != "notify")
            return;

        if (FBTrace.DBG_REMOTENETMONITOR)
            FBTrace.sysout("remotenet; HTTP activity received from: " + packet.from, packet);

        var context = Firebug.currentContext;
        if (!context)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; No context!");
            return;
        }

        var netPanel = context.getPanel("net", true);
        if (!netPanel)
            return;

        for (var i=0; i<packet.files.length; i++)
        {
            var file = packet.files[i];
            netPanel.updateFile(file);
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(RemoteModule);

return RemoteModule;

// ********************************************************************************************* //
});
