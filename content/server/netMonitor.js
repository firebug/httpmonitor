/* See license.txt for terms of usage */

define([
    "lib/trace",
    "chrome/window",
    "lib/http",
],
function(FBTrace, Window, Http) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var nsIHttpActivityObserver = Ci.nsIHttpActivityObserver;
var nsISocketTransport = Ci.nsISocketTransport;

// ********************************************************************************************* //
// Network Monitor (the public object)

function NetworkMonitor()
{
}

NetworkMonitor.prototype =
{
    register: function(win, callback)
    {
        if (this.registered)
            return;

        this.activityObserver = new ActivityObserver(win, callback);
        this.httpObserver = new HttpObserver(win, callback);

        this.activityObserver.registerObserver();
        this.httpObserver.registerObserver();

        this.registered = true;
    },

    unregister: function()
    {
        if (!this.registered)
            return;

        this.activityObserver.unregisterObserver();
        this.httpObserver.unregisterObserver();

        this.registered = false;
    }
};

// ********************************************************************************************* //
// HTTP Observer

function HttpObserver(win, callback)
{
    this.window = win;
    this.callback = callback;
}

HttpObserver.prototype =
{
    registerObserver: function()
    {
    },

    unregisterObserver: function()
    {
    }
}

// ********************************************************************************************* //
// Activity Observer

function ActivityObserver(win, callback)
{
    this.window = win;
    this.callback = callback;
    this.activeRequests = [];
    this.windowId = Window.getWindowProxyIdForWindow(win);
}

ActivityObserver.prototype =
{
    registered: false,

    registerObserver: function()
    {
        if (!Ci.nsIHttpActivityDistributor)
            return;

        if (this.registered)
            return;

        var distributor = this.getActivityDistributor();
        if (!distributor)
            return;

        distributor.addObserver(this);
        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (!Ci.nsIHttpActivityDistributor)
            return;

        if (!this.registered)
            return;

        var distributor = this.getActivityDistributor();
        if (!distributor)
            return;

        distributor.removeObserver(this);
        this.registered = false;
    },

    getActivityDistributor: function()
    {
        if (!this.activityDistributor)
        {
            try
            {
                var hadClass = Cc["@mozilla.org/network/http-activity-distributor;1"];
                if (!hadClass)
                    return null;

                this.activityDistributor = hadClass.getService(Ci.nsIHttpActivityDistributor);

                if (FBTrace.DBG_ACTIVITYOBSERVER)
                    FBTrace.sysout("net.NetHttpActivityObserver; Activity Observer Registered");
            }
            catch (err)
            {
                if (FBTrace.DBG_ACTIVITYOBSERVER || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("net.NetHttpActivityObserver; Activity Observer EXCEPTION", err);
            }
        }
        return this.activityDistributor;
    },

    /* nsIActivityObserver */
    observeActivity: function(httpChannel, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        try
        {
            if (httpChannel instanceof Ci.nsIHttpChannel)
                this.observeRequest(httpChannel, activityType, activitySubtype, timestamp,
                    extraSizeData, extraStringData);
        }
        catch (exc)
        {
            // then we are in some sane scope
            if ((typeof(FBTrace) !== undefined) && FBTrace && FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.observeActivity: EXCEPTION "+exc, exc);
        }
    },

    observeRequest: function(httpChannel, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        var win = Http.getWindowForRequest(httpChannel);
        if (!win)
        {
            var index = this.activeRequests.indexOf(httpChannel);
            if (index == -1)
                return;

            if (!(win = this.activeRequests[index+1]))
                return;
        }

        // If the requests doesn't belong to the observed window bail out.
        var winId = Window.getWindowProxyIdForWindow(win.top);
        if (winId != this.windowId)
            return;

        var time = new Date();
        time.setTime(timestamp/1000);

        if (FBTrace.DBG_ACTIVITYOBSERVER)
        {
            FBTrace.sysout("activityObserver.observeActivity; " +
                NetUtils.getTimeLabel(time) + ", " +
                Http.safeGetRequestName(httpChannel) + ", " +
                getActivityTypeDescription(activityType) + ", " +
                getActivitySubtypeDescription(activitySubtype) + ", " +
                extraSizeData,
                extraStringData);
        }

        time = time.getTime();

        if (activityType == nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION)
        {
            if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER)
            {
                this.activeRequests.push(httpChannel);
                this.activeRequests.push(win);

                var xhr = Http.isXHR(httpChannel);
                this.post("startFile", [httpChannel, win]);
                this.post("requestedFile", [httpChannel, time, win, xhr]);
                this.post("requestedHeaderFile", [httpChannel, time, win, xhr, extraStringData]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE)
            {
                var index = this.activeRequests.indexOf(httpChannel);
                this.activeRequests.splice(index, 2);

                this.post("closedFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_HEADER)
            {
                this.post("respondedHeaderFile", [httpChannel, time, extraStringData]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_BODY_SENT)
            {
                this.post("bodySentFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_START)
            {
                this.post("responseStartedFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_COMPLETE)
            {
                this.post("responseCompletedFile", [httpChannel, time, extraSizeData]);
            }
        }
        else if (activityType == nsIHttpActivityObserver.ACTIVITY_TYPE_SOCKET_TRANSPORT)
        {
            if (activitySubtype == nsISocketTransport.STATUS_RESOLVING)
            {
                this.post("resolvingFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_RESOLVED)
            {
                this.post("resolvedFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_CONNECTING_TO)
            {
                this.post("connectingFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_CONNECTED_TO)
            {
                this.post("connectedFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_SENDING_TO)
            {
                this.post("sendingFile", [httpChannel, time, extraSizeData]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_WAITING_FOR)
            {
                this.post("waitingForFile", [httpChannel, time]);
            }
            else if (activitySubtype == nsISocketTransport.STATUS_RECEIVING_FROM)
            {
                this.post("receivingFile", [httpChannel, time, extraSizeData]);
            }
        }
    },

    post: function(eventId, args)
    {
        this.callback(eventId, args);
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIActivityObserver)) {
            return this;
         }

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
}

// ********************************************************************************************* //
// Activity Observer Tracing Support

function getActivityTypeDescription(a)
{
    switch (a)
    {
    case nsIHttpActivityObserver.ACTIVITY_TYPE_SOCKET_TRANSPORT:
        return "ACTIVITY_TYPE_SOCKET_TRANSPORT";
    case nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION:
        return "ACTIVITY_TYPE_HTTP_TRANSACTION";
    default:
        return a;
    }
}

function getActivitySubtypeDescription(a)
{
    switch (a)
    {
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER:
        return "ACTIVITY_SUBTYPE_REQUEST_HEADER";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_BODY_SENT:
          return "ACTIVITY_SUBTYPE_REQUEST_BODY_SENT";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_START:
        return "ACTIVITY_SUBTYPE_RESPONSE_START";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_HEADER:
        return "ACTIVITY_SUBTYPE_RESPONSE_HEADER";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_COMPLETE:
        return "ACTIVITY_SUBTYPE_RESPONSE_COMPLETE";
    case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE:
        return "ACTIVITY_SUBTYPE_TRANSACTION_CLOSE";

    case nsISocketTransport.STATUS_RESOLVING:
        return "STATUS_RESOLVING";
    case nsISocketTransport.STATUS_CONNECTING_TO:
        return "STATUS_CONNECTING_TO";
    case nsISocketTransport.STATUS_CONNECTED_TO:
        return "STATUS_CONNECTED_TO";
    case nsISocketTransport.STATUS_SENDING_TO:
        return "STATUS_SENDING_TO";
    case nsISocketTransport.STATUS_WAITING_FOR:
        return "STATUS_WAITING_FOR";
    case nsISocketTransport.STATUS_RECEIVING_FROM:
        return "STATUS_RECEIVING_FROM";

    default:
        return a;
    }
}

// ********************************************************************************************* //
// Registration

return NetworkMonitor;

// ********************************************************************************************* //
});
