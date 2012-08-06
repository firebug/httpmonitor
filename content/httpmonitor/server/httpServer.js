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

        // TODO: this initialization is happening way too soon. The server
        // should be started when the user launches the tool from the UI.
        try
        {
            Components.utils.import("resource://gre/modules/devtools/dbg-server.jsm");

            // RemoteDebugger object should exist on Fennec so, use it if the server
            // is running on Fennec
            // https://bugzilla.mozilla.org/show_bug.cgi?id=739966
            if (typeof(RemoteDebugger) != "undefined")
            {
                RemoteDebugger.init();
            }
            // Otherwise initialize the browser debugger.
            else
            {
                if (!DebuggerServer.initialized)
                {
                    // Initialize the server (e.g. appends script debugger actors)
                    DebuggerServer.init(HttpServer._allowConnection);
                    DebuggerServer.addBrowserActors();
                }
                // Open a TCP listener
                DebuggerServer.openListener(Services.prefs.getIntPref("devtools.debugger.remote-port"));
            }
        }
        catch (ex)
        {
            FBTrace.sysout("HttpServer; EXCEPTION Couldn't start debugging server: " + ex);
        }
    },

    shutdown: function()
    {
        FBTrace.sysout("HttpServer; shutdown");

        DebuggerServer.closeListener();
    },

    /**
     * Prompt the user to accept or decline the incoming connection.
     *
     * @return true if the connection should be permitted, false otherwise
     */
    _allowConnection: function()
    {
        let title = "Incoming Connection";
        let msg = "An incoming request to permit remote debugging connection was detected. A remote client can take complete control over your browser! Allow connection?";
        let disableButton = "Disable";
        let prompt = Services.prompt;
        let flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_OK +
                    prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_CANCEL +
                    prompt.BUTTON_POS_2 * prompt.BUTTON_TITLE_IS_STRING +
                    prompt.BUTTON_POS_1_DEFAULT;
        let result = prompt.confirmEx(null, title, msg, flags, null, null,
                                      disableButton, null, { value: false });
        if (result == 0) {
            return true;
        }
        if (result == 2) {
            DebuggerServer.closeListener(true);
            Services.prefs.setBoolPref("devtools.debugger.remote-enabled", false);
        }
        return false;
    },
}

// ********************************************************************************************* //
// Registration

return HttpServer;

// ********************************************************************************************* //
});
