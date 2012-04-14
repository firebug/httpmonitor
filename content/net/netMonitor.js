/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/object",
    "app/firebug",
    "chrome/firefox",
    "lib/options",
    "chrome/window",
    "lib/string",
    "lib/persist",
    "net/httpActivityObserver",
    "net/requestObserver",
    "net/netProgress",
    "lib/http",
    "net/netUtils",
    "lib/events",
],
function(FBTrace, Obj, Firebug, Firefox, Options, Win, Str, Persist, NetHttpActivityObserver,
    HttpRequestObserver, NetProgress, Http, NetUtils, Events) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

var startFile = NetProgress.prototype.startFile;
var requestedFile = NetProgress.prototype.requestedFile;
var respondedFile = NetProgress.prototype.respondedFile;
var respondedCacheFile = NetProgress.prototype.respondedCacheFile;
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

        NetHttpObserver.registerObserver();
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

        NetHttpObserver.unregisterObserver();
    },

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.initContext for: " + context.getName());

        // XXXjjb changed test to instanceof because jetpack uses fake window objects
        if (context.window && context.window instanceof Window)
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
    },

    showContext: function(browser, context)
    {
        Firebug.Module.showContext.apply(this, arguments);
    },

    loadedContext: function(context)
    {
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

// HTTP Observer

// HTTP listener - based on HttpRequestObserver module
// This observer is used for observing the first document http-on-modify-request
// and http-on-examine-response events, which are fired before the context
// is initialized (initContext method call). Without this observer this events
// would be lost and the time measuring would be wrong.

var NetHttpObserver =
{
    dispatchName: "NetHttpObserver",
    registered: false,

    registerObserver: function()
    {
        if (this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetHttpObserver.register;");

        HttpRequestObserver.addObserver(this, "firebug-http-event", false);
        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetHttpObserver.unregister;");

        HttpRequestObserver.removeObserver(this, "firebug-http-event");
        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
            if (FBTrace.DBG_NET_EVENTS)
            {
                FBTrace.sysout("net.events.observe " + (topic ? topic.toUpperCase() : topic) +
                    ", " + ((subject instanceof Ci.nsIRequest) ? Http.safeGetRequestName(subject) : ""));
            }

            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            var win = Http.getWindowForRequest(subject);
            if (!win)
            {
                FBTrace.sysout("This request doesn't have a window " +
                    Http.safeGetRequestName(subject));
                return;
            }

            // xxxHonza
            //var context = Firebug.connection.getContextByWindow(win);
            var context = HttpMonitor.tabWatcher.getContextByWindow(win);
            if (!context || context.window != win)
            {
                FBTrace.sysout("This request doesn't come from selected tab  " +
                    Http.safeGetRequestName(subject), context);
                return;
            }

            // The context doesn't have to exist yet. In such cases a temp Net context is
            // created within onModifyRequest.

            // Some requests are not associated with any page (e.g. favicon).
            // These are ignored as Net panel shows only page requests.
            var tabId = win ? Win.getWindowProxyIdForWindow(win) : null;
            if (!tabId)
            {
                if (FBTrace.DBG_NET)
                    FBTrace.sysout("net.observe NO TAB " + Http.safeGetRequestName(subject) +
                        ", " + tabId + ", " + win);
                return;
            }

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win, tabId, context);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win, tabId, context);
            else if (topic == "http-on-examine-cached-response")
                this.onExamineCachedResponse(subject, win, tabId, context);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win, tabId, context)
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        var isRedirect = (name != origName);

        // We only need to create a new context if this is a top document uri (not frames).
        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect)
        {
            var browser = Firefox.getBrowserForWindow(win);

            // New page loaded, clear UI if 'Persist' isn't active.
            if (!Firebug.chrome.getGlobalAttribute("cmd_togglePersistNet", "checked"))
            {
                Firebug.NetMonitor.clear(context);
            }
        }

        var networkContext = context ? context.netProgress : null;

        if (networkContext)
        {
            networkContext.post(startFile, [request, win]);

            // We need to track the request now since the activity observer is not used in case
            // the response comes from BF cache. If it's a regular HTTP request the timing
            // is properly overridden by the activity observer (ACTIVITY_SUBTYPE_REQUEST_HEADER).
            // Even if the Firebug.netShowBFCacheResponses is false now, the user could
            // switch it on later.
            var xhr = Http.isXHR(request);
            networkContext.post(requestedFile, [request, NetUtils.now(), win, xhr]);
        }
    },

    onExamineResponse: function(request, win, tabId, context)
    {
        var networkContext = context ? context.netProgress : null;

        if (!networkContext)
            return;

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, context);

        // Get response headers now. They could be replaced by cached headers later
        // (if the response is coming from the cache).
        NetUtils.getHttpHeaders(request, info, context);

        if (FBTrace.DBG_NET && info.postText)
            FBTrace.sysout("net.onExamineResponse, POST data: " + info.postText, info);

        networkContext.post(respondedFile, [request, NetUtils.now(), info]);

        // Make sure to track the first document response.
        //Firebug.TabCacheModel.registerStreamListener(request, win, true);
    },

    onExamineCachedResponse: function(request, win, tabId, context)
    {
        var networkContext = context ? context.netProgress : null;

        if (!networkContext)
        {
            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.onExamineCachedResponse; No CONTEXT for:" +
                    Http.safeGetRequestName(request));
            return;
        }

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, context);

        networkContext.post(respondedCacheFile, [request, NetUtils.now(), info]);
    },
}

