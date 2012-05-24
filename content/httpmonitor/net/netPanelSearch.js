/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/css",
    "httpmonitor/lib/search",
    "httpmonitor/lib/options",
    "httpmonitor/chrome/chrome",
    "httpmonitor/net/netMonitor",
],
function(FBTrace, Css, Search, Options, Chrome, NetMonitor) {

// ********************************************************************************************* //

function NetPanelSearch(panel, rowFinder)
{
    var panelNode = panel.panelNode;
    var doc = panelNode.ownerDocument;
    var searchRange, startPt;

    // Common search object methods.
    this.find = function(text, reverse, caseSensitive)
    {
        this.text = text;

        Search.finder.findBackwards = !!reverse;
        Search.finder.caseSensitive = !!caseSensitive;

        this.currentRow = this.getFirstRow();
        this.resetRange();

        return this.findNext(false, false, reverse, caseSensitive);
    };

    this.findNext = function(wrapAround, sameNode, reverse, caseSensitive)
    {
        while (this.currentRow)
        {
            var match = this.findNextInRange(reverse, caseSensitive);
            if (match)
                return match;

            if (this.shouldSearchResponses())
                this.findNextInResponse(reverse, caseSensitive);

            this.currentRow = this.getNextRow(wrapAround, reverse);

            if (this.currentRow)
                this.resetRange();
        }
    };

    // Internal search helpers.
    this.findNextInRange = function(reverse, caseSensitive)
    {
        if (this.range)
        {
            startPt = doc.createRange();
            if (reverse)
                startPt.setStartBefore(this.currentNode);
            else
                startPt.setStart(this.currentNode, this.range.endOffset);

            this.range = Search.finder.Find(this.text, searchRange, startPt, searchRange);
            if (this.range)
            {
                this.currentNode = this.range ? this.range.startContainer : null;
                return this.currentNode ? this.currentNode.parentNode : null;
            }
        }

        if (this.currentNode)
        {
            startPt = doc.createRange();
            if (reverse)
                startPt.setStartBefore(this.currentNode);
            else
                startPt.setStartAfter(this.currentNode);
        }

        this.range = Search.finder.Find(this.text, searchRange, startPt, searchRange);
        this.currentNode = this.range ? this.range.startContainer : null;
        return this.currentNode ? this.currentNode.parentNode : null;
    },

    this.findNextInResponse = function(reverse, caseSensitive)
    {
        var file = Chrome.getRepObject(this.currentRow);
        if (!file)
            return;

        var useReqExpr = Options.get("searchUseRegularExpression");
        var scanRE = this.getTestingRegex(this.text, caseSensitive, useReqExpr);

        if (scanRE.test(file.responseText))
        {
            if (!Css.hasClass(this.currentRow, "opened"))
                NetMonitor.NetRequestEntry.toggleHeadersRow(this.currentRow);

            var netInfoRow = this.currentRow.nextSibling;
            var netInfoBox = netInfoRow.getElementsByClassName("netInfoBody").item(0);
            NetMonitor.NetInfoBody.selectTabByName(netInfoBox, "Response");

            // Before the search is started, the new content must be properly
            // layouted within the page. The layout is executed by reading
            // the following property.
            // xxxHonza: This workaround can be removed as soon as #488427 is fixed.
            doc.body.offsetWidth;
        }
    },

    // Helpers
    this.resetRange = function()
    {
        searchRange = doc.createRange();
        searchRange.setStart(this.currentRow, 0);
        searchRange.setEnd(this.currentRow, this.currentRow.childNodes.length);

        startPt = searchRange;
    }

    this.getFirstRow = function()
    {
        var table = panelNode.getElementsByClassName("netTable").item(0);
        return table.querySelector(".netTableBody").firstChild;
    }

    this.getNextRow = function(wrapAround, reverse)
    {
        // xxxHonza: reverse searching missing.
        for (var sib = this.currentRow.nextSibling; sib; sib = sib.nextSibling)
        {
            if (this.shouldSearchResponses())
                return sib;
            else if (Css.hasClass(sib, "netRow"))
                return sib;
        }

        return wrapAround ? this.getFirstRow() : null;
    }

    this.shouldSearchResponses = function()
    {
        return Options.get("netSearchResponseBody");
    }

    this.getTestingRegex = function(text, caseSensitive, searchUseRegularExpression)
    {
        try
        {
            if (searchUseRegularExpression)
                return new RegExp(text, caseSensitive ? "g" : "gi");
            else
                return new Search.LiteralRegExp(text, false, caseSensitive);
        }
        catch (err)
        {
            // The user entered an invalid regex. Duck type the regex object
            // to support literal searches when an invalid regex is entered
            return new Search.LiteralRegExp(text, false, caseSensitive);
        }
    }
};

// ********************************************************************************************* //
// Registration

return NetPanelSearch;

// ********************************************************************************************* //
});
