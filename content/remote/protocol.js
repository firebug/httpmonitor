/* See license.txt for terms of usage */

define([
    "lib/trace",
],
function(FBTrace) {

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
    // Protocol API

    getTabList: function(callback)
    {
        this.connection.sendPacket("root", "listTabs", true, callback);
    },

    selectTab: function(tab)
    {
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
    // Hooks

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

        this.listener.onNetworkEvent(packet);
    }
};

// ********************************************************************************************* //
// Registration

return Protocol;

// ********************************************************************************************* //
});
