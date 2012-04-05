/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/tabContext",
],
function(FBTrace, TabContext) {

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
        var win = tab.linkedBrowser._contentWindow;
        this.context = new TabContext(win, this.win, this.panelDoc, this.persistedState);

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
}

// ********************************************************************************************* //
// Registration

return TabWatcher;

// ********************************************************************************************* //
});
