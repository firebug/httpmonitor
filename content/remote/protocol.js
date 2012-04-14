/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
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
    // Protocol API

    getTabList: function(callback)
    {
        this.connection.sendPacket("root", "listTabs", true, callback);
    },

    selectTab: function(tab, callback)
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Selected remote tab: " + tab.id, tab);

        var self = this;
        this.connection.sendPacket(tab.id, "attach", true, function(packet)
        {
            if (FBTrace.DBG_REMOTEBUG)
                FBTrace.sysout("remotebug; Remote tab selected: " + packet.from, packet);

            self.currentTab = tab;

            self.onTabSelected(tab.id);

            callback();

            //Events.dispatch(self.fbListeners, "onTabSelected", [tab.id]);
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
        this.connection.sendPacket(tabActor, "networkMonitorActor", true, callback);
    },

    subscribe: function(netActor, callback)
    {
        if (this.currentSubscription)
            this.unsubscribe(this.currentSubscription);

        this.connection.sendPacket(netActor, "subscribe", false, callback);
        this.currentSubscription = netActor;
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

        this.listener.onNetworkEvent(packet);
    }
};

// ********************************************************************************************* //
// Registration

return Protocol;

// ********************************************************************************************* //
});
