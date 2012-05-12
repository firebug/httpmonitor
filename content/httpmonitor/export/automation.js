/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ********************************************************************************************* //

const Cc = Components.classes;
const Ci = Components.interfaces;

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

var autoExportButton = $("netExportAuto");
var prefDomain = "extensions.firebug.netexport";

Components.utils["import"]("resource://firebug/firebug-http-observer.js");
var httpObserver = httpRequestObserver;

// ********************************************************************************************* //
// Controller for automatic export.

/**
 * @class This object manages <i>Auto Export<i> functionality. This features is activated by
 * calling <i>activate</i> method and deactivated by calling <i>deactivate</i> method.
 * 
 * When Auto Export is activated a {@link Firebug.NetExport.HttpObserver} is registered.
 * When deactivated the {@link Firebug.NetExport.HttpObserver} is unregistered.
 * As soon as a page (top level window) is loaded, onPageLoaded (method of this object is called).
 */
Firebug.NetExport.Automation = extend(Firebug.Module,
/** @lends Firebug.NetExport.Automation */
{
    active: false,
    logFolder: null,
    dispatchName: "netExportAutomation",

    initialize: function(owner)
    {
        // Register as a listener into the http-observer in order to handle
        // onPageLoaded events. These are fired only if the auto-export feature
        // is activated.
        HttpObserver.addListener(this);

        // Activate auto-export automatically if the preference says so.
        if (Firebug.getPref(prefDomain, "alwaysEnableAutoExport"))
        {
            if (!this.isActive())
                this.activate();

            // Make sure Firebug's net observer is activated.
            if (httpObserver.registerObservers)
                httpObserver.registerObservers();
        }
    },

    shutdown: function()
    {
        HttpObserver.removeListener(this);
    },

    // Make sure the Auto Export button is properly updated withing the Net panel.
    showPanel: function(browser, panel)
    {
        if (panel && panel.name == "net")
            this.updateUI();
    },

    // Activation
    isActive: function()
    {
        return this.active;
    },

    activate: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation: Auto export activated.");

        this.active = true;
        this.updateUI();

        HttpObserver.register();
    },

    deactivate: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation: Auto export deactivated.");

        this.active = false;
        this.updateUI();

        HttpObserver.unregister();
    },

    updateUI: function()
    {
        autoExportButton.setAttribute("state", this.active ? "active" : "inactive");
        autoExportButton.setAttribute("tooltiptext", this.active ?
            $STR("netexport.menu.tooltip.Deactivate Auto Export") :
            $STR("netexport.menu.tooltip.Activate Auto Export"));
    },

    // Callback, the page has been loaded.
    onPageLoaded: function(win)
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; PAGE LOADED : " + safeGetWindowLocation(win));

        HttpObserver.removePageObserver(win);

        // Tab watcher is not global in 1.7
        var TabWatcher = Firebug.TabWatcher ? Firebug.TabWatcher : top.TabWatcher;

        // Export current context.
        var context = TabWatcher.getContextByWindow(win);
        if (!context)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; ERROR: NO CONTEXT to export: " +
                    safeGetWindowLocation(win));
            return;
        }

        var json = Firebug.NetExport.Exporter.buildJSON(context, true);
        var jsonString = Firebug.NetExport.Exporter.buildData(json);

        // Store collected data into a HAR file (within default directory).
        if (Firebug.getPref(prefDomain, "autoExportToFile"))
            this.exportToFile(win, jsonString, context);

        // Send collected data to the server.
        if (Firebug.getPref(prefDomain, "autoExportToServer"))
            Firebug.NetExport.HARUploader.upload(context, false, false, jsonString);

        //xxxHonza: should preview be used for automation?
        /*if (Firebug.getPref(prefDomain, "showPreview"))
        {
            var viewerURL = Firebug.getPref(prefDomain, "viewerURL");
            if (viewerURL)
                Firebug.NetExport.ViewerOpener.openViewer(viewerURL, jsonString);
        }*/
    },

    exportToFile: function(win, jsonString, context)
    {
        var file = Logger.getDefaultFolder();
        var now = new Date();

        function f(n, c) {
            if (!c) c = 2;
            var s = new String(n);
            while (s.length < c) s = "0" + s;
            return s;
        }

        var loc = Firebug.NetExport.safeGetWindowLocation(win);

        // File name can't use ":" so, make sure it's replaced by "-" in case
        // port number is specified in the URL (issue 4025).
        var name = loc ? loc.host : "unknown";
        name = name.replace(/\:/gm, "-", "");

        var fileName = name + "+" + now.getFullYear() + "-" +
            f(now.getMonth()+1) + "-" + f(now.getDate()) + "+" + f(now.getHours()) + "-" +
            f(now.getMinutes()) + "-" + f(now.getSeconds());

        // Default file extension is zip if compressing is on, otherwise just har.
        var fileExt = ".har";
        if (Firebug.getPref(prefDomain, "compress"))
            fileExt += ".zip";

        file.append(fileName + fileExt);
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

        // Just for tracing purposes (can be changed within the saveToFile).
        var filePath = file.path;

        // Export data from the current context.
        // xxxHonza: what about JSONP support for auto export?
        Firebug.NetExport.Exporter.saveToFile(file, jsonString, context, false);

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; PAGE EXPORTED: " + filePath);
    }
});

