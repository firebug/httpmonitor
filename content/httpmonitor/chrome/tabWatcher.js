/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/chrome/tabContext",
    "httpmonitor/lib/window",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, TabContext, Win, Chrome) {

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

    watchTab: function(tab, proxy, callback)
    {
        // Destroy the old context.
        if (this.context)
            this.unwatchTab(proxy);

        // xxxHonza: hack, we should never need the real tab object at this point
        // it should alwasy be only a tab ID (string).
        var firefoxLocalTab = this.getTabById(tab.id);
        tab = firefoxLocalTab ? firefoxLocalTab : tab;

        // Start HTTP activity of the selected tab/window. The context object represents
        // a container for all data collected by the Net panel.
        this.context = new TabContext(tab, this.persistedState);

        // xxxHonza, hack, the global must go away.
        Chrome.currentContext = this.context;

        // Attach to the selected tab.
        proxy.attach(this.context, callback);

        // Create panels.
        this.context.create(this.panelDoc);
    },

    unwatchTab: function(proxy)
    {
        if (!this.context)
            return;

        // Destroy panels
        this.context.destroy(this.persistedState);

        // Detach from the current tab.
        proxy.detach();

        this.context = null;

        // xxxHonza, hack, the global must go away.
        Chrome.currentContext = null;
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

        return result;
    }
}

// ********************************************************************************************* //
// Registration

return TabWatcher;

// ********************************************************************************************* //
});
