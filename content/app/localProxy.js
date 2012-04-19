/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "chrome/proxy",
    "chrome/window",
    "net/netMonitor",
],
function(FBTrace, Obj, Proxy, Win, NetMonitor) {

// ********************************************************************************************* //
// Implementation

function LocalProxy()
{
}

LocalProxy.prototype = Obj.extend(Proxy,
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

    attach: function(context, callback)
    {
        this.context = context;

        // Initializes network context (netProgress) and attaches HTTP observers.
        NetMonitor.initContext(this.context);

        callback();
    },

    detach: function()
    {
        if (!this.context) 
            return;

        NetMonitor.destroyContext(this.context);

        this.context = null;
    }
});

// ********************************************************************************************* //
// Registration

return LocalProxy;

// ********************************************************************************************* //
});
