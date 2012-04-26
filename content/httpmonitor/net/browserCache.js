/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/options",
],
function(FBTrace, Options) {

// ********************************************************************************************* //
// Browser Cache

var BrowserCache =
{
    cacheDomain: "browser.cache",

    isEnabled: function()
    {
        var diskCache = Options.getPref(this.cacheDomain, "disk.enable");
        var memoryCache = Options.getPref(this.cacheDomain, "memory.enable");
        return diskCache && memoryCache;
    },

    toggle: function(state)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.BrowserCache.toggle; " + state);

        Options.setPref(this.cacheDomain, "disk.enable", state);
        Options.setPref(this.cacheDomain, "memory.enable", state);
    }
}

// ********************************************************************************************* //
// Registration

return BrowserCache;

// ********************************************************************************************* //
});
