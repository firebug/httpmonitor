/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/tabContext",
    "net/netMonitor",
    "chrome/window",
],
function(FBTrace, TabContext, NetMonitor, Win) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Implementation

function TabWatcher(panelDoc)
{
    this.panelDoc = panelDoc;
}

TabWatcher.prototype =
{
    context: null,
    persistedState: {},

    watchTab: function(tab)
    {
        // Destroy the old context.
        if (this.context)
            this.unwatchTab();

        // Start HTTP activity of the selected tab/window. The context object represents
        // a container for all data collected by the Net panel.
        try
        {
            this.context = new TabContext(tab, this.persistedState);
            this.context.create(this.panelDoc);
        }
        catch (e)
        {
            FBTrace.sysout("watchTab EXCEPTION " + e, e);
        }

        // xxxHonza, hack
        Firebug.currentContext = this.context;

        NetMonitor.initContext(this.context);
        NetMonitor.loadedContext(this.context);
        NetMonitor.showContext(this.context);
    },

    unwatchTab: function()
    {
        if (!this.context)
            return;

        NetMonitor.destroyContext(this.context);

        this.context.destroy(this.persistedState);
        this.context = null;
    },

    getContextByWindow: function(win)
    {
        return this.context;
        //return (this.context && this.context.window == win) ? this.context : null;
    },

    getTabById: function(tabId)
    {
        var result;
        Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            return Win.iterateBrowserTabs(win, function(tab)
            {
                if (tab.linkedPanel == tabId)
                {
                    result = tab;
                    return true;
                }
            });
        });

        FBTrace.sysout("getTabById " + tabId + " -> " + result);

        return result;
    }
}

// ********************************************************************************************* //
// Registration

return TabWatcher;

// ********************************************************************************************* //
});
