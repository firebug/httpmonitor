/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "chrome/window",
    "lib/http",
    "net/netUtils",
    "net/requestObserver",
    "lib/xpcom",
    "lib/string",
    "net/netProgress",
    "chrome/chrome",
],
function(FBTrace, Firebug, Win, Http, NetUtils, RequestObserver, Xpcom, Str,
    NetProgress, Chrome) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var startFile = NetProgress.prototype.startFile;
var requestedFile = NetProgress.prototype.requestedFile;
var respondedFile = NetProgress.prototype.respondedFile;
var respondedCacheFile = NetProgress.prototype.respondedCacheFile;

// ********************************************************************************************* //
// HTTP Observer

/**
 * HTTP listener - based on HttpRequestObserver module
 * 
 * This observer is used for observing the first document http-on-modify-request
 * is initialized (initContext method call). Without this observer this events
 * would be lost and the time measuring would be wrong.
 */
var HttpRequestObserver =
{
    dispatchName: "HttpRequestObserver",
    registered: false,

    registerObserver: function()
    {
        if (this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.HttpRequestObserver.register;");

        RequestObserver.addObserver(this, "firebug-http-event", false);

        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.HttpRequestObserver.unregister;");

        RequestObserver.removeObserver(this, "firebug-http-event");

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
                if (FBTrace.DBG_NET)
                {
                    FBTrace.sysout("This request doesn't have a window " +
                        Http.safeGetRequestName(subject));
                }
                return;
            }

            // xxxHonza
            //var context = Firebug.connection.getContextByWindow(win);
            //var context = HttpMonitor.tabWatcher.getContextByWindow(win);
            var context = Firebug.currentContext;
            if (!context || context.window != Win.getRootWindow(win))
            {
                //FBTrace.sysout("This request doesn't come from selected tab  " +
                //    Http.safeGetRequestName(subject), context);
                return;
            }

            // The context doesn't have to exist yet. In such cases a temp Net context is
            // created within onModifyRequest.

            // Some requests are not associated with any page (e.g. favicon).
            // These are ignored as Net panel shows only page requests.
            var tabId = win ? Win.getTabIdForWindow(win) : null;
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
            // New page loaded, clear UI if 'Persist' isn't active.
            if (!Chrome.getGlobalAttribute("cmd_togglePersistNet", "checked"))
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
// Registration

return HttpRequestObserver;

// ********************************************************************************************* //
});
