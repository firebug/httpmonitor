/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = [];

// ********************************************************************************************* //
// Firebug Trace - FBTrace

var Cu = Components.utils;
var scope = {};

try
{
    Cu.import("resource://fbtrace/firebug-trace-service.js", scope);
}
catch (err)
{
    scope.traceConsoleService =
    {
        getTracer: function(prefDomain)
        {
            var TraceAPI = ["dump", "sysout", "setScope", "matchesNode", "time", "timeEnd"];
            var TraceObj = {};
            for (var i=0; i<TraceAPI.length; i++)
                TraceObj[TraceAPI[i]] = function() {};

            TraceObj.sysout = function(msg)
            {
                try
                {
                    Cu.import("resource://fbtrace/firebug-trace-service.js", scope);
                    var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");
                    FBTrace.sysout.apply(FBTrace, arguments);
                }
                catch (err)
                {
                    //Cu.reportError(getStackDump());
                    Cu.reportError(msg);
                }

            }

            return TraceObj;
        }
    };
}

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");

// xxxHonza
//FBTrace.DBG_NET = true;
//FBTrace.DBG_INITIALIZE = true;
//FBTrace.DBG_NET_EVENTS = true;
FBTrace.DBG_ERRORS = true;
//FBTrace.DBG_ACTIVITYOBSERVER = true;
//FBTrace.DBG_HTTPOBSERVER = true;
//FBTrace.DBG_OPTIONS = true;
//FBTrace.DBG_CACHE = true;
//FBTrace.DBG_REMOTENETMONITOR = true;
//FBTrace.DBG_REMOTEBUG = true;

// ********************************************************************************************* //
