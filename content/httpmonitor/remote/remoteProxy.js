/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/remote/protocol",
    "httpmonitor/base/proxy",
    "httpmonitor/net/netMonitor",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Obj, Protocol, Proxy, NetMonitor, Chrome) {

// ********************************************************************************************* //
// Implementation

function RemoteProxy(connection)
{
    this.protocol = new Protocol(connection, this);
}

RemoteProxy.prototype = Obj.extend(Proxy,
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
        Proxy.attach.apply(this, arguments);

        // Initialize only the network context (netProgress). Do not initialize the
        // network monitor now since we don't want to observe local HTTP events in
        // remote scenario.
        NetMonitor.initNetContext(context);

        // Before selecting a remote tab, attach to the remote tracing actor.
        // This allows to get all logs from the server side and display them
        // within client side tracing console.
        var self = this;
        this.protocol.attachTrace(function(packet)
        {
            self.protocol.selectTab(context.tab, callback);
        });
    },

    detach: function()
    {
        NetMonitor.destroyNetContext(this.context);

        Proxy.detach.apply(this, arguments);
    },

    sendRequest: function(file, callback)
    {
        var data = {
            href: file.href,
            method: file.method,
            requestHeaders: file.requestHeaders,
            postText: file.postText
        }

        this.protocol.sendRequest(data, callback);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listener

    onTabNavigated: function(tabActor)
    {
        if (!this.context)
        {
            if (FBTrace.DBG_REMOTENETMONITOR)
                FBTrace.sysout("remotenet; No context!");
            return;
        }

        // New page loaded, bail out if 'Persist' is active.
        //xxxHonza: Fix me
        if (Chrome.getGlobalAttribute("cmd_togglePersistNet", "checked"))
            return;

        // Clear the UI.
        var netPanel = this.context.getPanel("net", true);
        if (netPanel)
            netPanel.clear();

        // Clear the underlying data structure.
        this.context.netProgress.clear();
    },

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
    },

    onTraceEvent: function(packet)
    {
        if (!packet.message)
            return;

        if (packet.object && packet.stack)
            packet.object.stack = packet.stack;

        FBTrace.sysout("--> Server: " + packet.message, packet.object);
    }
});

// ********************************************************************************************* //
// Registration

return RemoteProxy;

// ********************************************************************************************* //
});