// ********************************************************************************************* //

/**
 * @class This object is created for a top level window that is being loaded. All requests
 * are collected in an internal array and removed when proper response is received.
 * As soon as the requests list is empty again, the object waits for specified
 * amount of time (see: extensions.firebug.netexport.pageLoadedTimeout) and if no request
 * is made during this period the page is declared to be loaded.
 * 
 * @param {Object} win The monitored window.
 */
Firebug.NetExport.PageLoadObserver = function(win)
{
    this.window = win;
    this.requests = [];

    // These must be true in order to declare the window loaded.
    this.loaded = false;
    this.painted = false;

    this.registerForWindowLoad();

    // This timeout causes the page to be exported even if it's not fully loaded yet.
    var time = Firebug.getPref(prefDomain, "timeout");
    if (time > 0)
        this.absoluteTimeout = setTimeout(bindFixed(this.onAbsoluteTimeout, this), time);
}

Firebug.NetExport.PageLoadObserver.prototype =
/** @lends Firebug.NetExport.PageLoadObserver */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // HTTP Requests counter

    addRequest: function(request)
    {
        this.requests.push(request);
        this.resetTimeout();
    },

    removeRequest: function(request)
    {
        remove(this.requests, request);
        this.resetTimeout();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    resetTimeout: function()
    {
        // Remove the current timeout if any.
        if (this.timeout)
        {
            clearTimeout(this.timeout);
            delete this.timeout;
        }

        // 1) The page is not loaded if there are pending requests.
        if (this.requests.length > 0)
            return;

        // 2) The page is not loaded if the 'load' event wasn't fired for the window.
        // Also at least one paint event is required.
        if (!this.loaded || !this.painted)
            return;

        // 3) The page is loaded if there is no new request after specified timeout.
        // extensions.firebug.netexport.pageLoadedTimeout
        this.timeout = setTimeout(bindFixed(this.onPageLoaded, this),
            Firebug.getPref(prefDomain, "pageLoadedTimeout"));
    },

    // Called after timeout when there is no other request.
    onPageLoaded: function()
    {
        // If no reqeusts appeared, the page is loaded.
        if (this.requests.length == 0)
            HttpObserver.onPageLoaded(this.window);
    },

    // Absolute timout used to export pages that never finish loading.
    onAbsoluteTimeout: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.onAbsoluteTimeout; Export now!");

        HttpObserver.onPageLoaded(this.window);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for window loaded events.

    getBrowserByWindow: function(win)
    {
        var browsers = Firebug.chrome.getBrowsers();
        for (var i = 0; i < browsers.length; ++i)
        {
            var browser = browsers[i];
            if (browser.contentWindow == win)
                return browser;
        }

        return null;
    },

    // Wait for all event that must be fired before the window is loaded.
    // Any event is missing?
    // xxxHonza: In case of Firefox 3.7 the new 'content-document-global-created'
    // (bug549539) could be utilized.
    onEvent: function(event)
    {
        if (event.type == "load")
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.PageLoadObserver; 'load': " +
                    safeGetWindowLocation(this.window));

            var browser = this.getBrowserByWindow(this.window);
            browser.removeEventListener("load", this.onEventHandler, true);
            this.loaded = true;
        }
        else if (event.type == "MozAfterPaint")
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.PageLoadObserver; 'MozAfterPaint': " +
                    safeGetWindowLocation(this.window));

            var browser = this.getBrowserByWindow(this.window);
            browser.removeEventListener("MozAfterPaint", this.onEventHandler, true);
            this.painted = true;
        }

        // Execute callback after 100ms timout (the inspector tests need it for now),
        // but this shoud be set to 0.
        if (this.loaded && this.painted)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.PageLoadObserver; window is loaded: " +
                    safeGetWindowLocation(this.window));

            // Are we loaded yet?
            this.resetTimeout();
        }
    },

    registerForWindowLoad: function()
    {
        this.onEventHandler = bind(this.onEvent, this);

        var browser = this.getBrowserByWindow(this.window);
        browser.addEventListener("load", this.onEventHandler, true);
        browser.addEventListener("MozAfterPaint", this.onEventHandler, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Clean up

    destroy: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.PageLoadObserver; destroy " + this.window.location);

        try
        {
            clearTimeout(this.absoluteTimeout);
            delete this.absoluteTimeout;

            clearTimeout(this.timeout);
            delete this.timeout;

            var browser = this.getBrowserByWindow(this.window);
            if (!this.loaded)
                browser.removeEventListener("load", this.onEventHandler, true);

            if (!this.painted)
                browser.removeEventListener("MozAfterPaint", this.onEventHandler, true);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.PageLoadObserver; EXCEPTION", err);
        }
    },
};

