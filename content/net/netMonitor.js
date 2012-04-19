/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "app/firebug",
    "lib/options",
    "lib/string",
    "net/httpActivityObserver",
    "net/httpRequestObserver",
    "net/netProgress",
    "net/netUtils",
    "lib/events",
    "net/netCacheListener",
    "base/module",
    "chrome/chrome",
],
function(FBTrace, Obj, Firebug, Options, Str, HttpActivityObserver, HttpRequestObserver,
    NetProgress, NetUtils, Events, NetCacheListener, Module, Chrome) {

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
 * from <code>Module</code> in order to support activation (enable/disable).
 * This allows to avoid (performance) expensive features if the functionality is not necessary
 * for the user.
 */
Firebug.NetMonitor = Obj.extend(Module,
{
    dispatchName: "netMonitor",
    maxQueueRequests: 500,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        HttpRequestObserver.registerObserver();
    },

    initializeUI: function()
    {
        Module.initializeUI.apply(this, arguments);

        // Initialize max limit for logged requests.
        Firebug.NetMonitor.updateMaxLimit();

        // Synchronize buttons with the current filter.
        this.syncFilterButtons();
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        HttpRequestObserver.unregisterObserver();
    },

    initContext: function(context, persistedState)
    {
        Module.initContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.initContext for: " + context.getName());

        this.initNetContext(context);
        this.attachObservers(context);

        //xxxHonza: Should be done everty time the page is reloaded.
        //this.registerLoadListeners(context);

        var netProgress = context.netProgress;
        netProgress.loaded = true;

        //xxxHonza: needed by NetExport, should be probably somewhere else.
        // Set Page title and id into all document objects.
        for (var i=0; i<netProgress.documents.length; i++)
        {
            var doc = netProgress.documents[i];
            doc.id = context.uid;
            doc.title = NetUtils.getPageTitle(context);
        }
    },

    destroyContext: function(context, persistedState)
    {
        Module.destroyContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.destroyContext for: " +
                (context ? context.getName() : "No context"));

        this.destroyNetContext(context);
        this.detachObservers(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activation

    initNetContext: function(context)
    {
        if (context.netProgress)
            return;

        var netProgress = new NetProgress(context);
        context.netProgress = netProgress;
    },

    destroyNetContext: function(context)
    {
        delete context.netProgress;
        context.netProgress = null;
    },

    attachObservers: function(context)
    {
        var netProgress = context.netProgress;
        if (!netProgress)
            return;

        // Register activity-distributor observer if available (#488270)
        netProgress.httpActivityObserver = new HttpActivityObserver(context);
        netProgress.httpActivityObserver.registerObserver();

        // Add cache listener so, net panel has always fresh responses.
        // Safe to call multiple times.
        netProgress.cacheListener = new NetCacheListener(netProgress);
        netProgress.cacheListener.register(context.sourceCache);
    },

    detachObservers: function(context)
    {
        var netProgress = context.netProgress;
        if (!netProgress)
            return;

        netProgress.httpActivityObserver.unregisterObserver();
        delete netProgress.httpActivityObserver;

        // Remove cache listener. Safe to call multiple times.
        netProgress.cacheListener.unregister();
        delete netProgress.cacheListener;
    },

    registerLoadListeners: function(context)
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

    syncFilterButtons: function()
    {
        var id = "fbNetFilter-" + Options.get("netFilterCategory");
        var button = Chrome.$(id);
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
        Chrome.setGlobalAttribute("cmd_togglePersistNet", "checked", panel.persistContent);
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
// Registration

Chrome.registerModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
