/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/locale",
    "httpmonitor/lib/events",
    "httpmonitor/lib/url",
    "httpmonitor/lib/http",
    "httpmonitor/lib/css",
    "httpmonitor/lib/window",
    "httpmonitor/lib/string",
    "httpmonitor/lib/options",
    "httpmonitor/lib/array",
    "httpmonitor/lib/system",
    "httpmonitor/net/netUtils",
    "httpmonitor/net/browserCache",
    "httpmonitor/net/netFile",
    "httpmonitor/net/netPhase",
],
function(FBTrace, Obj, Locale, Events, Url, Http, Css, Win, Str, Options,
    Arr, System, NetUtils, BrowserCache, NetFile, NetPhase) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const CacheService = Cc["@mozilla.org/network/cache-service;1"];

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const reIgnore = /about:|javascript:|resource:|chrome:|jar:/;
const reResponseStatus = /HTTP\/1\.\d\s(\d+)\s(.*)/;

var cacheSession = null;

// ********************************************************************************************* //
// Net Progress

function NetProgress(context, listeners)
{
    this.context = context;

    // Initialization
    this.clear();

    this.fbListeners = listeners;
}

NetProgress.prototype =
{
    dispatchName: "netProgress",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Forwarding

    activate: function(handler)
    {
        this.handler = handler;
        if (this.handler)
            this.flush();
    },

    post: function(method, args)
    {
        if (this.handler)
        {
            var file = method.apply(this, args);
            if (file)
                this.handler.updateFile(file);
        }
        else
        {
            // The first page request is made before the initContext (known problem).
            this.queue.push(method, args);
        }
    },

    flush: function()
    {
        for (var i=0; i<this.queue.length; i+=2)
            this.post(this.queue[i], this.queue[i+1]);

        this.queue = [];
    },

    update: function(file)
    {
        if (this.handler)
            this.handler.updateFile(file);
    },

    clear: function()
    {
        for (var i=0; this.files && i<this.files.length; i++)
            this.files[i].clear();

        this.requests = [];
        this.files = [];
        this.phases = [];
        this.documents = [];
        this.windows = [];
        this.currentPhase = null;
        this.loaded = false;

        this.queue = [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Events

    startFile: function startFile(request, win)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            // Parse URL params so, they are available for conditional breakpoints.
            file.urlParams = Url.parseURLParams(file.href);
            //xxxHonza: this.breakOnXHR(file);
        }
    },

    requestedHeaderFile: function requestedHeaderFile(request, time, win, xhr, extraStringData)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            logTime(file, "requestedHeaderFile", time);

            file.requestHeadersText = extraStringData;

            this.requestedFile(request, time, win, xhr);

            Events.dispatch(this.fbListeners, "onRequest", [this.context, file]);
        }
    },

    // Can be called from onModifyRequest (to catch request start even in case of BF cache) and also
    // from requestHeaderFile (activity observer)
    requestedFile: function requestedFile(request, time, win, xhr)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            logTime(file, "requestedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.requestedFile +0 " + getPrintableTime() + ", " +
                    request.URI.path, file);

            // For cached image files, we may never hear another peep from any observers
            // after this point, so we have to assume that the file is cached and loaded
            // until we get a respondedFile call later
            file.startTime = file.endTime = time;
            file.resolvingTime = time;
            file.connectingTime = time;
            file.connectedTime = time;
            file.sendingTime = time;
            file.waitingForTime = time;
            file.respondedTime = time;
            file.isXHR = xhr;
            file.isBackground = request.loadFlags & Ci.nsIRequest.LOAD_BACKGROUND;
            file.method = request.requestMethod;

            if (!Ci.nsIHttpActivityDistributor)
                NetUtils.getPostText(file, this.context);

            this.extendPhase(file);

            return file;
        }
        else
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.requestedFile no file for request=");
        }
    },

    /*breakOnXHR: function breakOnXHR(file)
    {
        var halt = false;
        var conditionIsFalse = false;

        // If there is an enabled breakpoint with condition:
        // 1) break if the condition is evaluated to true.
        var breakpoints = this.context.netProgress.breakpoints;
        var bp = breakpoints ? breakpoints.findBreakpoint(file.getFileURL()) : null;
        if (bp && bp.checked)
        {
            halt = true;
            if (bp.condition)
            {
                halt = bp.evaluateCondition(this.context, file);
                conditionIsFalse = !halt;
            }
        }

        // 2) If break on XHR flag is set and there is no condition evaluated to false,
        // break with "break on next" breaking cause (this new breaking cause can override
        // an existing one that is set when evaluating a breakpoint condition).
        if (this.context.breakOnXHR && !conditionIsFalse)
        {
            this.context.breakingCause = {
                title: Locale.$STR("net.Break On XHR"),
                message: Str.cropString(file.href, 200),
                copyAction: Obj.bindFixed(System.copyToClipboard, System, file.href)
            };

            halt = true;
        }

        // Ignore if there is no reason to break.
        if (!halt)
            return;

        // Even if the execution was stopped at breakpoint reset the global
        // breakOnXHR flag.
        this.context.breakOnXHR = false;

        Breakpoint.breakNow(this.context.getPanel(panelName, true));
    },*/

    respondedHeaderFile: function respondedHeaderFile(request, time, extraStringData)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "respondedHeaderFile", time);

            file.responseHeadersText = extraStringData;
        }
    },

    bodySentFile: function bodySentFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "bodySentFile", time);

            NetUtils.getPostText(file, this.context);
        }
    },

    responseStartedFile: function responseStartedFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "responseStartedFile", time);

            if (!file.responseStarted)
            {
                file.respondedTime = time;
                file.responseStarted = true;
            }

            file.endTime = time;
            return file;
        }
    },

    respondedFile: function respondedFile(request, time, info)
    {
        Events.dispatch(this.fbListeners, "onExamineResponse", [this.context, request]);

        var file = this.getRequestFile(request);
        if (file)
        {
            logTime(file, "respondedFile", time);

            if (!Ci.nsIHttpActivityDistributor)
            {
                file.respondedTime = time;
                file.endTime = time;

                if (request.contentLength >= 0)
                    file.size = request.contentLength;
            }

            if (info)
            {
                if (info.responseStatus == 304)
                    file.fromCache = true;
                else if (!file.fromCache)
                    file.fromCache = false;
            }

            // respondedFile can be executed asynchronously and getting headers now
            // could be too late. They could be already replaced by cached headers.
            if (info.responseHeaders)
                file.responseHeaders = info.responseHeaders;

            // Get also request headers (and perhaps also responseHeaders, they won't be 
            // replaced if already available).
            NetUtils.getHttpHeaders(request, file, this.context);

            if (info)
            {
                file.responseStatus = info.responseStatus;
                file.responseStatusText = info.responseStatusText;
                file.postText = info.postText;
            }

            file.aborted = false;

            // Use ACTIVITY_SUBTYPE_RESPONSE_COMPLETE to get the info if possible.
            if (!Ci.nsIHttpActivityDistributor)
            {
                if (file.fromCache)
                    getCacheEntry(file, this);
            }

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.respondedFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);

            // The ACTIVITY_SUBTYPE_TRANSACTION_CLOSE could come earlier.
            if (file.loaded)
                return;

            this.endLoad(file);

            // If there is a network error, log it into the Console panel.
            /*if (showNetworkErrors && NetRequestEntry.isError(file))
            {
                Errors.increaseCount(this.context);
                var message = "NetworkError: " + NetRequestEntry.getStatus(file) + " - "+file.href;
                Console.log(message, this.context, "error", null, true, file.getFileLink(message));
            }*/

            Events.dispatch(this.fbListeners, "onResponse", [this.context, file]);
            return file;
        }
    },

    respondedCacheFile: function respondedCacheFile(request, time, info)
    {
        Events.dispatch(this.fbListeners, "onExamineCachedResponse",
            [this.context, request]);

        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "respondedCacheFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.respondedCacheFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);

            // on-examine-cache-response is using different timer, do not track response
            // times from the cache and use the proper waiting time.
            if (file.waitingStarted)
                time = file.waitingForTime;

            if (!file.responseStarted)
            {
                file.respondedTime = time;
                file.responseStarted = true;
            }

            file.endTime = time;
            file.fromBFCache = true;
            file.fromCache = true;
            file.aborted = false;

            if (request.contentLength >= 0)
                file.size = request.contentLength;

            NetUtils.getHttpHeaders(request, file, this.context);

            if (info)
            {
                file.responseStatus = info.responseStatus;
                file.responseStatusText = info.responseStatusText;
                file.postText = info.postText;
            }

            getCacheEntry(file, this);

            this.endLoad(file);

            Events.dispatch(this.fbListeners, "onCachedResponse", [this.context, file]);

            return file;
        }
        else
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.respondedCacheFile; NO FILE FOR " +
                    Http.safeGetRequestName(request));
        }
    },

    waitingForFile: function waitingForFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "waitingForFile", time);

            if (!file.waitingStarted)
            {
                file.waitingForTime = time;
                file.waitingStarted = true;
            }
        }

        // Don't update the UI now (optimalization).
        return null;
    },

    sendingFile: function sendingFile(request, time, size)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "sendingFile", time);

            // Remember when the send started.
            if (!file.sendStarted)
            {
                file.sendingTime = time;
                file.waitingForTime = time; // in case waiting-for would never came.
                file.sendStarted = true;
            }

            // Catch 2.
            // It can happen that "connected" event sometimes comes after sending,
            // which doesn't make much sense (Firefox bug?)
            if (!file.connected)
            {
                file.connected = true;
                file.connectedTime = time;
            }

            file.totalSent = size;

            // Catch 1.
            // Request is sending so reset following flags. There are cases where
            // RESPONSE_COMPLETE and TRANSACTION_CLOSE came in the middle of
            // connetion initialization (resolving, connecting, connected).
            file.loaded = false;
            file.responseStarted = false;

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.sendingFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);
        }

        // Don't update the UI now (optimalization).
        return null;
    },

    connectingFile: function connectingFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        logTime(file, "connectingFile", time);

        // Resolving, connecting and connected can come after the file is loaded
        // (closedFile received). This happens if the response is coming from the 
        // cache. Just ignore it.
        if (file && file.loaded)
            return null;

        if (file && !file.connectStarted)
        {
            file.connectStarted = true;
            file.connectingTime = time;
            file.connectedTime = time; // in case connected-to would never came.
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        // Don't update the UI now (optimalization).
        return null;
    },

    connectedFile: function connectedFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        logTime(file, "connectedFile", time);

        if (file && file.loaded)
            return null;

        if (file && !file.connected)
        {
            file.connected = true;
            file.connectedTime = time;
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        // Don't update the UI now (optimalization).
        return null;
    },

    receivingFile: function receivingFile(request, time, size)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "receivingFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.receivingFile +" + time + " " +
                    getPrintableTime() + ", " +
                    Str.formatSize(size) + " (" + size + "B), " +
                    request.URI.path, file);

            file.endTime = time;
            file.totalReceived = size;

            // Update phase's lastFinishedFile in case of long time downloads.
            // This forces the timeline to have proper extent.
            if (file.phase && file.phase.endTime < time)
                file.phase.lastFinishedFile = file;

            // Force update UI.
            if (file.row && Css.hasClass(file.row, "opened"))
            {
                var netInfoBox = file.row.nextSibling.getElementsByClassName("netInfoBody").item(0);
                if (netInfoBox)
                {
                    netInfoBox.responsePresented = false;
                    netInfoBox.htmlPresented = false;
                }
            }
        }

        return file;
    },

    responseCompletedFile: function responseCompletedFile(request, time, responseSize)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "responseCompletedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.responseCompletedFile +" + time + " " +
                    getPrintableTime() + ", " + request.URI.path, file);

            if (responseSize >= 0)
                file.size = responseSize;

            // This was only a helper to show download progress.
            file.totalReceived = 0;

            // The request is completed, get cache entry.
            getCacheEntry(file, this);

            // Sometimes the HTTP-ON-EXAMINE-RESPONSE doesn't come.
            if (!file.loaded  && file.responseHeadersText)
            {
                var info = null;
                var m = file.responseHeadersText.match(reResponseStatus);
                if (m.length == 3)
                    info = {responseStatus: m[1], responseStatusText: m[2]};
                this.respondedFile(request, NetUtils.now(), info);
            }

            this.updateIPInfo(request, file);
        }

        return file;
    },

    closedFile: function closedFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "closedFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.closedFile +" + time + " " +
                    getPrintableTime() + ", " + request.URI.path);

            // If the response never came, stop the loading and set time info.
            // In this case the request is marked with "Timeout" and the
            // respondedTime is set to the time when ACTIVITY_SUBTYPE_TRANSACTION_CLOSE
            // is received (after timeout).
            // If file.responseHeadersText is null the response didn't come.
            if (!file.loaded && !file.responseHeadersText)
            {
                if (FBTrace.DBG_NET_EVENTS)
                    FBTrace.sysout("net.events; TIMEOUT " + Http.safeGetRequestName(request));

                this.endLoad(file);

                file.aborted = true;
                if (!file.responseStatusText)
                    file.responseStatusText = "Aborted";

                if (!file.responseStarted)
                {
                    file.respondedTime = time;
                    file.responseStarted = true;
                }

                file.endTime = time;
            }
        }

        return file;
    },

    resolvingFile: function resolvingFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);

        if (file)
            logTime(file, "resolvingFile", time);

        if (file && file.loaded)
            return null;

        if (file && !file.resolveStarted)
        {
            file.resolveStarted = true;
            file.resolvingTime = time;
            file.connectingTime = time; // in case connecting would never came.
            file.connectedTime = time; // in case connected-to would never came.
            file.sendingTime = time;  // in case sending-to would never came.
            file.waitingForTime = time; // in case waiting-for would never came.
        }

        return file;
    },

    resolvedFile: function resolvedFile(request, time)
    {
        return null;
    },

    stopFile: function stopFile(request, time, postText, responseText)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {

            logTime(file, "stopFile", time);

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.stopFile +" + (NetUtils.now() - file.startTime) + " " +
                    getPrintableTime() + ", " + request.URI.path, file);

            // xxxHonza: spy should measure time using the activity observer too.
            // Don't ruin the endTime if it was already set.
            if (file.endTime == file.startTime)
                file.endTime = time;

            file.postText = postText;
            file.responseText = responseText;

            NetUtils.getHttpHeaders(request, file, this.context);

            this.endLoad(file);

            getCacheEntry(file, this);
        }

        return file;
    },

    abortFile: function abortFile(request, time, postText, responseText)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            logTime(file, "abortFile", time);

            file.aborted = true;
            file.responseStatusText = "Aborted";
        }

        return this.stopFile(request, time, postText, responseText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // IP Address and port number

    updateIPInfo: function(request, file)
    {
        file.localAddress = Http.safeGetLocalAddress(request);
        file.localPort = Http.safeGetLocalPort(request);
        file.remoteAddress = Http.safeGetRemoteAddress(request);
        file.remotePort = Http.safeGetRemotePort(request);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    windowPaint: function windowPaint(window, time)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.windowPaint +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        var phase = this.context.netProgress.currentPhase;
        var timeStamp = phase.addTimeStamp("MozAfterPaint", "netPaintBar");
        timeStamp.time = time;

        // Return the first file, so the layout is updated. I can happen that the
        // onLoad event is the last one and the graph end-time must be recalculated.
        return phase.files[0];
    },

    timeStamp: function timeStamp(window, time, label)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.timeStamp +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        var phase = this.context.netProgress.currentPhase;
        var timeStamp = phase.addTimeStamp(label, "netTimeStampBar");
        timeStamp.time = time;

        return phase.files[0];
    },

    windowLoad: function windowLoad(window, time)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.windowLoad +? " + getPrintableTime() + ", " +
                window.location.href, this.phases);

        if (!this.phases.length)
            return;

        // Update all requests that belong to the current phase.
        var firstPhase = this.currentPhase;

        // Keep the information also in the phase for now, NetExport and other could need it.
        firstPhase.windowLoadTime = time;

        var timeStamp = firstPhase.addTimeStamp("load", "netWindowLoadBar");
        timeStamp.time = time;

        // Return the first file, so the layout is updated. I can happen that the
        // onLoad event is the last one and the graph end-time must be recalculated.
        return firstPhase.files[0];
    },

    contentLoad: function contentLoad(window, time)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.contentLoad +? " + getPrintableTime() + ", " +
                window.location.href);

        if (!this.phases.length)
            return;

        // Update all requests that belong to the current phase.
        var firstPhase = this.currentPhase;

        // Keep the information also in the phase for now, NetExport and other could need it.
        firstPhase.contentLoadTime = time;

        var timeStamp = firstPhase.addTimeStamp("DOMContentLoaded", "netContentLoadBar");
        timeStamp.time = time;

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getRequestFile: function getRequestFile(request, win, noCreate)
    {
       // var name = Http.safeGetRequestName(request);
       // if (!name || reIgnore.exec(name))
       //     return null;

        for (var i=0; i<this.files.length; i++)
        {
            var file = this.files[i];
            if (file.request == request)
                return file;

            //xxxHonza: the client side doesn't have the channel object.
            if (file.serial == request)
                return file;
        }

        if (noCreate)
        {
            FBTrace.sysout("netProgress.getRequestFile; No create file? " +
                Http.safeGetRequestName(request), this.files);
            return null;
        }

        // xxxHonza: is this really needed?
        // In case of files coming from the server the window is not available.
        /*if (!win || Win.getRootWindow(win) != this.context.window)
        {
            FBTrace.sysout("no window " + win, this.context);
            return;
        }*/

        var fileDoc = this.getRequestDocument(win);
        var isDocument = request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI && fileDoc.parent;
        var doc = isDocument ? fileDoc.parent : fileDoc;

        var file = doc.createFile(request);
        if (isDocument)
        {
            fileDoc.documentFile = file;
            file.ownDocument = fileDoc;
        }

        file.request = request;
        this.requests.push(request);
        this.files.push(file);

        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.createFile; " + Http.safeGetRequestName(request) + " " +
                "(" + this.files.length + ")", file);

        return file;
    },

    getRequestDocument: function(win)
    {
        if (win)
        {
            var index = this.windows.indexOf(win);
            if (index == -1)
            {
                var doc = new NetDocument();
                if (win.parent != win)
                    doc.parent = this.getRequestDocument(win.parent);

                //doc.level = NetUtils.getFrameLevel(win);

                this.documents.push(doc);
                this.windows.push(win);

                return doc;
            }
            else
            {
                return this.documents[index];
            }
        }
        else
        {
            if (!this.documents.length)
                this.documents.push(new NetDocument());

            return this.documents[0];
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    endLoad: function(file)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.events.endLoad +" + (NetUtils.now() - file.startTime) + " " +
                getPrintableTime() + ", " + file.request.URI.path, file);

        // Set file as loaded.
        file.loaded = true;

        // Update last finished file of the associated phase.
        //xxxHonza: verify this.
        if (file.phase)
            file.phase.lastFinishedFile = file;
    },

    extendPhase: function(file)
    {
        // Phase start can be measured since HTTP-ON-MODIFIED-REQUEST as
        // ACTIVITY_SUBTYPE_REQUEST_HEADER won't fire if the response comes from the BF cache.
        // If it's real HTTP request we need to start again since ACTIVITY_SUBTYPE_REQUEST_HEADER
        // has the proper time.
        // Order of ACTIVITY_SUBTYPE_REQUEST_HEADER can be different than order of
        // HTTP-ON-MODIFIED-REQUEST events, see issue 4535
        if (file.phase)
        {
            if (file.phase.files[0] == file)
                file.phase.startTime = file.startTime;

            // Synchronize timeStamps in the first file with the phase.
            if (file.timeStamps)
                file.phase.timeStamps = file.timeStamps;

            // Since the request order can be wrong (see above) we need to iterate all files
            // in this phase and find the one that actually executed first.
            // In some cases, the waterfall can display a request executed before another,
            // but started later.
            // See: https://bugzilla.mozilla.org/show_bug.cgi?id=664781
            var phase = file.phase;
            for (var i=0; i<phase.files.length; i++)
            {
                var file = phase.files[i];
                if (file.startTime > 0 && phase.startTime > file.startTime)
                    phase.startTime = file.startTime;
            }
        }
        else
        {
            if (this.currentPhase)
            {
                // If the new request has been started within a "phaseInterval" after the
                // previous reqeust has been started, associate it with the current phase;
                // otherwise create a new phase.
                var phaseInterval = Options.get("netPhaseInterval");
                var lastStartTime = this.currentPhase.lastStartTime;

                var interval = file.startTime - lastStartTime;
                var startPhase = (phaseInterval > 0) && this.loaded && (interval >= phaseInterval);

                //FBTrace.sysout("netProgress.extendPhase; " + startPhase +
                //    ", loaded: " + this.loaded + ", interval: " + interval +
                //    " (default: " + phaseInterval + ")", this.context);

                if (startPhase)
                    this.startPhase(file);
                else
                    this.currentPhase.addFile(file);
            }
            else
            {
                // If there is no phase yet, just create it.
                this.startPhase(file);
            }

            // Update phase's lastFinishedFile in case of long time downloads.
            // This forces the timeline to have proper extent.
            if (file.phase && file.phase.endTime < file.endTime)
                file.phase.lastFinishedFile = file;
        }

        // Synchronize time stamps (they could come over the network)
        if (file.timeStamps)
            file.phase.timeStamps = file.timeStamps;

        // xxxHonza: phase.windowLoadTime field should be removed. Only generic timeStamps
        // array should be used instead.
        var windowLoadStamp = file.phase.getTimeStamp("load");
        if (windowLoadStamp)
            file.phase.windowLoadTime = windowLoadStamp.time;
    },

    startPhase: function(file)
    {
        var phase = new NetPhase(file);
        phase.initial = !this.currentPhase;

        file.breakLayout = true;

        this.currentPhase = phase;
        this.phases.push(phase);
    },
};

