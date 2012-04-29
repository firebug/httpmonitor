/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/options",
    "httpmonitor/lib/string",
    "httpmonitor/net/httpActivityObserver",
    "httpmonitor/net/httpRequestObserver",
    "httpmonitor/net/netProgress",          //xxxHonza:is this dep correct?.
    "httpmonitor/net/netUtils",
    "httpmonitor/lib/events",
    "httpmonitor/net/netCacheListener",
    "httpmonitor/base/module",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Obj, Options, Str, HttpActivityObserver, HttpRequestObserver,
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
var NetMonitor = Obj.extend(Module,
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
        NetMonitor.updateMaxLimit();

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

        if (!this.fbListeners)
            this.fbListeners = [];

        var netProgress = new NetProgress(context, this.fbListeners);
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
        var value = Options.get("net.logLimit");
        this.maxQueueRequests = value ? value : this.maxQueueRequests;
    },

    // xxxHonza: console.timeStamp() API implementation should here?
    addTimeStamp: function(context, time, label, color)
    {
        if (context.netProgress)
            context.netProgress.post(timeStamp, [context.window, time, label, color]);
    }
});

// ********************************************************************************************* //
// Registration

Chrome.registerModule(NetMonitor);

return NetMonitor;

// ********************************************************************************************* //
});
