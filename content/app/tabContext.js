/* See license.txt for terms of usage */

define([
    "lib/trace",
    "net/netPanel",
    "chrome/window",
    "lib/url",
    "js/tabCache",
    "lib/object",
],
function(FBTrace, NetPanel, Win, Url, TabCache, Obj) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Implementation

function TabContext(tab, persistedState)
{
    this.uid = Obj.getUniqueId();

    this.tab = tab;
    this.window = tab.linkedBrowser.contentWindow;
    this.browser = tab.linkedBrowser;
    this.persistedState = persistedState;

    this.windows = [];
    this.name = Url.normalizeURL(this.getWindowLocation().toString());
    this.sourceCache = new TabCache(this);
}

TabContext.prototype = 
{
    getWindowLocation: function()
    {
        return Win.safeGetWindowLocation(this.window);
    },

    getTitle: function()
    {
        if (this.window && this.window.document)
            return this.window.document.title;
        else
            return "";
    },

    getName: function()
    {
        if (!this.name || this.name === "about:blank")
        {
            var url = this.getWindowLocation().toString();
            if (Url.isDataURL(url))
            {
                var props = Url.splitDataURL(url);
                if (props.fileName)
                    this.name = "data url from "+props.fileName;
            }
            else
            {
                this.name = Url.normalizeURL(url);
                if (this.name === "about:blank" && this.window.frameElement)
                    this.name += " in "+Css.getElementCSSSelector(this.window.frameElement);
            }
        }
        return this.name;
    },

    create: function(doc)
    {
        this.netPanel = this.createNetPanel(doc);
    },

    destroy: function()
    {
        // All existing timeouts need to be cleared
        if (this.timeouts)
        {
            for (var timeout in this.timeouts)
                clearTimeout(timeout);
        }

        // Also all waiting intervals must be cleared.
        if (this.intervals)
        {
            for (var timeout in this.intervals)
                clearInterval(timeout);
        }

        if (this.throttleTimeout)
            clearTimeout(this.throttleTimeout);

        // All existing DOM listeners need to be cleared
        this.unregisterAllListeners();

        state.panelState = {};

        // Inherit panelStates that have not been restored yet
        if (this.persistedState)
        {
            for (var panelName in this.persistedState.panelState)
                state.panelState[panelName] = this.persistedState.panelState[panelName];
        }

        // Destroy all panels in this context.
        for (var panelName in this.panelMap)
        {
            var panelType = Firebug.getPanelType(panelName);
            this.destroyPanel(panelType, state);
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("tabContext.destroy " + this.getName() + " set state ", state);
    },

    getPanel: function(panelName, noCreate)
    {
        if (panelName != "net")
            return null;

        if (noCreate)
            return this.netPanel;

        if (this.netPanel)
            return this.netPanel;

        return null;
    },

    createNetPanel: function(doc)
    {
        var panel = new NetPanel();
        panel.initialize(this, doc);
        panel.show(this.persistedState);
        return panel;
    },

    destroyNetPanel: function(state)
    {
        var panelName = "net";
        var panel = this.netPanel;
        if (!panel)
            return;

        // Create an object to persist state, re-using old one if it was never restored
        var panelState = panelName in state.panelState ? state.panelState[panelName] : {};
        state.panelState[panelName] = panelState;

        try
        {
            // Destroy the panel and allow it to persist extra info to the state object
            panel.destroy(panelState);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabContext.destroy FAILS "+exc, exc);

            // the destroy failed, don't keep the bad state
            delete state.panelState[panelName];
        }

        // Remove the panel node from the DOM and so delete its content.
        var panelNode = panel.panelNode;
        if (panelNode && panelNode.parentNode)
            panelNode.parentNode.removeChild(panelNode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Timeouts and Intervals

    setTimeout: function(fn, delay)
    {
        if (setTimeout == this.setTimeout)
            throw new Error("setTimeout recursion");

        // we're using a sandboxed setTimeout function
        var timeout = setTimeout(fn, delay);

        if (!this.timeouts)
            this.timeouts = {};

        this.timeouts[timeout] = 1;

        return timeout;
    },

    clearTimeout: function(timeout)
    {
        // we're using a sandboxed clearTimeout function
        clearTimeout(timeout);

        if (this.timeouts)
            delete this.timeouts[timeout];
    },

    setInterval: function(fn, delay)
    {
        // we're using a sandboxed setInterval function
        var timeout = setInterval(fn, delay);

        if (!this.intervals)
            this.intervals = {};

        this.intervals[timeout] = 1;

        return timeout;
    },

    clearInterval: function(timeout)
    {
        // we're using a sandboxed clearInterval function
        clearInterval(timeout);

        if (this.intervals)
            delete this.intervals[timeout];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Listeners

    addEventListener: function(parent, eventId, listener, capturing)
    {
        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                // Listener already registered!
                return;
            }
        }

        parent.addEventListener(eventId, listener, capturing);

        this.listeners.push({
            parent: parent,
            eventId: eventId,
            listener: listener,
            capturing: capturing,
        });
    },

    removeEventListener: function(parent, eventId, listener, capturing)
    {
        parent.removeEventListener(eventId, listener, capturing);

        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                this.listeners.splice(i, 1);
                break;
            }
        }
    },

    /**
     * Executed by the framework when the context is about to be destroyed.
     */
    unregisterAllListeners: function()
    {
        if (!this.listeners)
            return;

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            l.parent.removeEventListener(l.eventId, l.listener, l.capturing);
        }

        this.listeners = null;
    }
}

// ********************************************************************************************* //
// Registration

return TabContext;

// ********************************************************************************************* //
});
