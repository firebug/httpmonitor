/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/window",
    "httpmonitor/lib/http",
    "httpmonitor/net/netUtils",
    "httpmonitor/net/requestObserver",
    "httpmonitor/net/netProgress",
],
function(FBTrace, Win, Http, NetUtils, RequestObserver, NetProgress) {

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

function HttpRequestObserver(context)
{
    this.context = context;
}

/**
 * HTTP listener - based on HttpRequestObserver module
 * 
 * This observer is used for observing the first document http-on-modify-request
 * is initialized (initContext method call). Without this observer this events
 * would be lost and the time measuring would be wrong.
 */
HttpRequestObserver.prototype =
/** @lends HttpRequestObserver */
{
    dispatchName: "HttpRequestObserver",
    registered: false,

    registerObserver: function()
    {
        if (this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.HttpRequestObserver.register;");

        RequestObserver.addObserver(this, "http-event", false);

        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!this.registered)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.HttpRequestObserver.unregister;");

        RequestObserver.removeObserver(this, "http-event");

        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
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

            if (this.context.window != Win.getRootWindow(win))
            {
                if (FBTrace.DBG_NET)
                {
                    FBTrace.sysout("This request doesn't come from selected tab " +
                        Http.safeGetRequestName(subject));
                }
                return;
            }

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win);
            else if (topic == "http-on-examine-cached-response")
                this.onExamineCachedResponse(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
        var netProgress = this.context.netProgress;
        if (netProgress)
        {
            netProgress.post(startFile, [request, win]);

            // We need to track the request now since the activity observer is not used in case
            // the response comes from BF cache. If it's a regular HTTP request the timing
            // is properly overridden by the activity observer (ACTIVITY_SUBTYPE_REQUEST_HEADER).
            // Even if the netShowBFCacheResponses is false now, the user could
            // switch it on later.
            var xhr = Http.isXHR(request);
            netProgress.post(requestedFile, [request, NetUtils.now(), win, xhr]);
        }
    },

    onExamineResponse: function(request, win)
    {
        var netProgress = this.context.netProgress;
        if (!netProgress)
            return;

        var info = new Object();
        info.responseStatus = request.responseStatus;
        info.responseStatusText = request.responseStatusText;

        // Initialize info.postText property.
        info.request = request;
        NetUtils.getPostText(info, this.context);

        // Get response headers now. They could be replaced by cached headers later
        // (if the response is coming from the cache).
        NetUtils.getHttpHeaders(request, info, this.context);

        if (FBTrace.DBG_NET && info.postText)
            FBTrace.sysout("net.onExamineResponse, POST data: " + info.postText, info);

        netProgress.post(respondedFile, [request, NetUtils.now(), info]);

        // Make sure to track the first document response.
        //TabCacheModel.registerStreamListener(request, win, true);
    },

    onExamineCachedResponse: function(request, win)
    {
        var netProgress = this.context.netProgress;
        if (!netProgress)
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
        NetUtils.getPostText(info, this.context);

        netProgress.post(respondedCacheFile, [request, NetUtils.now(), info]);
    },
}

// ********************************************************************************************* //
// Registration

return HttpRequestObserver;

// ********************************************************************************************* //
});
