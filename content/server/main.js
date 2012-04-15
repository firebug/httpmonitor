/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //

var Cu = Components.utils;
var require = Cu.import("resource://httpmonitor/modules/mini-require.js").require;

var config = {};
config.baseUrl = "resource://httpmonitor/content";

/**
 * Load server
 */
require(config, [
    "lib/trace",
    "server/httpServer",
    "js/tabCache",
],
function(FBTrace, HttpServer) {

// ********************************************************************************************* //

try
{
    HttpServer.initialize();

    // Load net actor after the server is initialized.
    require(config, ["server/netMonitorActor"], function()
    {
        FBTrace.sysout("HttpServer; Initialized OK");
    });
}
catch (e)
{
    FBTrace.sysout("main.initialize; EXCEPTION " + e, e);
}

// ********************************************************************************************* //
})})();
