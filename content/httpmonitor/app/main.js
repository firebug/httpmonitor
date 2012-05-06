/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //

var config = {};
config.baseUrl = "resource://httpmonitor/content";

/**
 * The entire application is represented by "httpmonitor/app/httpMonitor" module so, load it.
 * Any other necessary modules must be specified insde 'httpMonitor' module as a dependency.
 *
 * The "httpmonitor/lib/trace" is here only for tracing.
 */
require(config, [
    "httpmonitor/lib/trace",
    "httpmonitor/app/httpMonitor",
],
function(FBTrace, HttpMonitor) {

// ********************************************************************************************* //

// This is the only application global (within monitor.xul window)
top.HttpMonitor = HttpMonitor;

function initialize()
{
    window.removeEventListener("load", initialize, false);

    try
    {
        HttpMonitor.initialize(this);
    }
    catch (e)
    {
        FBTrace.sysout("main.initialize; EXCEPTION " + e, e);
    }
}

function shutdown()
{
    window.removeEventListener("unload", shutdown, false);

    try
    {
        HttpMonitor.destroy();
    }
    catch (e)
    {
        FBTrace.sysout("main.shutdown; EXCEPTION " + e, e);
    }
}

// Register window listeners so, we can manage application life-time.
window.addEventListener("load", initialize, false);
window.addEventListener("unload", shutdown, false);

FBTrace.sysout("httpMonitor; Initialized");

// ********************************************************************************************* //
})})();
