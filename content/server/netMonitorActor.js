/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/options",
    "lib/object",
    "app/tabContext",
    "net/netMonitor",
],
function(FBTrace, Firebug, Options, Obj, TabContext, NetMonitor) {

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
    this.files = [];

    FBTrace.sysout("networkMonitorActor.constructor; " + this.actorID + ", " + this.conn);
}

NetworkMonitorActor.prototype =
{
    actorPrefix: "networkMonitor",

    grip: function()
    {
        FBTrace.sysout("networkMonitorActor.grip " + this.actorID);

        return {
            actor: this.actorID
        };
    },

    onPing: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onPing ", request);
        return {"pong": this.actorID};
    },

    onSubscribe: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onSubscribe;", request);

        try
        {
            this.context = new TabContext(this.tab);

            // xxxHonza, hack, the global must go away.
            Firebug.currentContext = this.context;

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
            FBTrace.sysout(err.stack);
            FBTrace.sysout("networkMonitorActor.onSubscribe; EXCEPTION " + err, err);
        }

        return {"subscribe": this.actorID};
    },

    onUnsubscribe: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onUnsubscribe;", request);

        if (this.context)
        {
            this.context.netProgress.activate(null);
            NetMonitor.destroyContext(this.context);
            NetMonitor.shutdown();

            this.context = null;

            // xxxHonza, hack, the global must go away.
            Firebug.currentContext = null;
        }

        return {"unsubscribe": this.actorID};
    },

    disconnect: function()
    {
        FBTrace.sysout("networkMonitorActor.disconnet");

        this.onUnsubscribe();

        delete this.tab.networkMonitorActor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Monitor Handler

    updateFile: function(file)
    {
        this.files.push(file.clone());
        this.flush([file]);
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
        // Send all collected data and reset all.
        this.onFlushData(this.files);
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
    "unsubscribe": NetworkMonitorActor.prototype.onUnsubscribe
};

// ********************************************************************************************* //
// Network Monitor Actor Handler

function networkMonitorActorHandler(tab, request)
{
    FBTrace.sysout("networkMonitorActorHandler ", {tab: tab, request: request});

    //xxxHonza: Just a left over from DCamp's example?
    // Reuse a previously-created actor, if any.
    //if (tab.sampleContextActor)
    //    return tab.sampleContextActor;

    var actor = new NetworkMonitorActor(tab);
    tab.networkMonitorActor = actor;
    tab.contextActorPool.addActor(actor);

    FBTrace.sysout("networkMonitorActor created for tab: " + tab);

    return actor.grip();
}

DebuggerServer.addTabRequest("networkMonitorActor", networkMonitorActorHandler);

// ********************************************************************************************* //
});
