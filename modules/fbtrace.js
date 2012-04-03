/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = ["FBTrace"];

// ********************************************************************************************* //
// Service implementation

try
{
    var scope = {};
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js", scope);
    var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");
}
catch (err)
{
    var FBTrace =
    {
        sysout: function(message)
        {
            dump(message + "\n");
        }
    };
}

// ********************************************************************************************* //
