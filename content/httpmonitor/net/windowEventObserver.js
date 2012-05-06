/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/net/netProgress",
    "httpmonitor/lib/options",
    "httpmonitor/lib/object",
    "httpmonitor/net/netUtils",
],
function(FBTrace, NetProgress, Options, Obj, NetUtils) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var windowPaint = NetProgress.prototype.windowPaint;
var timeStamp = NetProgress.prototype.timeStamp;
var windowLoad = NetProgress.prototype.windowLoad;
var contentLoad = NetProgress.prototype.contentLoad;

// ********************************************************************************************* //
// Window Events Observer

/**
 * This object is responsible for observing window events (load, DOMContentLoaded and
 * MozAfterPaint) which are displayed on network timeline.
 */
function WindowEventObserver(context)
{
    this.context = context;
}

WindowEventObserver.prototype =
{
    dispatchName: "WindowEventObserver",

    registerListeners: function()
    {
        var doc = this.context.browser.ownerDocument;
        var appcontent = doc.getElementById("appcontent");

        var win = this.context.window;

        this.onContentLoadHandler = Obj.bind(this.onContentLoad, this);
        this.onLoadHandler = Obj.bind(this.onLoad, this);

        this.context.addEventListener(appcontent, "load", this.onLoadHandler, true);
        this.context.addEventListener(appcontent, "DOMContentLoaded", this.onContentLoadHandler, true);

        // Paint events are optional.
        if (Options.get("netShowPaintEvents"))
        {
            this.onPaintHandler = Obj.bind(this.onPaint, this);
            this.context.addEventListener(appcontent, "MozAfterPaint", this.onPaintHandler, false);
        }
    },

    /**
     * Make sure all registered listeners are removed.
     */
    unregisterListeners: function()
    {
        var doc = this.context.browser.ownerDocument;
        var appcontent = doc.getElementById("appcontent");

        var win = this.context.window;

        if (this.onPaintHandler)
            this.context.removeEventListener(appcontent, "MozAfterPaint", this.onPaintHandler, false);

        if (this.onContentLoadHandler)
            this.context.removeEventListener(appcontent, "DOMContentLoaded", this.onContentLoadHandler, true);

        if (this.onLoadHandler)
            this.context.removeEventListener(appcontent, "load", this.onLoadHandler, true);

        this.onLoadHandler = null;
        this.onContentLoadHandler = null;
        this.onPaintHandler = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Handlers

    onPaint: function()
    {
        if (FBTrace.DBG_WINDOW_EVENT_OBSERVER)
            FBTrace.sysout("windowEventObserver.onPaint;");

        if (this.context.netProgress)
            this.context.netProgress.post(windowPaint, [this.context.window, NetUtils.now()]);
    },

    onContentLoad: function(event)
    {
        if (event.originalTarget != this.context.window.document)
            return;

        if (FBTrace.DBG_WINDOW_EVENT_OBSERVER)
            FBTrace.sysout("windowEventObserver.onContentLoad;");

        var doc = this.context.browser.ownerDocument;
        var appcontent = doc.getElementById("appcontent");

        var win = this.context.window;

        if (this.context.netProgress)
            this.context.netProgress.post(contentLoad, [win, NetUtils.now()]);

        this.context.removeEventListener(appcontent, "DOMContentLoaded", this.onContentLoadHandler, true);
        this.onContentLoadHandler = null;
    },

    onLoad: function(event)
    {
        if (event.originalTarget != this.context.window.document)
            return;

        if (FBTrace.DBG_WINDOW_EVENT_OBSERVER)
            FBTrace.sysout("windowEventObserver.onLoad;");

        var doc = this.context.browser.ownerDocument;
        var appcontent = doc.getElementById("appcontent");

        var win = this.context.window;

        if (this.context.netProgress)
            this.context.netProgress.post(windowLoad, [win, NetUtils.now()]);

        this.context.removeEventListener(appcontent, "load", this.onLoadHandler, true);
        this.onLoadHandler = null;

        this.context.loaded = true;

        // The paint listener is automatically removed when the window is loaded
        // We don't want to see further paint events on the net view since it would
        // shrink the waterfall diagram to unreadable minimum. But do it after a small
        // timeout so, a paint event immediately following the load is visible.
        // xxxHonza: there could be a pref for the timeout.
        var self = this;
        this.context.setTimeout(function()
        {
            if (win && !win.closed && self.onPaintHandler)
            {
                self.context.removeEventListener(appcontent, "MozAfterPaint", self.onPaintHandler, false);
                self.onPaintHandler = null;
            }
        }, 2000);
    },
}

// ********************************************************************************************* //
// Registration

return WindowEventObserver;

// ********************************************************************************************* //
});
