/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

var config = {};
config.baseUrl = "resource://httpmonitor/content";
config.skinBaseUrl = "chrome://httpmonitor/skin/";

// ********************************************************************************************* //
// Setup

// Forward all tracing into FBTrace console service.
require(config, ["httpmonitor/lib/trace"], function(Trace)
{
    Trace.addListener(Cu.import("resource://httpmonitor/modules/fbtrace.js").FBTrace);
});

// Set domain for preferences.
require(config, ["httpmonitor/lib/options", "httpmonitor/chrome/defaultPrefs"],
    function(Options, DefaultPrefs)
{
    Options.initialize("extensions.httpmonitor");
    Options.registerDefaultPrefs(DefaultPrefs);
});

// Register string bundle
require(config, ["httpmonitor/lib/locale"], function(Locale)
{
    Locale.registerStringBundle("chrome://httpmonitor/locale/httpmonitor.properties");
});

// ********************************************************************************************* //
// Application

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
        HttpMonitor.initialize(this, config);
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
