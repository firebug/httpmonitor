/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/events",
],
function(FBTrace, Events) {

// ********************************************************************************************* //
// TabCache Listener

/**
 * TabCache listner implementation. Net panel uses this listner to remember all
 * responses stored into the cache. There can be more requests to the same URL that
 * returns different responses. The Net panels must remember all of them (tab cache
 * remembers only the last one)
 */
function NetCacheListener(netProgress)
{
    this.netProgress = netProgress;
    this.cache = null;
}

NetCacheListener.prototype =
{
    dispatchName: "NetCacheListener",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    register: function(cache)
    {
        if (this.cache)
            return;

        this.cache = cache;
        this.cache.addListener(this);
    },

    unregister: function()
    {
        if (!this.cache)
            return;

        this.cache.removeListener(this);
        this.cache = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Cache Listener

    onStartRequest: function(context, request)
    {
        // Keep in mind that the file object (representing the request) doesn't have to be
        // created at this moment (top document request).
    },

    onStopRequest: function(context, request, responseText)
    {
        // Remember the response for this request.
        var file = this.netProgress.getRequestFile(request, null, true);
        if (file)
            file.responseText = responseText;

        Events.dispatch(context.netProgress.fbListeners, "onResponseBody", [context, file]);
    }
}

// ********************************************************************************************* //
// Registration

return NetCacheListener;

// ********************************************************************************************* //
});
