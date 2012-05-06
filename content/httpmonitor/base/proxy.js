/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Implementation

/**
 * Proxy represents an abstract layer that mediate access to the backend services.
 * Depending on the implementation the access can be executed by API calls or remotelly
 * through TCP/IP connection. The actual instance of the proxy object is accessible
 * throug the current context.
 */
var Proxy =
{
    getTabs: function(callback)
    {
    },

    attach: function(context, callback)
    {
        this.context = context;
        this.context.proxy = this;
    },

    detach: function()
    {
        if (!this.context)
            return;

        this.context.proxy = null;
        this.context = null;
    },
}

// ********************************************************************************************* //
// Registration

return Proxy;

// ********************************************************************************************* //
});
