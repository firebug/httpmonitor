/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "app/httpMonitorProxy",
    "chrome/window",
],
function(FBTrace, Obj, HttpMonitorProxy, Win) {

// ********************************************************************************************* //
// Implementation

function LocalProxy()
{
}

LocalProxy.prototype = Obj.extend(HttpMonitorProxy,
{
    getTabs: function(callback)
    {
        var tabs = [];
        Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            Win.iterateBrowserTabs(win, function(tab)
            {
                tabs.push(tab);
            });
        });

        var result = [];
        for (var i=0; i<tabs.length; ++i)
        {
            var tab = tabs[i];
            result.push({
                label: tab.label
            });
        }

        callback(result);
    },

    getCurrentTab: function(callback)
    {
    },

    attach: function(tabId, callback)
    {
    },

    detach: function(tabId, callback)
    {
    },
});

// ********************************************************************************************* //
// Registration

return LocalProxy;

// ********************************************************************************************* //
});
