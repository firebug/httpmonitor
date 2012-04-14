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
                id: tab.linkedPanel,
                label: tab.label
            });
        }

        callback(result);
    },

    getCurrentTab: function()
    {
        return this.currentTab;
    },

    attach: function(tab, callback)
    {
        if (this.currentTab == tab)
            return;

        this.currentTab = tab;

        callback();
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
