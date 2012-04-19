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
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

// ********************************************************************************************* //
// Initialization

try
{
    HttpServer.initialize();

    // Load net actor after the server is initialized.
    require(config, ["server/netMonitorActor"], function()
    {
        consoleService.logStringMessage("HttpServer; Running at port: 2929");
    });
}
catch (e)
{
    FBTrace.sysout("main.initialize; EXCEPTION " + e, e);
}

// ********************************************************************************************* //
})})();
