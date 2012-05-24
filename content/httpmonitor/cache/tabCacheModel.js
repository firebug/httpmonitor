/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/options",
    "httpmonitor/net/requestObserver",
    "httpmonitor/net/responseObserver",
    "httpmonitor/lib/events",
    "httpmonitor/lib/url",
    "httpmonitor/lib/http",
    "httpmonitor/lib/string",
    "httpmonitor/lib/window",
    "httpmonitor/base/module",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Obj, Options, RequestObserver, HttpResponseObserver, Events,
    Url, Http, Str, Win, Module, Chrome) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// List of text content types. These content-types are cached.
var contentTypes =
{
    "text/plain": 1,
    "text/html": 1,
    "text/xml": 1,
    "text/xsl": 1,
    "text/xul": 1,
    "text/css": 1,
    "text/sgml": 1,
    "text/rtf": 1,
    "text/x-setext": 1,
    "text/richtext": 1,
    "text/javascript": 1,
    "text/x-javascript": 1,
    "text/jscript": 1,
    "text/tab-separated-values": 1,
    "text/rdf": 1,
    "text/xif": 1,
    "text/ecmascript": 1,
    "text/vnd.curl": 1,
    "text/x-json": 1,
    "text/x-js": 1,
    "text/js": 1,
    "text/vbscript": 1,
    "view-source": 1,
    "view-fragment": 1,
    "application/xml": 1,
    "application/xhtml+xml": 1,
    "application/atom+xml": 1,
    "application/rss+xml": 1,
    "application/vnd.mozilla.maybe.feed": 1,
    "application/vnd.mozilla.xul+xml": 1,
    "application/javascript": 1,
    "application/x-javascript": 1,
    "application/x-httpd-php": 1,
    "application/rdf+xml": 1,
    "application/ecmascript": 1,
    "application/http-index-format": 1,
    "application/json": 1,
    "application/x-js": 1,
    "multipart/mixed" : 1,
    "multipart/x-mixed-replace" : 1,
    "image/svg+xml" : 1,
    "text/json": 1,
    "text/x-json": 1,
    "application/x-json": 1,
    "application/json-rpc": 1
};

// ********************************************************************************************* //
// Model implementation

/**
 * Implementation of cache model. The only purpose of this object is to register an HTTP
 * observer so, HTTP communication can be intercepted and all incoming data stored within
 * a cache.
 */
var TabCacheModel = Obj.extend(Module,
{
    dispatchName: "tabCache",
    contentTypes: contentTypes,
    fbListeners: [],

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        /*this.traceListener = new TraceListener("tabCache.", "DBG_CACHE", false);
        TraceModule.addListener(this.traceListener);*/

        if (!this.observing)
        {
            RequestObserver.addObserver(this, "http-event", false);
            this.observing = true;
        }
    },

    initializeUI: function(owner)
    {
        Module.initializeUI.apply(this, arguments);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.initializeUI;");

        // Read additional text MIME types from preferences.
        var mimeTypes = Options.get("cache.mimeTypes");
        if (mimeTypes)
        {
            var list = mimeTypes.split(" ");
            for (var i=0; i<list.length; i++)
                contentTypes[list[i]] = 1;
        }
    },

    shutdown: function()
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.shutdown; Cache model destroyed.");

        /*TraceModule.removeListener(this.traceListener);*/

        if (this.observing)
            RequestObserver.removeObserver(this, "http-event");
    },

    initContext: function(context)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.initContext for: " + context.getName());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIObserver

    observe: function(subject, topic, data)
    {
        try
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            // XXXjjb this same code is in net.js, better to have it only once
            var win = Http.getWindowForRequest(subject);
            if (!win)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.observe; " + topic + ", NO WINDOW");
                return;
            }

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win);
            else if (topic == "http-on-examine-cached-response")
                this.onCachedResponse(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
    },

    onExamineResponse: function(request, win)
    {
        this.registerStreamListener(request, win);
    },

    onCachedResponse: function(request, win)
    {
        this.registerStreamListener(request, win);
    },

    registerStreamListener: function(request, win)
    {
        var context = Chrome.currentContext;
        if (!context)
            return;

        if (context.window != Win.getRootWindow(win))
            return;

        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.registerStreamListener; " +
                    Http.safeGetRequestName(request));

            HttpResponseObserver.register(win, request, new ChannelListenerProxy(win));
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.Register Traceable Listener EXCEPTION", err);
        }
    },

    shouldCacheRequest: function(request)
    {
        if (!(request instanceof Ci.nsIHttpChannel))
            return;

        // Allow to customize caching rules.
        if (Events.dispatch2(this.fbListeners, "shouldCacheRequest", [request]))
            return true;

        // Cache only text responses for now.
        var contentType = request.contentType;
        if (contentType)
            contentType = contentType.split(";")[0];

        contentType = Str.trim(contentType);
        if (contentTypes[contentType])
            return true;

        // Hack to work around application/octet-stream for js files (see issue 2063).
        // Let's cache all files with js extensions.
        var extension = Url.getFileExtension(Http.safeGetRequestName(request));
        if (extension == "js")
            return true;

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.shouldCacheRequest; Request not cached: " +
                request.contentType + ", " + Http.safeGetRequestName(request));

        return false;
    },
});

// ********************************************************************************************* //
// Proxy Listener

function ChannelListenerProxy(win)
{
    this.window = win;
}

ChannelListenerProxy.prototype =
{
    onStartRequest: function(request, requestContext)
    {
        var context = this.getContext();
        if (context)
            context.sourceCache.onStartRequest(request, requestContext);
    },

    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        var context = this.getContext();
        if (!context)
            return null;

        return context.sourceCache.onDataAvailable(request, requestContext,
            inputStream, offset, count);
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        var context = this.getContext();
        if (context)
            context.sourceCache.onStopRequest(request, requestContext, statusCode);
    },

    onCollectData: function(request, data, offset)
    {
        var context = this.getContext();
        if (!context)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.channel.onCollectData: NO CONTEXT " +
                    Http.safeGetRequestName(request), data);

            return false;
        }

        // Store received data into the cache as they come. If the method returns
        // false, the rest of the response is ignored (not cached). This is used
        // to limit size of a cached response.
        return context.sourceCache.storePartialResponse(request, data, this.window, offset);
    },

    getContext: function()
    {
        try
        {
            // xxxHonza
            //return HttpMonitor.tabWatcher.context;
            //return connection.getContextByWindow(this.window);
            return Chrome.currentContext;
        }
        catch (e)
        {
        }
        return null;
    },

    shouldCacheRequest: function(request)
    {
        try
        {
            return TabCacheModel.shouldCacheRequest(request)
        }
        catch (err)
        {
        }
        return false;
    },
}

// ********************************************************************************************* //
// Registration

Chrome.registerModule(TabCacheModel);

return TabCacheModel;

// ********************************************************************************************* //
});