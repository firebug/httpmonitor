/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/http",
    "httpmonitor/net/requestObserver",
],
function(FBTrace, Http, RequestObserver) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// ********************************************************************************************* //
// Document Load Observer

function DocumentLoadObserver()
{
    this.listener = null;
}

/**
 * This observer is responsible for watching HTTP requests and identifying a moment when a new
 * top document is requested to load. In such case the attached listener is notified.
 *
 * This observer is useful in cases where we need to track document load from very
 * begining to properly catch e.g. complete page load time.
 */
DocumentLoadObserver.prototype =
/** @lends DocumentLoadObserver */
{
    dispatchName: "DocumentLoadObserver",
    listener: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    register: function(listener)
    {
        if (this.listener)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("DocumentLoadObserver.register;");

        RequestObserver.addObserver(this, "http-event", false);

        this.listener = listener;
    },

    unregister: function()
    {
        if (!this.listener)
            return;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("DocumentLoadObserver.unregister;");

        RequestObserver.removeObserver(this, "http-event");

        this.listener = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIObserve

    observe: function(subject, topic, data)
    {
        try
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            // Get parent window and ignore HTTP coming from chrome scope (e.g. extensions)
            var win = Http.getWindowForRequest(subject);
            if (!win)
                return;

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        var isRedirect = (name != origName);

        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect)
        {
            // A new document is requested, fire an event.
            this.listener.onLoadDocument(request, win);
        }
    }
}

// ********************************************************************************************* //
// Registration

return DocumentLoadObserver;

// ********************************************************************************************* //
});
