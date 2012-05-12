/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

var prefDomain = "extensions.firebug.netexport";

// ********************************************************************************************* //
// Automated load of a page suite

Firebug.NetExport.PageLoader = extend(Firebug.Module,
{
    currentSuite: null,
    dispatchName: "netExportPageLoader",

    initialize: function(owner)
    {
        Firebug.NetExport.HttpObserver.addListener(this);
    },

    shutdown: function()
    {
        Firebug.NetExport.HttpObserver.removeListener(this);
    },

    runSuite: function(suite)
    {
        if (!suite || !suite.length)
            return;

        this.pageSuite = new PageSuite(suite);
        this.pageSuite.run(function()
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.loadSuite; DONE");

            //xxxHonza this.pageSuite = null;
        });
    },

    loadSuite: function()
    {
        try
        {
            var file = dirService.get("ProfD", Ci.nsILocalFile);
            file.append("firebug");
            file.append("netexport");
            file.append("sites.txt");

            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Ci.nsIConverterInputStream);

            // Initialize input stream.
            inputStream.init(file, -1, -1, 0); // read-only
            cstream.init(inputStream, "UTF-8", 0, 0);

            // Load URLs.
            var data = {};
            cstream.readString(-1, data);
            if (!data.value.length)
                return null;

            var lines = splitLines(data.value);

            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.pageLoader; Page suite loaded (" +
                    lines.length + "):", lines);

            return lines;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.loadSuite; EXCEPTION", err);
        }

        return null;
    }
});

// ********************************************************************************************* //
// Page load automation

Firebug.NetExport.PageSuite = function(pages)
{
    this.pages = pages;
}

Firebug.NetExport.PageSuite.prototype =
{
    run: function(callback)
    {
        this.finishCallback = callback;

        if (!this.pages.length)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.pageSuite; Nothing to load");
            return false;
        }

        this.onLoadUrlHandler = bind(this.onLoadURL, this);

        this.onRun();
        return true;
    },

    onRun: function()
    {
        if (!this.pages.length)
        {
            this.onFinish();
            return;
        }

        var url = this.pages.shift();

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.pageSuite; Loading: " + url);

        var tabbrowser = window.getBrowser();
        this.browser = tabbrowser.getBrowserForTab(tabbrowser.selectedTab);
        this.browser.addEventListener("load", this.onLoadUrlHandler, true);

        // Load the URL
        this.browser.contentDocument.defaultView.location.href = url;
    },

    onFinish: function()
    {
        if (this.finishCallback)
            this.finishCallback();
    },

    onLoadURL: function(event)
    {
        this.browser.removeEventListener("load", this.onLoadUrlHandler, true);

        var win = event.target.defaultView;

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.pageLoader; BROWSER LOAD " + safeGetWindowLocation(win));

        var self = this;
        setTimeout(function() {
            self.onRun();
        }, 10);
    }
}

// ********************************************************************************************* //
// Shortcuts for this namespace

var PageSuite = Firebug.NetExport.PageSuite;

// ********************************************************************************************* //

Firebug.registerModule(Firebug.NetExport.PageLoader);

// ********************************************************************************************* //
}});
