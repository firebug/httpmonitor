/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/tabWatcher",
    "chrome/window",
    "chrome/menu",
],
function(FBTrace, TabWatcher, Win, Menu) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Implementation

var HttpMonitor = 
{
    initialize: function(win)
    {
        // The parent XUL window.
        this.win = win;

        // Update current tab label.
        this.updateLabel();
    },

    destroy: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextShowing: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // List of tabs

    onTabListMenuShowing: function(popup)
    {
        var tabs = [];
        Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            Win.iterateBrowserTabs(win, function(tab)
            {
                tabs.push(tab);
            });
        });

        // Populate the menu with entries.
        for (var i=0; i<tabs.length; ++i)
        {
            var tab = tabs[i];
            var item = {
                nol10n: true,
                label: tab.label,
                type: "radio",
                checked: this.currentTab == tab,
                command: this.onSelectTab.bind(this, tab)
            };
            Menu.createMenuItem(popup, item);
        }

        // Show the menu.
        return true;
    },

    onTabListMenuHidden: function(popup)
    {
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    updateLabel: function()
    {
        var button = this.win.document.getElementById("currentTab");
        button.setAttribute("label", "Select Browser Tab ");

        if (this.currentTab)
            button.setAttribute("label", this.currentTab.label + " ");
    },

    onSelectTab: function(tab)
    {
        this.currentTab = tab;
        this.updateLabel();
    },

    getCurrentWindow: function()
    {
        return this.currentTab ? this.currentTab.linkedBrowser._contentWindow : null;
    }
}

// ********************************************************************************************* //
// Registration

return HttpMonitor;

// ********************************************************************************************* //
});
