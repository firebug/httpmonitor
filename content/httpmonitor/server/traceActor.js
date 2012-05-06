/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Globals

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //
// Trace Actor Implementation

function TraceActor()
{
    this.entries = {};
}

TraceActor.prototype =
{
    actorPrefix: "trace",

    grip: function()
    {
        return {
            actor: this.actorID
        };
    },

    disconnect: function()
    {
        this.onDetach();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Actor Commands

    onPing: function(request)
    {
        return {"pong": this.actorID};
    },

    onAttach: function(request)
    {
        FBTrace.addListener(this);
        return {"attach": this.actorID};
    },

    onDetach: function(request)
    {
        FBTrace.removeListener(this);
        return {"detach": this.actorID};
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Trace API

    sysout: function(message, obj)
    {
        var packet = {
            "type": "sysout",
            "from": this.actorID,
            "message": message
        };

        this.conn.send(packet);
    },
};

/**
 * Request type definitions.
 */
TraceActor.prototype.requestTypes =
{
    "attach": TraceActor.prototype.onAttach,
    "detach": TraceActor.prototype.onDetach,
};

// ********************************************************************************************* //
// Trace Actor Handler

function traceActorHandler(rootActor, request)
{
    // Reuse a previously-created actor, if any.
    if (rootActor.traceActor)
        return rootActor.traceActor;

    var actor = new TraceActor(rootActor);
    rootActor.traceActor = actor;
    rootActor.conn.addActor(actor);

    return actor.grip();
}

// xxxHonza: I believe this should be part of dbg-browser-actor.js
DebuggerServer.addRequest = function DS_addTabRequest(aName, aFunction) {
  DebuggerServer.BrowserRootActor.prototype.requestTypes[aName] = function(aRequest) {
    return aFunction(this, aRequest);
  }
};

DebuggerServer.addRequest("traceActor", traceActorHandler);

// ********************************************************************************************* //
});