// ********************************************************************************************* //
// Monitoring start/stop

function monitorContext(context)
{
    if (context.netProgress)
        return;

    var networkContext = null;

    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.monitorContext; (" + networkContext + ") " +
            tabId + ", " + context.getName());

    networkContext = createNetProgress(context);

    // Register activity-distributor observer if available (#488270)
    NetHttpActivityObserver.registerObserver();

    context.netProgress = networkContext;

    // Add cache listener so, net panel has always fresh responses.
    // Safe to call multiple times.
    networkContext.cacheListener.register(context.sourceCache);

    // Activate net panel sub-context.
    var panel = context.getPanel(panelName);
    context.netProgress.activate(panel);

    // Display info message, but only if the panel isn't just reloaded or Persist == true.
    if (!context.persistedState)
        panel.insertActivationMessage();

    return networkContext;
}

function unmonitorContext(context)
{
    if (FBTrace.DBG_NET)
        FBTrace.sysout("net.unmonitorContext; (" +
            (context ? context.netProgress : "netProgress == NULL") + ") " +
            (context ? context.getName() : "no context"));

    var netProgress = context ? context.netProgress : null;
    if (!netProgress)
        return;

    // Since the print into the UI is done by timeout asynchronously,
    // make sure there are no requests left.
    var panel = context.getPanel(panelName, true);
    if (panel)
        panel.updateLayout();

    NetHttpActivityObserver.unregisterObserver();

    // Remove cache listener. Safe to call multiple times.
    netProgress.cacheListener.unregister();

    // Deactivate net sub-context.
    context.netProgress.activate(null);

    // And finaly destroy the net panel sub context.
    delete context.netProgress;
}

function createNetProgress(context)
{
    var netProgress = new NetProgress(context);
    netProgress.cacheListener = new NetCacheListener(netProgress);
    return netProgress;
}

// ********************************************************************************************* //
// TabCache Listener

/**
 * TabCache listner implementation. Net panel uses this listner to remember all
 * responses stored into the cache. There can be more requests to the same URL that
 * returns different responses. The Net panels must remember all of them (tab cache
 * remembers only the last one)
 */
function NetCacheListener(netProgress)
{
    this.netProgress = netProgress;
    this.cache = null;
}

NetCacheListener.prototype =
{
    dispatchName: "NetCacheListener",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    register: function(cache)
    {
        if (this.cache)
            return;

        this.cache = cache;
        this.cache.addListener(this);
    },

    unregister: function()
    {
        if (!this.cache)
            return;

        this.cache.removeListener(this);
        this.cache = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Cache Listener

    onStartRequest: function(context, request)
    {
        // Keep in mind that the file object (representing the request) doesn't have to be
        // created at this moment (top document request).
    },

    onStopRequest: function(context, request, responseText)
    {
        // Remember the response for this request.
        var file = this.netProgress.getRequestFile(request, null, true);
        if (file)
            file.responseText = responseText;

        Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponseBody", [context, file]);
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.NetMonitor);

return Firebug.NetMonitor;

// ********************************************************************************************* //
});
