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

Components.utils.import("resource:///modules/devtools/dbg-server.jsm");

// ID generator
var gSerialNumber = 0;

// ********************************************************************************************* //
// Network Monitor Actor Implementation

function NetworkMonitorActor(tab)
{
    this.conn = tab.conn;
    this.tab = tab;
    this.serial = gSerialNumber++;
    this.networkMonitor = null;

    FBTrace.sysout("networkMonitorActor.constructor; " + this.serial + ", " + this.conn);
}

NetworkMonitorActor.prototype =
{
    actorPrefix: "networkMonitor",

    grip: function()
    {
        FBTrace.sysout("networkMonitorActor.grip " + this.actorID + ", " + this.serial);

        return {
            actor: this.actorID,
            serial: this.serial
        };
    },

    onPing: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onPing ", request);
        return {"pong": this.serial};
    },

    onSubscribe: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onSubscribe;", request);

        if (this.networkMonitor)
        {
            FBTrace.sysout("networkMonitorActor.onSubscribe; ERROR Already subscribed",
                this.networkMonitor);
        }

        try
        {
            this.context = new TabContext(this.tab);

            // xxxHonza, hack, the global must go away.
            Firebug.currentContext = this.context;

            NetMonitor.initialize();

            NetMonitor.initContext(this.context);
            NetMonitor.loadedContext(this.context);
            NetMonitor.showContext(this.context);

            this.context.netProgress.activate(this);
        }
        catch (err)
        {
            FBTrace.sysout(err.stack);
            FBTrace.sysout("networkMonitorActor.onSubscribe; EXCEPTION " + err, err);
        }

        return {"subscribe": this.serial};
    },

    onUnsubscribe: function(request)
    {
        FBTrace.sysout("networkMonitorActor.onUnsubscribe;", request);

        if (this.context)
        {
            NetMonitor.destroyContext(this.context);
            NetMonitor.shutdown();

            this.context = null;
        }

        return {"unsubscribe": this.serial};
    },

    disconnect: function()
    {
        FBTrace.sysout("networkMonitorActor.disconnet");

        this.onUnsubscribe();

        delete this.tab.networkMonitorActor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Monitor

    updateFile: function(file)
    {
        var request = file.request;
        delete file.request;

        var phase = file.phase
        delete file.phase;

        this.onFlushData([file]);

        file.request = request;
        file.phase = phase;
    },

    onFlushData: function(data)
    {
        var packet = {
            "type": "notify",
            "from": this.actorID,
            //"serial": this.serial,
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

    // Reuse a previously-created actor, if any.
    if (tab.sampleContextActor)
        return tab.sampleContextActor;


    var actor = new NetworkMonitorActor(tab);
    tab.networkMonitorActor = actor;
    tab.contextActorPool.addActor(actor);

    FBTrace.sysout("networkMonitorActor created for tab: " + tab);

    return actor.grip();
}

DebuggerServer.addTabRequest("networkMonitorActor", networkMonitorActorHandler);

// ********************************************************************************************* //
});
