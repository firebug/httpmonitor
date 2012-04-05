/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = ["FBTrace"];

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

// ********************************************************************************************* //
