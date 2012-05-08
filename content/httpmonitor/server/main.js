/* See license.txt for terms of usage */

(function(scope) {

// ********************************************************************************************* //

var Cu = Components.utils;
var require = Cu.import("resource://httpmonitor/modules/mini-require.js").require;

var config = {};
config.baseUrl = "resource://httpmonitor/content";

/**
 * Load server
 */
require(config, [
    "httpmonitor/lib/trace",
    "httpmonitor/server/httpServer",
    "httpmonitor/cache/tabCache",
],
function(FBTrace, HttpServer) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

// ********************************************************************************************* //
// Initialization

try
{
    HttpServer.initialize();

    // Load actors after the server is initialized.
    require(config, [
        "httpmonitor/server/netMonitorActor",
        "httpmonitor/server/traceActor"
    ], function() {
        consoleService.logStringMessage("HttpServer; Running at port: 2929");
    });

    // Set back-reference for the bootstrap.js so, shutdown can be sent to HttpServer object.
    scope.HttpServer = HttpServer;
}
catch (e)
{
    FBTrace.sysout("main.initialize; EXCEPTION " + e, e);
}

// ********************************************************************************************* //
})})(this);
