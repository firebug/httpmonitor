/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = [];

// ********************************************************************************************* //
// Firebug Trace - FBTrace

var scope = {};

try
{
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js", scope);
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
            return TraceObj;
        }
    };
}

var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");

// xxxHonza
//FBTrace.DBG_NET = true;
//FBTrace.DBG_INITIALIZE = true;
//FBTrace.DBG_NET_EVENTS = true;
FBTrace.DBG_ERRORS = true;
//FBTrace.DBG_ACTIVITYOBSERVER = true;
//FBTrace.DBG_HTTPOBSERVER = true;
//FBTrace.DBG_OPTIONS = true;
FBTrace.DBG_CACHE = true;

// ********************************************************************************************* //
