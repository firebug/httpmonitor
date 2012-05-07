/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
],
function(FBTrace, Obj) {

// ********************************************************************************************* //
// Implementation

function Protocol(connection, listener)
{
    this.connection = connection;
    this.listener = listener;
}

Protocol.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Trace API

    attachTrace: function(callback)
    {
        var traceEvent = Obj.bind(this.onTraceEvent, this);

        var self = this;
        this.connection.sendPacket("root", "traceActor", true, function(packet)
        {
            self.currentTraceActor = packet.actor;
            self.connection.sendPacket(packet.actor, "attach", false, traceEvent);
            callback();
        });
    },

    detachTrace: function(callback)
    {
        this.connection.sendPacket(this.currentTraceActor.id, "detach", true, function()
        {
            this.currentTraceActor = null;
            callback();
        });
    },

    onTraceEvent: function(packet)
    {
        this.listener.onTraceEvent(packet);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Monitor API

    getTabList: function(callback)
    {
        this.connection.sendPacket("root", "listTabs", true, callback);
    },

    selectTab: function(tab, callback)
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Selected remote tab: " + tab.id, tab);

        if (this.currentTab)
            this.unselectTab(this.currentTab)

        var self = this;
        this.connection.sendPacket(tab.id, "attach", true, function(packet)
        {
            if (FBTrace.DBG_REMOTEBUG)
                FBTrace.sysout("remotebug; Remote tab selected: " + packet.from, packet);

            self.currentTab = tab;

            self.onTabSelected(tab);

            callback();

            // xxxHonza; do we need this?
            //Events.dispatch(self.fbListeners, "onTabSelected", [tab.id]);
        });
    },

    unselectTab: function(tabActor)
    {
        this.onTabUnselected(tabActor);
    },

    getCurrentTab: function()
    {
        return this.currentTab;
    },

    getCurrentTabActor: function()
    {
        return this.currentTab ? this.currentTab.actor : null;
    },

    getNetActor: function(tabActor, callback)
    {
        this.connection.sendPacket(tabActor, "networkMonitorActor", true, callback);
    },

    subscribe: function(netActor, callback)
    {
        if (this.currentNetActor)
            this.unsubscribe(this.currentNetActor);

        this.connection.sendPacket(netActor, "subscribe", false, callback);
        this.currentNetActor = netActor;
    },

    unsubscribe: function(netActor)
    {
        this.connection.removeCallback(netActor);
        this.connection.sendPacket(netActor, "unsubscribe", true, function(packet)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; Unsubscribed from: " + packet.from);
            return;
        });
    },

    sendRequest: function(data, callback)
    {
        this.connection.sendPacket(this.currentNetActor, "sendRequest", true, callback, data);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Executed by RemoteBug.Module if a remote tab is selected.
     * @param {Object} tabActor The selected tab descriptor
     */
    onTabSelected: function(tabActor)
    {
        var self = this;
        var netEvent = Obj.bind(this.onNetworkEvent, this);
        var tabNavigated = Obj.bind(self.onTabNavigated, self);

        // A tab has been selected so, subscribe to the Net monitor actor. The callback
        // will receive events about any HTTP traffic within the target tab.
        this.getNetActor(tabActor.id, function(packet)
        {
            self.subscribe(packet.actor, netEvent);

            // Also register callback for 'tabNavigated' events.
            self.connection.addCallback(tabActor.id, tabNavigated, false);
        });
    },

    onTabUnselected: function(tabActor)
    {
        this.connection.removeCallback(tabActor.id);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hooks

    /**
     * Executed when the remote attached tab is reloaded
     * @param {Object} tabActor The selected tab descriptor
     */
    onTabNavigated: function(packet)
    {
        if (FBTrace.DBG_REMOTENETMONITOR)
            FBTrace.sysout("remotenet; onTabNavigated: " + packet.from);

        if (packet.type != "tabNavigated")
            return;

        try
        {
            this.listener.onTabNavigated(packet);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Protocol.onNetworkEvent; EXCEPTION " + e, e);
        }
    },

    /**
     * Executed when NetworkMonitorActor send data about server side HTTP activity
     * @param {Object} packet
     */
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

        try
        {
            this.listener.onNetworkEvent(packet);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Protocol.onNetworkEvent; EXCEPTION " + e, e);
        }
    }
};

// ********************************************************************************************* //
// Registration

return Protocol;

// ********************************************************************************************* //
});
