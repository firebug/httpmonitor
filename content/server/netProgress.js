/* See license.txt for terms of usage */

define([
    "lib/trace",
    "server/netMonitor",
    "net/netUtils",
    "lib/string",
    "lib/http",
    "lib/object",
],
function(FBTrace, NetworkMonitor, NetUtils, Str, Http, Obj) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var Timer = Cc["@mozilla.org/timer;1"];

// ID generator
var gSerialNumber = 0;

// ********************************************************************************************* //
// Network Monitor (the public object)

function NetworkProgress()
{
    this.files = [];
}

NetworkProgress.prototype =
{
    initialize: function(win, callback)
    {
        this.win = win;
        this.callback = callback;

        this.networkMonitor = new NetworkMonitor();
        this.networkMonitor.register(this.win, Obj.bind(this.onNetworkEvent, this));
    },

    destroy: function()
    {
        if (this.networkMonitor)
            this.networkMonitor.unregister();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Flush

    flush: function()
    {
        // If timeout already in progress than bail out.
        if (this.flushTimer)
            return;

        var onFlush = Obj.bind(this.onFlush, this);
        this.flushTimer = Timer.createInstance(Ci.nsITimer);
        this.flushTimer.initWithCallback(this, 300, Ci.nsITimer.TYPE_ONE_SHOT);
    },

    notify: function(timer)
    {
        // The channel can't be obviously transferred over the network so, let's
        // replace the object by  unique ID.
        for (var i=0; i<this.files.length; i++)
        {
            var file = this.files[i];
            file.request = file.serial;
        }

        this.callback(this.files);

        this.flushTimer = null;
        this.files = [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Network Monitor

    onNetworkEvent: function(eventId, args)
    {
        try
        {
            var callback = this[eventId];
            var file = callback.apply(this, args);
            if (file)
                this.flush();
        }
        catch (err)
        {
            FBTrace.sysout("networkProgress; EXCEPTION " + err, err);
        }
    },

    getRequestFile: function(request)
    {
        for (var i=0; i<this.files.length; i++)
        {
            var file = this.files[i];
            if (file.request == request)
                return file;
        }

        var file = {
            serial: ++gSerialNumber,
            href: Http.safeGetRequestName(request),
        };

        file.request = request;
        this.files.push(file);


        return file;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startFile: function startFile(request, win)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
            // Parse URL params so, they are available for conditional breakpoints.
            //file.urlParams = Url.parseURLParams(file.href);
            //this.breakOnXHR(file);
        }
    },

    requestedHeaderFile: function(request, time, win, xhr, extraStringData)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            file.requestHeadersText = extraStringData;

            this.requestedFile(request, time, win, xhr);

            //Events.dispatch(Firebug.NetMonitor.fbListeners, "onRequest", [this.context, file]);
        }
    },

    // Can be called from onModifyRequest (to catch request start even in case of BF cache) and also
    // from requestHeaderFile (activity observer)
    requestedFile: function requestedFile(request, time, win, xhr)
    {
        var file = this.getRequestFile(request, win);
        if (file)
        {
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

            return file;
        }
        else
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.requestedFile no file for request=");
        }
    },

    respondedHeaderFile: function(request, time, extraStringData)
    {
        var file = this.getRequestFile(request);
        if (file)
            file.responseHeadersText = extraStringData;
    },

    bodySentFile: function bodySentFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            //NetUtils.getPostText(file, this.context);
        }
    },

    responseStartedFile: function responseStartedFile(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            file.respondedTime = time;
            file.endTime = time;
            return file;
        }
    },

    respondedFile: function respondedFile(request, time, info)
    {
        //Events.dispatch(Firebug.NetMonitor.fbListeners, "onExamineResponse", [this.context, request]);

        var file = this.getRequestFile(request);
        if (file)
        {
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

            //NetUtils.getHttpHeaders(request, file);

            if (info)
            {
                file.responseStatus = info.responseStatus;
                file.responseStatusText = info.responseStatusText;
                file.postText = info.postText;
            }

            file.aborted = false;

            // Use ACTIVITY_SUBTYPE_RESPONSE_COMPLETE to get the info if possible.
            /*if (!Ci.nsIHttpActivityDistributor)
            {
                if (file.fromCache)
                    getCacheEntry(file, this);
            }*/

            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.respondedFile +" + (NetUtils.now() - file.startTime) + " " +
                     getPrintableTime() + ", " + request.URI.path, file);

            // The ACTIVITY_SUBTYPE_TRANSACTION_CLOSE could come earlier.
            if (file.loaded)
                return;

            this.endLoad(file);

            // If there is a network error, log it into the Console panel.
            /*if (Firebug.showNetworkErrors && Firebug.NetMonitor.NetRequestEntry.isError(file))
            {
                Firebug.Errors.increaseCount(this.context);
                var message = "NetworkError: " + Firebug.NetMonitor.NetRequestEntry.getStatus(file) + " - "+file.href;
                Firebug.Console.log(message, this.context, "error", null, true, file.getFileLink(message));
            }*/

            //Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponse", [this.context, file]);
            return file;
        }
    },

    waitingForFile: function waitingForFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            if (!file.receivingStarted)
            {
                file.waitingForTime = time;
                file.receivingStarted = true;
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
            // Remember when the send started.
            if (!file.sendStarted)
            {
                file.sendingTime = time;
                file.waitingForTime = time; // in case waiting-for would never came.
                file.sendStarted = true;
            }

            file.totalSent = size;

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
        if (file)
        {
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
        if (file)
        {
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
            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.receivingFile +" + time + " " +
                    getPrintableTime() + ", " +
                    Str.formatSize(size) + " (" + size + "B), " +
                    request.URI.path, file);

            file.endTime = time;
            file.totalReceived = size;

            // Update phase's lastFinishedFile in case of long time downloads.
            // This forces the timeline to have proper extent.
            //if (file.phase && file.phase.endTime < time)
            //    file.phase.lastFinishedFile = file;

            // Force update UI.
            /*if (file.row && Css.hasClass(file.row, "opened"))
            {
                var netInfoBox = file.row.nextSibling.getElementsByClassName("netInfoBody").item(0);
                if (netInfoBox)
                {
                    netInfoBox.responsePresented = false;
                    netInfoBox.htmlPresented = false;
                }
            }*/
        }

        return file;
    },

    responseCompletedFile: function responseCompletedFile(request, time, responseSize)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
            if (FBTrace.DBG_NET_EVENTS)
                FBTrace.sysout("net.events.responseCompletedFile +" + time + " " +
                    getPrintableTime() + ", " + request.URI.path, file);

            if (responseSize > 0)
                file.size = responseSize;

            // This was only a helper to show download progress.
            file.totalReceived = 0;

            // The request is completed, get cache entry.
            //getCacheEntry(file, this);

            // Sometimes the HTTP-ON-EXAMINE-RESPONSE doesn't come.
            /*if (!file.loaded  && file.responseHeadersText)
            {
                var info = null;
                var m = file.responseHeadersText.match(reResponseStatus);
                if (m.length == 3)
                    info = {responseStatus: m[1], responseStatusText: m[2]};
                this.respondedFile(request, NetUtils.now(), info);
            }*/

            this.endLoad(file);

            this.updateIPInfo(request, file);
        }

        return file;
    },

    closedFile: function closedFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
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
                    FBTrace.sysout("net.events; TIMEOUT " + safeGetRequestName(request));

                this.endLoad(file);

                file.aborted = true;
                if (!file.responseStatusText)
                    file.responseStatusText = "Aborted";
                file.respondedTime = time;
                file.endTime = time;
            }
        }

        return file;
    },

    resolvingFile: function resolvingFile(request, time)
    {
        var file = this.getRequestFile(request, null, true);
        if (file)
        {
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // IP Address and port number

    updateIPInfo: function(request, file)
    {
        //file.localAddress = Http.safeGetLocalAddress(request);
        //file.localPort = Http.safeGetLocalPort(request);
        //file.remoteAddress = Http.safeGetRemoteAddress(request);
        //file.remotePort = Http.safeGetRemotePort(request);
    },

    endLoad: function(file)
    {
        if (FBTrace.DBG_NET_EVENTS)
            FBTrace.sysout("net.events.endLoad +" + (NetUtils.now() - file.startTime) + " " +
                getPrintableTime() + ", " + file.request.URI.path, file);

        // Set file as loaded.
        file.loaded = true;
    },
};

// ********************************************************************************************* //

function getPrintableTime()
{
    var date = new Date();
    return "(" + date.getSeconds() + ":" + date.getMilliseconds() + ")";
}

// ********************************************************************************************* //
// Registration

return NetworkProgress;

// ********************************************************************************************* //
});
