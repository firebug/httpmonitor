/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "remote/protocol",
    "app/httpMonitorProxy"
],
function(FBTrace, Obj, Protocol, HttpMonitorProxy) {

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
        this.protocol.selectTab(context.tab, callback);
    },

    detach: function(tabId, callback)
    {
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

        var netPanel = this.context.getPanel("net", true);
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

return RemoteProxy;

// ********************************************************************************************* //
});
