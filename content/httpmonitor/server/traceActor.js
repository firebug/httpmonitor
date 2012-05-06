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

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

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
        // Track all FBTrace as well as all Firefox Console messages
        FBTrace.addListener(this);
        consoleService.registerListener(this);

        return {"attach": this.actorID};
    },

    onDetach: function(request)
    {
        FBTrace.removeListener(this);
        consoleService.unregisterListener(this);

        return {"detach": this.actorID};
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Trace API

    sysout: function(message, obj)
    {
        var lines = [];
        for (var frame = Components.stack; frame; frame = frame.caller)
            lines.push("@" + frame.filename + ":" + frame.lineNumber);

        try
        {
            // Just try to convert to JSON
            JSON.stringify(obj);
        }
        catch (err)
        {
            var newObj = {};
            for (var p in obj)
                newObj[p] = obj[p] + "";
            obj = newObj;
        }

        var packet = {
            "type": "sysout",
            "from": this.actorID,
            "message": message,
            "stack": lines.join("\n"),
            "object": obj,
        };

        this.conn.send(packet);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIConsoleListener

    observe: function(message)
    {
        this.sysout(message.message);
    }
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