// ********************************************************************************************* //
// HTTP Observer

/**
 * @class This object utilizes "@joehewitt.com/firebug-http-observer;1" to watch all requests made
 * by a page (top level window). As soon as the first document "http-on-modify-request" is sent by
 * the top level window, a {@link Firebug.NetExport.PageLoadObserver} object is instanciated (for
 * that window) and all requests/responses forwarded to it.
 */
Firebug.NetExport.HttpObserver = extend(new Firebug.Listener(),
/** @lends Firebug.NetExport.HttpObserver */
{
    registered: false,
    pageObservers: [],

    register: function()
    {
        if (this.registered)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.HttpObserver; HTTP observer already registered!");
            return;
        }

        httpObserver.addObserver(this, "firebug-http-event", false);

        // Register also activity-distributor observer. This one is necessary for
        // catching ACTIVITY_SUBTYPE_TRANSACTION_CLOSE event. In the case of request
        // timehout when none of the http-on-* requests is fired.
        var distributor = this.getActivityDistributor();
        if (distributor)
            distributor.addObserver(this);

        this.registered = true;
    },

    unregister: function()
    {
        if (!this.registered)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.HttpObserver; HTTP observer already unregistered!");
            return;
        }

        httpObserver.removeObserver(this, "firebug-http-event");

        var distributor = this.getActivityDistributor();
        if (distributor)
            distributor.removeObserver(this);

        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            // xxxHonza: this is duplication, fix me.
            var win = getWindowForRequest(subject);
            if (!win)
                return;

            var tabId = win ? Firebug.getTabIdForWindow(win) : null;
            if (!tabId)
                return;

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
            else if (topic == "http-on-examine-response" )
                this.onExamineResponse(subject, win);
            else if (topic == "http-on-examine-cached-response")
                this.onExamineResponse(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        var isRedirect = (name != origName);

        // We need to catch new document load.
        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect)
        {
            // The page observer is always created for the top level window.
            this.addPageObserver(win);
        }

        this.onRequestBegin(request, win);
    },

    onExamineResponse: function(request, win)
    {
        this.onRequestEnd(request, win);
    },

    // Page load observers
    addPageObserver: function(win)
    {
        var observer = this.getPageObserver(win);
        if (observer)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; PAGE OBSERVER DETECTED for: " +
                    safeGetWindowLocation(win));

            // In cases where an existing page is reloaded before the previous load
            // finished, let's export what we have.
            Automation.onPageLoaded(win);
        }

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; PAGE OBSERVER CREATED for: " +
                safeGetWindowLocation(win));

        // Create page load observer. This object knows when to fire the "page loaded" event.
        var observer = new PageLoadObserver(win);
        this.pageObservers.push(observer);
    },

    getPageObserver: function(win)
    {
        for (var i=0; i<this.pageObservers.length; i++)
        {
            var observer = this.pageObservers[i];
            if (win == this.pageObservers[i].window)
                return observer;
        }
    },

    removePageObserver: function(win)
    {
        var pageObserver = this.getPageObserver(win);
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; ERROR Can't remove page observer for: " +
                    safeGetWindowLocation(win));
            return;
        }

        pageObserver.destroy();
        remove(this.pageObservers, pageObserver);

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; Page load observer removed for: " +
                safeGetWindowLocation(win));
    },

    onRequestBegin: function(request, win)
    {
        win = getRootWindow(win);
        var pageObserver = this.getPageObserver(win);
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation.onRequestBegin; ERROR No page-observer for " +
                    safeGetRequestName(request), this.pageObservers);
            return;
        }

        pageObserver.addRequest(request);
    },

    onRequestEnd: function(request, win)
    {
        win = getRootWindow(win);

        var pageObserver = this.getPageObserver(win);
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation.onRequestEnd; ERROR No page-observer for " +
                    safeGetRequestName(request), this.pageObservers);
            return;
        }

        pageObserver.removeRequest(request);
    },

    onPageLoaded: function(win)
    {
        dispatch(this.fbListeners, "onPageLoaded", [win]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsISupports

    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIActivityObserver) ||
            iid.equals(Ci.nsIObserver))
         {
             return this;
         }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activity Distributor.

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

                if (FBTrace.DBG_NETEXPORT)
                    FBTrace.sysout("netexport.NetHttpActivityObserver; Activity Observer Registered");
            }
            catch (err)
            {
                if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("netexport.NetHttpActivityObserver; Activity Observer EXCEPTION", err);
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
            FBTrace.sysout("netexport.observeActivity: EXCEPTION "+exc, exc);
        }
    },

    observeRequest: function(httpChannel, activityType, activitySubtype, timestamp,
        extraSizeData, extraStringData)
    {
        var win = getWindowForRequest(httpChannel);
        if (!win)
            return;

        // In case of a request timeout we need this event to see that the
        // transation has been actually closed (even if none of the "http-on*"
        // events has been received.
        // This code ensures that the request is removed from the list of active
        // requests (and so we can declare "page-loaded" later - if the list is empty.
        if (activityType == Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION &&
            activitySubtype == Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE)
        {
            this.onRequestEnd(httpChannel, win);
        }
    },
});

