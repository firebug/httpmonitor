/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/chrome/chrome",
    "httpmonitor/lib/domplate",
    "httpmonitor/lib/locale",
    "httpmonitor/lib/xpcom",
    "httpmonitor/lib/css",
    "httpmonitor/lib/http",
    "httpmonitor/net/netUtils",
    "httpmonitor/base/module",
    "httpmonitor/base/rep",
    "httpmonitor/net/netMonitor",
],
function(FBTrace, Obj, Chrome, Domplate, Locale, Xpcom, Css, Http, NetUtils,
    Module, Rep, NetMonitor) {

// ********************************************************************************************* //
// Constants

// List of SVG related content types.
var contentTypes =
[
    "image/svg+xml",
];

// ********************************************************************************************* //
// Model implementation

/**
 * @module Implements viewer for SVG based network responses. In order to create a new
 * tab wihin network request detail, a listener is registered into
 * <code>NetMonitor.NetInfoBody</code> object.
 */
var SVGViewer = Obj.extend(Module,
/** lends SVGViewer */
{
    dispatchName: "svgViewer",

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        NetMonitor.NetInfoBody.addListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        NetMonitor.NetInfoBody.removeListener(this);
    },

    /**
     * Check response's content-type and if it's a SVG, create a new tab with SVG preview.
     */
    initTabBody: function(infoBox, file)
    {
        if (FBTrace.DBG_SVGVIEWER)
            FBTrace.sysout("svgviewer.initTabBody", infoBox);

        // If the response is SVG let's display a pretty preview.
        if (this.isSVG(Http.safeGetContentType(file.request)))
        {
            NetMonitor.NetInfoBody.appendTab(infoBox, "SVG",
                Locale.$STR("svgviewer.tab.SVG"));

            if (FBTrace.DBG_SVGVIEWER)
                FBTrace.sysout("svgviewer.initTabBody; SVG response available");
        }
    },

    isSVG: function(contentType)
    {
        // xxxHonza
        return false;

        if (!contentType)
            return false;

        return NetUtils.matchesContentType(contentType, contentTypes);
    },

    /**
     * Parse SVG response and render pretty printed preview.
     */
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoSVGText").item(0);
        if (!Css.hasClass(tab, "netInfoSVGTab") || tabBody.updated)
            return;

        tabBody.updated = true;

        this.insertSVG(tabBody, file.responseText);
    },

    insertSVG: function(parentNode, text)
    {
        return;

        var parser = Xpcom.CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
        var doc = parser.parseFromString(text, "text/xml");
        var root = doc.documentElement;

        // Error handling
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
        if (root.namespaceURI == nsURI && root.nodeName == "parsererror")
        {
            this.ParseError.tag.replace({error: {
                message: root.firstChild.nodeValue,
                source: root.lastChild.textContent
            }}, parentNode);
            return;
        }

        if (FBTrace.DBG_SVGVIEWER)
            FBTrace.sysout("svgviewer.updateTabBody; SVG response parsed", doc);

        // Override getHidden in these templates. The parsed SVG document is
        // hidden, but we want to display it using 'visible' styling.
        var templates = [
            HTMLPanel.CompleteElement,
            HTMLPanel.Element,
            HTMLPanel.TextElement,
            HTMLPanel.EmptyElement,
            HTMLPanel.XEmptyElement,
        ];

        var originals = [];
        for (var i=0; i<templates.length; i++)
        {
            originals[i] = templates[i].getHidden;
            templates[i].getHidden = function() {
                return "";
            }
        }

        // Generate SVG preview.
        HTMLPanel.CompleteElement.tag.replace({object: doc.documentElement}, parentNode);

        for (var i=0; i<originals.length; i++)
            templates[i].getHidden = originals[i];
    }
});

// ********************************************************************************************* //
// Domplate

/**
 * @domplate Represents a template for displaying SVG parser errors. Used by
 * <code>SVGViewer</code>.
 */
with (Domplate) {
SVGViewer.ParseError = domplate(Rep,
{
    tag:
        DIV({"class": "svgInfoError"},
            DIV({"class": "svgInfoErrorMsg"}, "$error.message"),
            PRE({"class": "svgInfoErrorSource"}, "$error|getSource")
        ),

    getSource: function(error)
    {
        var parts = error.source.split("\n");
        if (parts.length != 2)
            return error.source;

        var limit = 50;
        var column = parts[1].length;
        if (column >= limit) {
            parts[0] = "..." + parts[0].substr(column - limit);
            parts[1] = "..." + parts[1].substr(column - limit);
        }

        if (parts[0].length > 80)
            parts[0] = parts[0].substr(0, 80) + "...";

        return parts.join("\n");
    }
})};

// ********************************************************************************************* //
// Registration

Chrome.registerModule(SVGViewer);

return SVGViewer;

// ********************************************************************************************* //
});
