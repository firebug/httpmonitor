/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "app/firebug",
    "lib/options",
    "lib/string",
    "lib/persist",
    "net/httpActivityObserver",
    "net/httpRequestObserver",
    "net/netProgress",
    "net/netUtils",
    "lib/events",
    "net/netCacheListener",
],
function(FBTrace, Obj, Firebug, Options, Str, Persist, HttpActivityObserver,
    HttpRequestObserver, NetProgress, NetUtils, Events, NetCacheListener) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

var windowPaint = NetProgress.prototype.windowPaint;
var timeStamp = NetProgress.prototype.timeStamp;
var windowLoad = NetProgress.prototype.windowLoad;
var contentLoad = NetProgress.prototype.contentLoad;

// ********************************************************************************************* //

/**
 * @module Represents a module object for the Net panel. This object is derived
 * from <code>Firebug.Module</code> in order to support activation (enable/disable).
 * This allows to avoid (performance) expensive features if the functionality is not necessary
 * for the user.
 */
Firebug.NetMonitor = Obj.extend(Firebug.Module,
{
    dispatchName: "netMonitor",
    maxQueueRequests: 500,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        HttpRequestObserver.registerObserver();
    },

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        // Initialize max limit for logged requests.
        Firebug.NetMonitor.updateMaxLimit();

        // Synchronize buttons with the current filter.
        this.syncFilterButtons(Firebug.chrome);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        HttpRequestObserver.unregisterObserver();
    },

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.initContext for: " + context.getName());

        // XXXjjb changed test to instanceof because jetpack uses fake window objects
        // xxxHonza: Window type not available in server mode (bootstrapped context)
        if (context.window/* && context.window instanceof Window*/)
        {
            var win = context.window;

            var onWindowPaintHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(windowPaint, [win, NetUtils.now()]);
            }

            if (Options.get("netShowPaintEvents"))
            {
                context.addEventListener(win, "MozAfterPaint", onWindowPaintHandler, false);
            }

            // Register "load" listener in order to track window load time.
            var onWindowLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(windowLoad, [win, NetUtils.now()]);
                context.removeEventListener(win, "load", onWindowLoadHandler, true);

                context.setTimeout(function()
                {
                    if (win && !win.closed)
                    {
                        context.removeEventListener(win, "MozAfterPaint", onWindowPaintHandler, false);
                    }
                }, 2000); //xxxHonza: this should be customizable using preferences.
            }
            context.addEventListener(win, "load", onWindowLoadHandler, true);

            // Register "DOMContentLoaded" listener to track timing.
            var onContentLoadHandler = function()
            {
                if (context.netProgress)
                    context.netProgress.post(contentLoad, [win, NetUtils.now()]);
                context.removeEventListener(win, "DOMContentLoaded", onContentLoadHandler, true);
            }

            context.addEventListener(win, "DOMContentLoaded", onContentLoadHandler, true);
        }

        monitorContext(context);

        var netProgress = context.netProgress;
        if (netProgress)
        {
            netProgress.loaded = true;

            // Set Page title and id into all document objects.
            for (var i=0; i<netProgress.documents.length; i++)
            {
                var doc = netProgress.documents[i];
                doc.id = context.uid;
                doc.title = NetUtils.getPageTitle(context);
            }
        }
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.Module.destroyContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.destroyContext for: " +
                (context ? context.getName() : "No context"));

        if (context.netProgress)
        {
            // Remember existing breakpoints.
            var persistedPanelState = Persist.getPersistedState(context, panelName);
            persistedPanelState.breakpoints = context.netProgress.breakpoints;
        }

        unmonitorContext(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // User Actions

    clear: function(context)
    {
        // The user pressed a Clear button so, remove content of the panel...
        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.clear();
    },

    onToggleFilter: function(context, filterCategory)
    {
        if (!context.netProgress)
            return;

        Options.set("netFilterCategory", filterCategory);

        // The content filter has been changed. Make sure that the content
        // of the panel is updated (CSS is used to hide or show individual files).
        var panel = context.getPanel(panelName, true);
        if (panel)
        {
            panel.setFilter(filterCategory);
            panel.updateSummaries(NetUtils.now(), true);
        }
    },

    syncFilterButtons: function(chrome)
    {
        var id = "fbNetFilter-" + Options.get("netFilterCategory");
        var button = chrome.$(id);
        if (!button)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("netMonitor.syncFilterButtons; ERROR no button? " + id);

            return;
        }

        button.checked = true;
    },

    togglePersist: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.persistContent = panel.persistContent ? false : true;
        Firebug.chrome.setGlobalAttribute("cmd_togglePersistNet", "checked", panel.persistContent);
    },

    updateOption: function(name, value)
    {
        if (name == "net.logLimit")
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        //xxxHonza
        //var value = Options.get("net.logLimit");
        //this.maxQueueRequests = value ? value : this.maxQueueRequests;
    },

    addTimeStamp: function(context, time, label, color)
    {
        if (context.netProgress)
            context.netProgress.post(timeStamp, [context.window, time, label, color]);
    }
});

// ********************************************************************************************* //
// Monitoring start/stop

function monitorContext(context)
{
    if (context.netProgress)
        return;

    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.monitorContext; (" + networkContext + ") " +
            tabId + ", " + context.getName());

    var netProgress = new NetProgress(context);
    context.netProgress = netProgress;

    // Register activity-distributor observer if available (#488270)
    netProgress.httpActivityObserver = new HttpActivityObserver(context);
    netProgress.httpActivityObserver.registerObserver();

    // Add cache listener so, net panel has always fresh responses.
    // Safe to call multiple times.
    netProgress.cacheListener = new NetCacheListener(netProgress);
    netProgress.cacheListener.register(context.sourceCache);

    // Activate net panel sub-context.
    var panel = context.getPanel(panelName);
    context.netProgress.activate(panel);

    return netProgress;
}

function unmonitorContext(context)
{
    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.unmonitorContext; (" +
            (context ? context.netProgress : "netProgress == NULL") + ") " +
            (context ? context.getName() : "no context"));

    var netProgress = context.netProgress;
    if (!netProgress)
        return;

    // Since the print into the UI is done by timeout asynchronously,
    // make sure there are no requests left.
    var panel = context.getPanel(panelName, true);
    if (panel)
        panel.updateLayout();

    netProgress.httpActivityObserver.unregisterObserver();
    delete netProgress.httpActivityObserver;

    // Remove cache listener. Safe to call multiple times.
    netProgress.cacheListener.unregister();

    // Deactivate net sub-context.
    netProgress.activate(null);

    // And finaly destroy the net panel sub context.
    delete context.netProgress;
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
