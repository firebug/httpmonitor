/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "remote/protocol",
    "app/httpMonitorProxy",
    "net/netMonitor",
],
function(FBTrace, Obj, Protocol, HttpMonitorProxy, NetMonitor) {

// ********************************************************************************************* //
// Implementation

function RemoteProxy(connection)
{
    this.protocol = new Protocol(connection, this);
}

RemoteProxy.prototype = Obj.extend(HttpMonitorProxy,
{
    getTabs: function(callback)
    {
        if (FBTrace.DBG_REMOTENETMONITOR)
            FBTrace.sysout("remotenet; RemoteProxy.getTabs()");

        this.protocol.getTabList(function(packet)
        {
            var result = [];
            var tabs = packet.tabs;
            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                result.push({
                    id: tab.actor,
                    label: tab.title ? tab.title : tab.url,
                })
            }

            callback(result);
        });
    },

    attach: function(context, callback)
    {
        this.context = context;

        // Initializes network context (netProgress), we don't want to observe
        // Local HTTP event in remote scenario.
        NetMonitor.initNetContext(context);

        this.protocol.selectTab(context.tab, callback);
    },

    detach: function(tabId, callback)
    {
        NetMonitor.destroyNetContext(this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listener

    onNetworkEvent: function(packet)
    {
        if (!this.context)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; No context!");
            return;
        }

        // It's the Net panel which is displaying all data coming from the server.
        var netPanel = this.context.getPanel("net", true);
        if (!netPanel)
            return;

        // Iterate all received data and populate appropriate file objects.
        for (var i=0; i<packet.files.length; i++)
        {
            var dataFile = packet.files[i];
            var file = this.context.netProgress.getRequestFile(dataFile.serial);

            // Merge incoming data into the file object.
            for (var p in dataFile)
                file[p] = dataFile[p];

            // Update UI
            netPanel.updateFile(file);
        }
    }
});

// ********************************************************************************************* //
// Registration

return RemoteProxy;

// ********************************************************************************************* //
});
