/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/options",
    "httpmonitor/lib/object",
    "httpmonitor/chrome/tabContext",
    "httpmonitor/net/netMonitor",
    "httpmonitor/lib/array",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Options, Obj, TabContext, NetMonitor, Arr, Chrome) {

// ********************************************************************************************* //
// Globals

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource:///modules/devtools/dbg-server.jsm");

var postDataTimeout = Options.get("postDataTimeout");
var Timer = Cc["@mozilla.org/timer;1"];

// ********************************************************************************************* //
// Network Monitor Actor Implementation

function NetworkMonitorActor(tab)
{
    this.conn = tab.conn;
    this.tab = tab;
    this.files = {};

    if (FBTrace.DBG_NETACTOR)
        FBTrace.sysout("networkMonitorActor.constructor;");
}

NetworkMonitorActor.prototype =
{
    actorPrefix: "networkMonitor",

    grip: function()
    {
        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.grip " + this.actorID);

        return {
            actor: this.actorID
        };
    },

    disconnect: function()
    {
        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.disconnet");

        this.onUnsubscribe();

        delete this.tab.networkMonitorActor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Actor Commands

    onPing: function(request)
    {
        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.onPing ", request);

        return {"pong": this.actorID};
    },

    onSubscribe: function(request)
    {
        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.onSubscribe;", request);

        try
        {
            this.context = new TabContext(this.tab);

            // xxxHonza, hack, the global must go away.
            Chrome.currentContext = this.context;

            // Initialize NetMonitor module
            NetMonitor.initialize();

            // Initialize context and attach HTTP handlers (local observers)
            NetMonitor.initContext(this.context);

            // Attach |this| object actor to the network context. All HTTP events
            // will be forwarded into |updateFile| method.
            this.context.netProgress.activate(this);
        }
        catch (err)
        {
            if (FBTrace.DBG_NETACTOR || FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout(err.stack);
                FBTrace.sysout("networkMonitorActor.onSubscribe; EXCEPTION " + err, err);
            }
        }

        return {"subscribe": this.actorID};
    },

    onUnsubscribe: function(request)
    {
        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.onUnsubscribe;", request);

        if (this.context)
        {
            this.context.netProgress.activate(null);
            NetMonitor.destroyContext(this.context);
            NetMonitor.shutdown();

            this.context = null;

            // xxxHonza, hack, the global must go away.
            Chrome.currentContext = null;
        }

        return {"unsubscribe": this.actorID};
    },

    onSendRequest: function(request)
    {
        var file = request.data;
        NetMonitor.sendRequest(this.context, file);

        return {"sendRequest": this.actorID};
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Monitor Handler

    updateFile: function(file)
    {
        if (!file.serial)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("netMonitorActor.updateFile; ERROR No serial!");
            return;
        }

        // xxxHonza: Sent data should be removed from the original file object so,
        // they are not sent to the client again.
        this.files[file.serial] = file.clone();
        this.flush();
    },

    clear: function()
    {
        if (this.flushTimer)
            this.flushTimer.cancel();

        this.flushTimer = null;
        this.files = [];
    },

    flush: function()
    {
        // If timeout already in progress than bail out.
        if (this.flushTimer)
            return;

        this.flushTimer = Timer.createInstance(Ci.nsITimer);
        this.flushTimer.initWithCallback(this, postDataTimeout, Ci.nsITimer.TYPE_ONE_SHOT);
    },

    notify: function(timer)
    {
        // Send all collected data.
        //xxxHonza: data already sent to the client should not be send again
        // (especially not the response body)
        var data = Arr.values(this.files);
        if (data.length)
            this.onFlushData(data);

        // Reset timer and data.
        this.flushTimer = null;
        this.files = [];
    },

    onFlushData: function(data)
    {
        var packet = {
            "type": "notify",
            "from": this.actorID,
            "files": data
        };

        if (FBTrace.DBG_NETACTOR)
            FBTrace.sysout("networkMonitorActor.onFlushData;", packet);

        // Send network notification.
        this.conn.send(packet);
    }
};

/**
 * Request type definitions.
 */
NetworkMonitorActor.prototype.requestTypes =
{
    "ping": NetworkMonitorActor.prototype.onPing,
    "subscribe": NetworkMonitorActor.prototype.onSubscribe,
    "unsubscribe": NetworkMonitorActor.prototype.onUnsubscribe,
    "sendRequest": NetworkMonitorActor.prototype.onSendRequest,
};

// ********************************************************************************************* //
// Network Monitor Actor Handler

function networkMonitorActorHandler(tab, request)
{
    // Reuse a previously-created actor, if any.
    if (tab.networkMonitorActor)
        return tab.networkMonitorActor.grip();

    var actor = new NetworkMonitorActor(tab);
    tab.networkMonitorActor = actor;

    // xxxHonza: this needs to be reviewed by Panos
    // If it's added into the tabActorPool, disconnect is not executed for the actor.
    //tab.tabActorPool.addActor(actor);
    tab.conn.addActor(actor);

    if (FBTrace.DBG_NETACTOR)
        FBTrace.sysout("networkMonitorActorHandler ", {tab: tab, request: request});

    return actor.grip();
}

DebuggerServer.addTabActor("networkMonitorActor", NetworkMonitorActor);

// ********************************************************************************************* //
});
