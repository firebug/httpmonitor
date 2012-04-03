/* See license.txt for terms of usage */

(function() {
// ********************************************************************************************* //

var config = {};
config.baseUrl = "resource://httpmonitor/content";

/**
 * Load application
 */
require(config, [
    "app/httpMonitor",
    "lib/trace"
],
function(HttpMonitor, FBTrace) {

// ********************************************************************************************* //

// This is the only application global (within monitor.xul window)
top.HttpMonitor = HttpMonitor;

function initialize()
{
    window.removeEventListener("load", initialize, false);
    HttpMonitor.initialize(this);
}

function shutdown()
{
    window.removeEventListener("unload", shutdown, false);
    HttpMonitor.shutdown();
}

// Register window listeners so, we can manage application life-time.
window.addEventListener("load", initialize, false);
window.addEventListener("unload", shutdown, false);

FBTrace.sysout("httpMonitor; Initialized");

// ********************************************************************************************* //
})})();
