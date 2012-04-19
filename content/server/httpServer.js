/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/options",
    "app/firebug",
    "chrome/defaultPrefs",
    "lib/events",
    "cache/tabCacheModel",
],
function(FBTrace, Options, Firebug, DefaultPrefs, Events, TabCacheModel) {

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

        //xxHonza Duplicated in HttpMonitor.
        // Some modules like TabCacheModule needs to be initialized even in the server scenario.
        Options.initialize("extensions.httpmonitor");
        Options.registerDefaultPrefs(DefaultPrefs);

        TabCacheModel.initialize();
        TabCacheModel.initializeUI();

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
