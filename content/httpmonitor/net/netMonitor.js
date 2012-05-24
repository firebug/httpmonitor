/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/options",
    "httpmonitor/lib/string",
    "httpmonitor/lib/http",
    "httpmonitor/net/httpActivityObserver",
    "httpmonitor/net/httpRequestObserver",
    "httpmonitor/net/netProgress",          //xxxHonza:is this dep correct?.
    "httpmonitor/net/netUtils",
    "httpmonitor/lib/events",
    "httpmonitor/net/netCacheListener",
    "httpmonitor/base/module",
    "httpmonitor/chrome/chrome",
    "httpmonitor/lib/window",
    "httpmonitor/net/documentLoadObserver",
    "httpmonitor/net/windowEventObserver",
],
function(FBTrace, Obj, Options, Str, Http, HttpActivityObserver, HttpRequestObserver,
    NetProgress, NetUtils, Events, NetCacheListener, Module, Chrome, Win,
    DocumentLoadObserver, WindowEventObserver) {

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

    // Observes document load.
    loadObserver: new DocumentLoadObserver(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        // Register document load observer to get notification about new top document
        // being requested to load.
        this.loadObserver.register(this);
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

        this.loadObserver.unregister();
    },

    initContext: function(context, persistedState)
    {
        Module.initContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.initContext for: " + context.getName());

        this.initNetContext(context);
        this.attachObservers(context);

        //xxxHonza: needed by NetExport, should be probably somewhere else.
        // Set Page title and id into all document objects.
        var netProgress = context.netProgress;
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
    // Document Load Observer

    onLoadDocument: function(request, win)
    {
        var context = Chrome.currentContext;
        if (!context || context.window != Win.getRootWindow(win))
        {
            FBTrace.sysout("This request doesn't come from selected tab  " +
                Http.safeGetRequestName(request), context);
            return;
        }

        var persist = Chrome.getGlobalAttribute("cmd_togglePersistNet", "checked");
        persist = (persist == "true");

        // New page loaded, clear UI if 'Persist' isn't active.
        if (!persist)
            context.netProgress.clear();

        // Since new top document starts loading we need to reset some context flags.
        // loaded: is set as soon as 'load' even is fired
        // currentPhase: ensure that new phase is created.
        context.netProgress.loaded = false;
        context.netProgress.currentPhase = null;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("netMonitor.onModifyRequest; Top document loading...");
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

        // Just in case the context would be created outside of this extension.
        // It's normally created by httpmonitor/chrome/tabWatcher module, but
        // in case HTTPM is embedded in another project the context is provided
        // by the parent project.
        Chrome.currentContext = context;

        return netProgress;
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
        if (!netProgress.httpActivityObserver)
        {
            netProgress.httpActivityObserver = new HttpActivityObserver(context);
            netProgress.httpActivityObserver.registerObserver();
        }

        // Register observer for HTTP events
        if (!netProgress.httpRequestObserver)
        {
            netProgress.httpRequestObserver = new HttpRequestObserver(context);
            netProgress.httpRequestObserver.registerObserver();
        }

        // Add cache listener so, net panel has always fresh responses.
        // Safe to call multiple times.
        if (!netProgress.cacheListener && context.sourceCache)
        {
            netProgress.cacheListener = new NetCacheListener(netProgress);
            netProgress.cacheListener.register(context.sourceCache);
        }

        // Register observer for window events (load, DOMContentLoaded)
        if (!netProgress.windowObserver && context.uid)
        {
            netProgress.windowObserver = new WindowEventObserver(context);
            netProgress.windowObserver.registerListeners();
        }
    },

    detachObservers: function(context)
    {
        var netProgress = context.netProgress;
        if (!netProgress)
            return;

        netProgress.httpActivityObserver.unregisterObserver();
        delete netProgress.httpActivityObserver;

        netProgress.httpRequestObserver.registerObserver();
        delete netProgress.httpRequestObserver;

        netProgress.cacheListener.unregister();
        delete netProgress.cacheListener;

        netProgress.windowObserver.unregisterListeners();
        delete netProgress.windowObserver;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // User Actions

    clear: function(context)
    {
        // The user pressed a Clear button so, remove all HTTP collected data. The Net panel
        // is context handler and so the clear action will be automatically forwarded to it.
        if (context.netProgress)
            context.netProgress.clear();
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

    // xxxHonza: console.timeStamp() API implementation should really be here?
    addTimeStamp: function(context, time, label, color)
    {
        if (context.netProgress)
            context.netProgress.post(timeStamp, [context.window, time, label, color]);
    },

    /**
     * Used to resend an existing requests.
     *
     * @param {Object} file The structure representing an existing request.
     */
    sendRequest: function(context, file)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.sendRequest;", file);

        try
        {
            var win = Win.unwrap(context.window);
            var request = new win.XMLHttpRequest();
            request.open(file.method, file.href, true);

            var headers = file.requestHeaders;
            for (var i=0; headers && i<headers.length; i++)
            {
                var header = headers[i];
                request.setRequestHeader(header.name, header.value);
            }

            request.send(file.postText);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("netMonitor.sendRequest; EXCEPTION " + err, err);
        }
    }
});

// ********************************************************************************************* //
// Registration

Chrome.registerModule(NetMonitor);

return NetMonitor;

// ********************************************************************************************* //
});