// ********************************************************************************************* //

Firebug.NetExport.Logger =
{
    getDefaultFolder: function()
    {
        var dir;
        var path = Firebug.getPref(prefDomain, "defaultLogDir");
        if (!path)
        {
            // Create default folder for automated net logs.
            var dir = dirService.get("ProfD", Ci.nsILocalFile);
            dir.append("firebug");
            dir.append("netexport");
            dir.append("logs");
        }
        else
        {
            dir = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
            dir.initWithPath(path);
        }

        return dir;
    },

    // Handle user command.
    onDefaultLogDirectory: function(event)
    {
        // Open File dialog and let the user to pick target directory for automated logs.
        var nsIFilePicker = Ci.nsIFilePicker;
        var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
        fp.displayDirectory = this.getDefaultFolder();
        fp.init(window, "Select target folder for automated logs:", //xxxHonza: localization
            nsIFilePicker.modeGetFolder);

        var rv = fp.show();
        if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            Firebug.setPref(prefDomain, "defaultLogDir", fp.file.path);

        cancelEvent(event);
    },
}

// ********************************************************************************************* //
// Shortcuts for this namespace

var Automation = Firebug.NetExport.Automation;
var HttpObserver = Firebug.NetExport.HttpObserver;
var PageLoadObserver = Firebug.NetExport.PageLoadObserver;
var Logger = Firebug.NetExport.Logger;

// ********************************************************************************************* //

Firebug.registerModule(Firebug.NetExport.Automation);

// ********************************************************************************************* //
}});
