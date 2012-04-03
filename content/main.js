/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Tracing

/**
 * Import FBTrace global into this scope. Use for logging: FBTrace.sysout("hello");
 */
Components.utils.import("resource://httpmonitor/modules/fbtrace.js");

// ********************************************************************************************* //
// Application Initialization

var config = {};
config.baseUrl = "resource://httpmonitor/content";

// Load application
require(config, [
    "net/netMonitor",
    "net/netPanel"
],
function() {

// ********************************************************************************************* //

FBTrace.sysout("httpMonitor; Loaded ");

// ********************************************************************************************* //

top.HttpMonitor =
{
    startMonitor: function()
    {
        
    },

    stopMonitor: function()
    {
        
    },

    onContextShowing: function()
    {
        
    }
}

// ********************************************************************************************* //
});