// ********************************************************************************************* //
// Time Logging

function logTime(file, title, time)
{
    // xxxHonza: just for debugging purposes.
    return;

    if (!file._timings)
        file._timings = {counter: 0};

    if (!file._timings.logs)
        file._timings.logs = [];

    file._timings.logs.push({
        title: title,
        index: ++file._timings.counter,
        time: time
    });
}

// ********************************************************************************************* //

/**
 * A Document is a helper object that represents a document (window) on the page.
 * This object is created for main page document and for every embedded document (iframe)
 * for which a request is made.
 */
function NetDocument()
{
    this.id = 0;
    this.title = "";
}

NetDocument.prototype =
{
    createFile: function(request)
    {
        var name = request.name ? request.name : "";
        return new NetFile(name, this);
    }
};

// ********************************************************************************************* //

function getCacheEntry(file, netProgress)
{
    // Bail out if the cache is disabled.
    if (!BrowserCache.isEnabled())
        return;

    // Don't request the cache entry twice.
    if (file.cacheEntryRequested)
        return;

    file.cacheEntryRequested = true;

    if (FBTrace.DBG_NET_EVENTS)
        FBTrace.sysout("net.getCacheEntry for file.href: " + file.href + "\n");

    // Pause first because this is usually called from stopFile, at which point
    // the file's cache entry is locked
    netProgress.context.setTimeout(function()
    {
        try
        {
            delayGetCacheEntry(file, netProgress);
        }
        catch (exc)
        {
            if (exc.name != "NS_ERROR_CACHE_KEY_NOT_FOUND")
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("net.delayGetCacheEntry FAILS " + file.href, exc);
            }
        }
    });
}

