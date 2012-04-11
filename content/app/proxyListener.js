/* See license.txt for terms of usage */

define([
    "lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Implementation

var ProxyListener =
{
    onConnect: function(tabId)
    {
    },

    onDisconnect: function(tabId)
    {
    },

    onTabSelected: function(tabId)
    {
    },

    onNetworkEvent: function(files)
    {
    }
}

// ********************************************************************************************* //
// Registration

return ProxyListener;

// ********************************************************************************************* //
});
