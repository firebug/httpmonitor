/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/options",
],
function(FBTrace, Options) {

// ********************************************************************************************* //
// Module

var HttpServer =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        var serverMode = Options.getPref("extensions.httpmonitor", "serverMode");
        if (!serverMode)
            return;

        try
        {
            Components.utils.import("resource:///modules/devtools/dbg-server.jsm");

            // Initialize the browser debugger.
            if (!DebuggerServer.initialized)
            {
                DebuggerServer.init();
                DebuggerServer.addBrowserActors();
            }

            // Open a TCP listener
            // xxxHonza: what about a pref for the port number?
            DebuggerServer.openListener(2929, false);

            FBTrace.sysout("HttpServer; Running at port: 2929");
        }
        catch (ex)
        {
            FBTrace.sysout("HttpServer; EXCEPTION Couldn't start debugging server: " + ex);
        }
    },

    shutdown: function()
    {
    },
}

// ********************************************************************************************* //
// Registration

return HttpServer;

// ********************************************************************************************* //
});
