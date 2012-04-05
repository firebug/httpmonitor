/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/tabContext",
    "net/netMonitor",
],
function(FBTrace, TabContext, NetMonitor) {

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
            this.unwatchTab(tab);

        // Start HTTP activity of the selected tab/window. The context object represents
        // a container for all data collected by the Net panel.
        this.context = new TabContext(tab, this.persistedState);
        this.context.create(this.panelDoc);

        // xxxHonza, hack
        Firebug.currentContext = this.context;

        NetMonitor.initContext(this.context);
        NetMonitor.loadedContext(this.context);
        NetMonitor.showContext(this.context);
    },

    unwatchTab: function(tab)
    {
        NetMonitor.destroyContext(this.context);

        this.context.destroy();
        this.context = null;
    },

    getContextByWindow: function(win)
    {
        if (!this.context)
            return null;

        return this.context.window == win ? this.context : null;
    }
}

// ********************************************************************************************* //
// Registration

return TabWatcher;

// ********************************************************************************************* //
});