function delayGetCacheEntry(file, netProgress)
{
    if (FBTrace.DBG_NET_EVENTS)
        FBTrace.sysout("net.delayGetCacheEntry for file.href=" + file.href + "\n");

    // Init cache session.
    if (!cacheSession)
    {
        var cacheService = CacheService.getService(Ci.nsICacheService);
        cacheSession = cacheService.createSession("HTTP", Ci.nsICache.STORE_ANYWHERE, true);
        cacheSession.doomEntriesIfExpired = false;
    }

    cacheSession.asyncOpenCacheEntry(file.href, Ci.nsICache.ACCESS_READ,
    {
        onCacheEntryAvailable: function(descriptor, accessGranted, status)
        {
            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.onCacheEntryAvailable for file.href=" + file.href + "\n");

            if (descriptor)
            {
                if (file.size <= 0)
                    file.size = descriptor.dataSize;

                if (descriptor.lastModified && descriptor.lastFetched &&
                    descriptor.lastModified < Math.floor(file.startTime/1000)) {
                    file.fromCache = true;
                }

                file.cacheEntry = [
                  { name: "Last Modified",
                    value: NetUtils.getDateFromSeconds(descriptor.lastModified)
                  },
                  { name: "Last Fetched",
                    value: NetUtils.getDateFromSeconds(descriptor.lastFetched)
                  },
                  { name: "Expires",
                    value: NetUtils.getDateFromSeconds(descriptor.expirationTime)
                  },
                  { name: "Data Size",
                    value: descriptor.dataSize
                  },
                  { name: "Fetch Count",
                    value: descriptor.fetchCount
                  },
                  { name: "Device",
                    value: descriptor.deviceID
                  }
                ];

                // Get contentType from the cache.
                try
                {
                    var value = descriptor.getMetaDataElement("response-head");
                    var contentType = getContentTypeFromResponseHead(value);
                    file.mimeType = NetUtils.getMimeType(contentType, file.href);
                }
                catch (e)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("net.delayGetCacheEntry; EXCEPTION ", e);
                }

                descriptor.close();
                netProgress.update(file);
            }

            getCachedHeaders(file);
        }
    });
}

function getCachedHeaders(file)
{
    // Cached headers are important only if the reqeust comes from the cache.
    if (!file.fromCache)
        return;

    // The request is containing cached headers now. These will be also displayed
    // within the Net panel.
    var cache = {};
    NetUtils.getHttpHeaders(file.request, cache);
    file.cachedResponseHeaders = cache.responseHeaders;
}

function getContentTypeFromResponseHead(value)
{
    var values = value.split("\r\n");
    for (var i=0; i<values.length; i++)
    {
        var option = values[i].split(": ");
        var headerName = option[0];
        if (headerName && headerName.toLowerCase() == "content-type")
            return option[1];
    }
}

// ********************************************************************************************* //
// Helper for tracing

function getPrintableTime()
{
    var date = new Date();
    return "(" + date.getSeconds() + ":" + date.getMilliseconds() + ")";
}

// ********************************************************************************************* //
// Registration

return NetProgress;

// ********************************************************************************************* //
});
