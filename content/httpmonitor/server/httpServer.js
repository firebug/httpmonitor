/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/options",
    "httpmonitor/chrome/defaultPrefs",
    "httpmonitor/lib/events",
    "httpmonitor/cache/tabCacheModel",
],
function(FBTrace, Options, DefaultPrefs, Events, TabCacheModel) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

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

            // RemoteDebugger object should exist on Fennec so, use it if the server
            // is running on Fennec
            // https://bugzilla.mozilla.org/show_bug.cgi?id=739966
            if (typeof(RemoteDebugger) != "undefined")
            {
                RemoteDebugger._start();
                dump("--> httpServer; RemoteDebugger started at: " + RemoteDebugger._getPort());
            }
            // Otherwise initialize the browser debugger.
            else if (!DebuggerServer.initialized)
            {
                DebuggerServer.init();

                // xxxHonza: Fennec doesn't have RemoteDebugger yet, so we need to
                // do yet another check
                //var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
                //var fennec = (appInfo.name != "Firefox");

                //dump("--> httpServer; Backend running on " + appInfo.name);

                //var fennec = true;
                //if (fennec)
                //    DebuggerServer.addActors("chrome://browser/content/dbg-browser-actors.js");
                //else
                //    DebuggerServer.addBrowserActors();

                try
                {
                    // Only available on Fennec
                    DebuggerServer.addActors("chrome://browser/content/dbg-browser-actors.js");
                }
                catch (err)
                {
                    // This should happen for Firefox
                    DebuggerServer.addBrowserActors();
                }

                // Open a TCP listener
                // xxxHonza: what about a pref for the port number?
                DebuggerServer.openListener(2929, false);
                dump("--> httpServer; RemoteDebugger undefined, running on port: 2929");
            }
            else
            {
                dump("--> httpServer; RemoteDebugger and DebuggerServer already initialized");
            }
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
