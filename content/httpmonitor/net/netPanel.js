/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/domplate",
    "httpmonitor/lib/xpcom",
    "httpmonitor/lib/locale",
    "httpmonitor/lib/events",
    "httpmonitor/lib/options",
    "httpmonitor/lib/url",
    "httpmonitor/lib/http",
    "httpmonitor/lib/css",
    "httpmonitor/lib/dom",
    "httpmonitor/lib/window",
    "httpmonitor/lib/search",
    "httpmonitor/lib/string",
    "httpmonitor/lib/array",
    "httpmonitor/lib/system",
    "httpmonitor/lib/menu",
    "httpmonitor/net/netUtils",
    "httpmonitor/net/netProgress",
    "httpmonitor/net/browserCache",
    "httpmonitor/base/panel",
    "httpmonitor/chrome/chrome",
    "httpmonitor/chrome/infoTip",
    "httpmonitor/net/netMonitor",
    "httpmonitor/net/netFile",
    "httpmonitor/net/netPanelSearch",
    "httpmonitor/net/netReps",
],
function(FBTrace, Obj, Domplate, Xpcom, Locale, Events, Options, Url, Http,
    Css, Dom, Win, Search, Str, Arr, System, Menu, NetUtils, NetProgress, BrowserCache,
    Panel, Chrome, InfoTip, NetMonitor, NetFile, NetPanelSearch) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var layoutInterval = 300;
var panelName = "net";
var NetRequestEntry = NetMonitor.NetRequestEntry;

// ********************************************************************************************* //

/**
 * @panel Represents a panel that displayes info about HTTP activity associated with
 * the current page. This class is derived from <code>Panel</code> in order
 * to support activation (enable/disable). This allows to avoid (performance) expensive
 * features if the functionality is not necessary for the user.
 */
function NetPanel() {}
NetPanel.prototype = Obj.extend(Panel,
/** lends NetPanel */
{
    name: panelName,
    searchable: true,
    editable: true,
    breakable: true,
    enableA11y: true,
    order: 60,

    initialize: function(context, doc)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetPanel.initialize; " + context.getName());

        this.queue = [];
        this.onContextMenu = Obj.bind(this.onContextMenu, this);

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.NetPanel.destroy; ", state);

        Panel.destroy.apply(this, arguments);
    },

    initializeNode : function()
    {
        Events.addEventListener(this.panelNode, "contextmenu", this.onContextMenu, false);

        this.onResizer = Obj.bind(this.onResize, this);
        this.resizeEventTarget = Chrome.$("content");

        Events.addEventListener(this.resizeEventTarget, "resize", this.onResizer, true);

        Panel.initializeNode.apply(this, arguments);
    },

    destroyNode : function()
    {
        Events.removeEventListener(this.panelNode, "contextmenu", this.onContextMenu, false);
        Events.removeEventListener(this.resizeEventTarget, "resize", this.onResizer, true);

        Panel.destroyNode.apply(this, arguments);
    },

    loadPersistedContent: function(state)
    {
        this.initLayout();

        var tbody = this.table.querySelector(".netTableBody");

        // Move all net-rows from the persistedState to this panel.
        var prevTableBody = state.panelNode.getElementsByClassName("netTableBody").item(0);
        if (!prevTableBody)
            return;

        var files = [];

        // Iterate persisted content - table rows. These rows can represent various things
        // 1) netPageRow - already persisted group
        // 2) netRow - request entries from the previous session (page load)
        while (prevTableBody.firstChild)
        {
            var row = prevTableBody.firstChild;

            // Collect all entries that belongs to the current page load (not history)
            if (Css.hasClass(row, "netRow") &&
                Css.hasClass(row, "hasHeaders") &&
                !Css.hasClass(row, "history"))
            {
                row.repObject.history = true;
                files.push({
                    file: row.repObject,
                    offset: 0 + "%",
                    width: 0 + "%",
                    elapsed:  -1
                });
            }

            if (Css.hasClass(row, "netPageRow"))
            {
                Css.removeClass(row, "opened");

                // Insert the old page-load-history entry just before the summary-row,
                // but after the limit row.
                tbody.insertBefore(row, this.summaryRow);
            }
            else
            {
                prevTableBody.removeChild(row);
            }
        }

        // New page-load-history entry is inserted just before summary row
        // (at the end of page-load-history entry list)
        var lastRow = this.summaryRow.previousSibling;
        if (files.length)
        {
            var pageRow = NetMonitor.NetPage.pageTag.insertRows({page: state}, lastRow)[0];
            pageRow.files = files;

            lastRow = this.summaryRow.previousSibling;
        }

        // Insert a separator tag at the end of page-load-history entry list.
        if (this.table.getElementsByClassName("netPageRow").item(0))
            NetMonitor.NetPage.separatorTag.insertRows({}, lastRow);

        Dom.scrollToBottom(this.panelNode);
    },

    savePersistedContent: function(state)
    {
        Panel.savePersistedContent.apply(this, arguments);

        state.pageTitle = NetUtils.getPageTitle(this.context);
    },

    show: function(state)
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.netPanel.show; " + this.context.getName(), state);

        this.context.netProgress.activate(this);

        this.showToolbarButtons("fbNetButtons", true);

        Chrome.setGlobalAttribute("cmd_togglePersistNet", "checked", this.persistContent);

        if (!this.filterCategory)
            this.setFilter(Options.get("netFilterCategory"));

        this.layout();

        if (!this.layoutInterval)
            this.layoutInterval = setInterval(Obj.bindFixed(this.updateLayout, this), layoutInterval);

        if (this.wasScrolledToBottom)
            Dom.scrollToBottom(this.panelNode);
    },

    hide: function()
    {
        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.netPanel.hide; " + this.context.getName());

        this.showToolbarButtons("fbNetButtons", false);

        delete this.infoTipURL;  // clear the state that is tracking the infoTip so it is reset after next show()
        this.wasScrolledToBottom = Dom.isScrolledToBottom(this.panelNode);

        clearInterval(this.layoutInterval);
        delete this.layoutInterval;

        // xxxHonza: Netexport needs to see all requests in the UI (to export them).
        //panel.updateLayout();

        // xxxHonza:
        if (this.context.netProgress)
            this.context.netProgress.activate(null);
    },

    updateOption: function(name, value)
    {
        if (name == "netFilterCategory")
        {
            NetMonitor.syncFilterButtons();
            /*connection.eachContext(function syncFilters(context)
            {
                NetMonitor.onToggleFilter(context, value);
            });*/
        }
        else if (name == "netShowBFCacheResponses")
        {
            this.updateBFCacheResponses();
        }
    },

    updateBFCacheResponses: function()
    {
        if (this.table)
        {
            if (Options.get("netShowBFCacheResponses"))
                Css.setClass(this.table, "showBFCacheResponses");
            else
                Css.removeClass(this.table, "showBFCacheResponses");

            // Recalculate the summary information since some requests doesn't have to
            // be displayed now.
            this.updateSummaries(NetUtils.now(), true);
        }
    },

    updateSelection: function(object)
    {
        if (!object)
            return;

        var netProgress = this.context.netProgress;
        var file = netProgress.getRequestFile(object.request);
        if (!file)
        {
            for (var i=0; i<netProgress.requests.length; i++) {
                if (Http.safeGetRequestName(netProgress.requests[i]) == object.href) {
                   file = netProgress.files[i];
                   break;
                }
            }
        }

        if (file)
        {
            Dom.scrollIntoCenterView(file.row);
            if (!Css.hasClass(file.row, "opened"))
                NetRequestEntry.toggleHeadersRow(file.row);
        }
    },

    getPopupObject: function(target)
    {
        var header = Dom.getAncestorByClass(target, "netHeaderRow");
        if (header)
            return NetMonitor.NetRequestTable;

        return Panel.getPopupObject.apply(this, arguments);
    },

    supportsObject: function(object, type)
    {
        return false;
        //return ((object instanceof SourceLink.SourceLink && object.type == "net") ? 2 : 0);
    },

    getOptionsMenuItems: function()
    {
        return [
            this.disableCacheOption(),
            "-",
            Menu.optionMenu("net.option.Show_Paint_Events", "netShowPaintEvents",
                "net.option.tip.Show_Paint_Events"),
            Menu.optionMenu("net.option.Show_BFCache_Responses", "netShowBFCacheResponses",
                "net.option.tip.Show_BFCache_Responses")
        ];
    },

    disableCacheOption: function()
    {
        var disabled = !BrowserCache.isEnabled();
        return {
            label: "net.option.Disable_Browser_Cache",
            type: "checkbox",
            checked: disabled,
            tooltiptext: "net.option.tip.Disable_Browser_Cache",
            command: function()
            {
                BrowserCache.toggle(!this.getAttribute("checked"));
            }
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    getContextMenuItems: function(nada, target)
    {
        var items = [];

        var file = Chrome.getRepObject(target);
        if (!file || !(file instanceof NetFile))
            return items;

        var isPost = NetUtils.isURLEncodedRequest(file, this.context);

        items.push(
            {
                label: "CopyLocation",
                tooltiptext: "clipboard.tip.Copy_Location",
                command: Obj.bindFixed(System.copyToClipboard, System, file.href)
            }
        );

        if (isPost)
        {
            items.push(
                {
                    label: "CopyLocationParameters",
                    tooltiptext: "net.tip.Copy_Location_Parameters",
                    command: Obj.bindFixed(this.copyParams, this, file)
                }
            );
        }

        items.push(
            {
                label: "CopyRequestHeaders",
                tooltiptext: "net.tip.Copy_Request_Headers",
                command: Obj.bindFixed(this.copyRequestHeaders, this, file)
            },
            {
                label: "CopyResponseHeaders",
                tooltiptext: "net.tip.Copy_Response_Headers",
                command: Obj.bindFixed(this.copyResponseHeaders, this, file)
            }
        );

        if (NetUtils.textFileCategories.hasOwnProperty(file.category))
        {
            items.push(
                {
                    label: "CopyResponse",
                    tooltiptext: "net.tip.Copy_Response",
                    command: Obj.bindFixed(this.copyResponse, this, file)
                }
            );
        }

        items.push(
            "-",
            {
                label: "OpenInTab",
                tooltiptext: "tip.Open_In_Tab",
                command: Obj.bindFixed(this.openRequestInTab, this, file)
            }
        );

        if (NetUtils.textFileCategories.hasOwnProperty(file.category))
        {
            items.push(
                {
                    label: "Open_Response_In_New_Tab",
                    tooltiptext: "net.tip.Open_Response_In_New_Tab",
                    command: Obj.bindFixed(NetUtils.openResponseInTab, this, file)
                }
            );
        }

        if (!file.loaded)
        {
            items.push(
                "-",
                {
                    label: "StopLoading",
                    tooltiptext: "net.tip.Stop_Loading",
                    command: Obj.bindFixed(this.stopLoading, this, file)
                }
            );
        }

        if (file.isXHR)
        {
            // xxxHonza: no break on XHR
            /*var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());

            items.push(
                "-",
                {
                    label: "net.label.Break_On_XHR",
                    tooltiptext: "net.tip.Break_On_XHR",
                    type: "checkbox",
                    checked: !!bp,
                    command: Obj.bindFixed(this.breakOnRequest, this, file)
                }
            );

            if (bp)
            {
                items.push(
                    {
                        label: "EditBreakpointCondition",
                        tooltiptext: "breakpoints.tip.Edit_Breakpoint_Condition",
                        command: Obj.bindFixed(this.editBreakpointCondition, this, file)
                    }
                );
            }*/
        }

        items.push("-");

        items.push({
            label: "net.label.Resend",
            tooltiptext: "net.tip.Resend",
            id: "fbNetResend",
            command: Obj.bindFixed(this.resend, this, file)
        });

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context menu commands

    copyParams: function(file)
    {
        var text = NetUtils.getPostText(file, this.context, true);
        var url = Url.reEncodeURL(file, text, true);
        System.copyToClipboard(url);
    },

    copyRequestHeaders: function(file)
    {
        System.copyToClipboard(file.requestHeadersText);
    },

    copyResponseHeaders: function(file)
    {
        System.copyToClipboard(file.responseHeadersText);
    },

    copyResponse: function(file)
    {
        // Copy response to the clipboard
        System.copyToClipboard(NetUtils.getResponseText(file, this.context));
    },

    openRequestInTab: function(file)
    {
        if (file.postText)
        {
            var lines = file.postText.split("\n");
            Win.openNewTab(file.href, lines[lines.length-1]);
        }
        else
        {
            Win.openNewTab(file.href, null);
        }
    },

    stopLoading: function(file)
    {
        const NS_BINDING_ABORTED = 0x804b0002;

        file.request.cancel(NS_BINDING_ABORTED);
    },

    resend: function(file)
    {
        // Proxies are not supported in externals contexts.
        if (typeof(this.context.getProxy) == "function")
        {
            var proxy = this.context.getProxy();
            proxy.sendRequest(file, function(packet)
            {
                if (FBTrace.DBG_REMOTEBUG)
                    FBTrace.sysout("netPanel; Request sent: " + packet.from, packet);
            });
        }
        else
        {
            NetMonitor.sendRequest(this.context, file);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for XHR debugging

    breakOnRequest: function(file)
    {
        if (!file.isXHR)
            return;

        // Create new or remove an existing breakpoint.
        var breakpoints = this.context.netProgress.breakpoints;
        var url = file.getFileURL();
        var bp = breakpoints.findBreakpoint(url);
        if (bp)
            breakpoints.removeBreakpoint(url);
        else
            breakpoints.addBreakpoint(url);

        this.enumerateRequests(function(currFile)
        {
            if (url != currFile.getFileURL())
                return;

            if (bp)
                currFile.row.removeAttribute("breakpoint");
            else
                currFile.row.setAttribute("breakpoint", "true");
        })
    },

    onContextMenu: function(event)
    {
        if (!Css.hasClass(event.target, "sourceLine"))
            return;

        var row = Dom.getAncestorByClass(event.target, "netRow");
        if (!row)
            return;

        var file = row.repObject;
        var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (!bp)
            return;

       // this.editBreakpointCondition(file);
        Events.cancelEvent(event);
    },

    /*editBreakpointCondition: function(file)
    {
        var bp = this.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (!bp)
            return;

        var condition = bp ? bp.condition : "";

        this.selectedSourceBox = this.panelNode;
        Editor.startEditing(file.row, condition);
    },*/

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new NetMonitor.ConditionEditor(this.document);

        return this.conditionEditor;
    },

    breakOnNext: function(breaking)
    {
        this.context.breakOnXHR = breaking;
    },

    shouldBreakOnNext: function()
    {
        return this.context.breakOnXHR;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("net.Disable Break On XHR") : Locale.$STR("net.Break On XHR"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for info tips.

    showInfoTip: function(infoTip, target, x, y)
    {
        var row = Dom.getAncestorByClass(target, "netRow");
        if (row && row.repObject)
        {
            if (Dom.getAncestorByClass(target, "netTotalSizeCol"))
            {
                var infoTipURL = "netTotalSize";
                if (infoTipURL == this.infoTipURL)
                    return true;

                this.infoTipURL = infoTipURL;
                return this.populateTotalSizeInfoTip(infoTip, row);
            }
            else if (Dom.getAncestorByClass(target, "netSizeCol"))
            {
                var infoTipURL = row.repObject.href + "-netsize";
                if (infoTipURL == this.infoTipURL && row.repObject == this.infoTipFile)
                    return true;

                this.infoTipURL = infoTipURL;
                this.infoTipFile = row.repObject;
                return this.populateSizeInfoTip(infoTip, row.repObject);
            }
            else if (Dom.getAncestorByClass(target, "netTimeCol"))
            {
                var infoTipURL = row.repObject.href + "-nettime";
                if (infoTipURL == this.infoTipURL && row.repObject == this.infoTipFile)
                    return true;

                this.infoTipURL = infoTipURL;
                this.infoTipFile = row.repObject;
                return this.populateTimeInfoTip(infoTip, row.repObject);
            }
            else if (Css.hasClass(row, "category-image") &&
                !Dom.getAncestorByClass(target, "netRowHeader"))
            {
                var infoTipURL = row.repObject.href + "-image";
                if (infoTipURL == this.infoTipURL)
                    return true;

                this.infoTipURL = infoTipURL;
                return InfoTip.populateImageInfoTip(infoTip, row.repObject.href);
            }
        }

        delete this.infoTipURL;
        return false;
    },

    populateTimeInfoTip: function(infoTip, file)
    {
        NetMonitor.TimeInfoTip.render(this.context, file, infoTip);
        return true;
    },

    populateSizeInfoTip: function(infoTip, file)
    {
        NetMonitor.SizeInfoTip.render(file, infoTip);
        return true;
    },

    populateTotalSizeInfoTip: function(infoTip, row)
    {
        var totalSizeLabel = row.getElementsByClassName("netTotalSizeLabel").item(0);
        var file = {size: totalSizeLabel.getAttribute("totalSize")};
        NetMonitor.SizeInfoTip.tag.replace({file: file}, infoTip);
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for search within the panel.

    getSearchOptionsMenuItems: function()
    {
        // xxxHonza: any default search options?
        return [];
    },

    search: function(text, reverse)
    {
        // xxxHonza: the search box needs to be implemented in the HTTPM UI
        // NetPanelSearch should be used to search within the HTTP entries
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateFile: function(file)
    {
        if (!file.invalid)
        {
            file.invalid = true;
            this.queue.push(file);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateLayout: function()
    {
        if (!this.queue.length)
            return;

        var rightNow = NetUtils.now();
        var length = this.queue.length;

        if (this.panelNode.offsetHeight)
            this.wasScrolledToBottom = Dom.isScrolledToBottom(this.panelNode);

        try
        {
            this.layout();
        }
        catch (e)
        {
            FBTrace.sysout("netPanel.updateLayout; EXCEPTION " + e, e);
        }

        if (this.wasScrolledToBottom)
            Dom.scrollToBottom(this.panelNode);

        this.updateHRefLabelWidth();

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.updateLayout; Layout done, time elapsed: " +
                Str.formatTime(NetUtils.now() - rightNow) + " (" + length + ")");
    },

    layout: function()
    {
        if (!this.queue.length || !this.context.netProgress)
            return;

        this.initLayout();

        var rightNow = NetUtils.now();
        this.updateRowData(rightNow);
        this.updateLogLimit(NetMonitor.maxQueueRequests);
        this.updateTimeline(rightNow);
        this.updateSummaries(rightNow);
    },

    initLayout: function()
    {
        if (!this.table)
        {
            var limitInfo = {
                totalCount: 0,
                limitPrefsTitle: Locale.$STRF("LimitPrefsTitle",
                    [Options.prefDomain+".net.logLimit"])
            };

            this.table = NetMonitor.NetRequestTable.tableTag.append({}, this.panelNode);
            var tbody = this.table.querySelector(".netTableBody");
            this.limitRow = NetMonitor.NetLimit.createRow(tbody, limitInfo);
            this.summaryRow = NetRequestEntry.summaryTag.insertRows({}, this.table.lastChild.lastChild)[0];

            NetRequestEntry.footerTag.insertRows({}, this.summaryRow);

            // Update visibility of columns according to the preferences
            var hiddenCols = Options.get("net.hiddenColumns");
            if (hiddenCols)
                this.table.setAttribute("hiddenCols", hiddenCols);

            this.updateBFCacheResponses();
        }
    },

    updateRowData: function(rightNow)
    {
        var queue = this.queue;
        this.queue = [];

        var phase;
        var newFileData = [];

        for (var i = 0; i < queue.length; ++i)
        {
            var file = queue[i];

            // xxxHonza: the entire phase management should ba part of NetPanel object
            //if (!file.phase && this.context.netProgress)
                this.context.netProgress.extendPhase(file);

            if (!file.phase)
                continue;

            file.invalid = false;

            phase = this.calculateFileTimes(file, phase, rightNow);

            this.updateFileRow(file, newFileData);
            this.invalidatePhase(phase);
        }

        if (newFileData.length)
        {
            var tbody = this.table.querySelector(".netTableBody");
            var lastRow = this.summaryRow.previousSibling;
            this.insertRows(newFileData, lastRow);
        }
    },

    insertRows: function(files, lastRow)
    {
        var row = NetRequestEntry.fileTag.insertRows({files: files}, lastRow)[0];

        for (var i = 0; i < files.length; ++i)
        {
            var file = files[i].file;
            row.repObject = file;
            file.row = row;

            if (file.breakLayout)
                row.setAttribute("breakLayout", "true");

            // Make sure a breakpoint is displayed.
            var breakpoints = this.context.netProgress.breakpoints;
            if (breakpoints && breakpoints.findBreakpoint(file.getFileURL()))
                row.setAttribute("breakpoint", "true");

            // Allow customization of request entries in the list. A row is represented
            // by <TR> HTML element.
            Events.dispatch(NetMonitor.NetRequestTable.fbListeners,
                "onCreateRequestEntry", [this, row]);

            row = row.nextSibling;
        }
    },

    invalidatePhase: function(phase)
    {
        if (phase && !phase.invalidPhase)
        {
            phase.invalidPhase = true;
            this.invalidPhases = true;
        }
    },

    updateFileRow: function(file, newFileData)
    {
        var row = file.row;
        if (!row)
        {
            newFileData.push({
                file: file,
                offset: this.barOffset + "%",
                width: this.barReceivingWidth + "%",
                elapsed: file.loaded ? this.elapsed : -1
            });
        }
        else
        {
            var sizeLabel = row.getElementsByClassName("netSizeLabel").item(0);

            var sizeText = NetRequestEntry.getSize(file);

            // Show also total downloaded size for requests in progress.
            if (file.totalReceived)
                sizeText += " (" + Str.formatSize(file.totalReceived) + ")";

            sizeLabel.firstChild.nodeValue = sizeText;

            var methodLabel = row.getElementsByClassName("netStatusLabel").item(0);
            methodLabel.firstChild.nodeValue = NetRequestEntry.getStatus(file);

            var hrefLabel = row.getElementsByClassName("netHrefLabel").item(0);
            hrefLabel.firstChild.nodeValue = NetRequestEntry.getHref(file);

            if (file.mimeType)
            {
                // Force update category.
                file.category = null;
                for (var category in NetUtils.fileCategories)
                    Css.removeClass(row, "category-" + category);
                Css.setClass(row, "category-" + NetUtils.getFileCategory(file));
            }

            var remoteIPLabel = row.querySelector(".netRemoteAddressCol .netAddressLabel");
            remoteIPLabel.innerHTML = NetRequestEntry.getRemoteAddress(file);

            var localIPLabel = row.querySelector(".netLocalAddressCol .netAddressLabel");
            localIPLabel.innerHTML = NetRequestEntry.getLocalAddress(file);

            if (file.requestHeaders)
                Css.setClass(row, "hasHeaders");

            if (file.fromCache)
                Css.setClass(row, "fromCache");
            else
                Css.removeClass(row, "fromCache");

            if (file.fromBFCache)
                Css.setClass(row, "fromBFCache");
            else
                Css.removeClass(row, "fromBFCache");

            if (NetRequestEntry.isError(file))
                Css.setClass(row, "responseError");
            else
                Css.removeClass(row, "responseError");

            var netBar = Dom.getChildByClass(row, "netTimeCol").childNodes[1];
            var timeLabel = Dom.getChildByClass(netBar, "netReceivingBar").firstChild;
            timeLabel.innerHTML = NetRequestEntry.getElapsedTime({elapsed: this.elapsed});

            if (file.loaded)
                Css.setClass(row, "loaded");
            else
                Css.removeClass(row, "loaded");

            if (Css.hasClass(row, "opened"))
            {
                var netInfoBox = row.nextSibling.getElementsByClassName("netInfoBody").item(0);
                NetMonitor.NetInfoBody.updateInfo(netInfoBox, file, this.context);
            }
        }
    },

    updateTimeline: function(rightNow)
    {
        var tbody = this.table.querySelector(".netTableBody");

        // xxxHonza: Don't update rows whose phase is done and layed out already
        // This optimalization should be effective especially when the Persist
        // options is on.
        var phase;
        for (var row = tbody.firstChild; row; row = row.nextSibling)
        {
            var file = row.repObject;

            // Some rows aren't associated with a file (e.g. header and summary).
            if (!file)
                continue;

            if (!file.loaded)
                continue;

            phase = this.calculateFileTimes(file, phase, rightNow);

            // Parent node for all timing bars.
            var netBar = row.querySelector(".netBar");

            // Get bar nodes
            var blockingBar = netBar.childNodes[1];
            var resolvingBar = blockingBar.nextSibling;
            var connectingBar = resolvingBar.nextSibling;
            var sendingBar = connectingBar.nextSibling;
            var waitingBar = sendingBar.nextSibling;
            var receivingBar = waitingBar.nextSibling;

            // All bars starts at the beginning
            resolvingBar.style.left = connectingBar.style.left = sendingBar.style.left =
                blockingBar.style.left =
                waitingBar.style.left = receivingBar.style.left = this.barOffset + "%";

            // Sets width of all bars (using style). The width is computed according to measured timing.
            blockingBar.style.width = this.barBlockingWidth + "%";
            resolvingBar.style.width = this.barResolvingWidth + "%";
            connectingBar.style.width = this.barConnectingWidth + "%";
            sendingBar.style.width = this.barSendingWidth + "%";
            waitingBar.style.width = this.barWaitingWidth + "%";
            receivingBar.style.width = this.barReceivingWidth + "%";

            // Remove existing bars
            var bars = netBar.querySelectorAll(".netPageTimingBar");
            for (var i=0; i<bars.length; i++)
                bars[i].parentNode.removeChild(bars[i]);

            // Generate UI for page timings (vertical lines displayed for the first phase)
            for (var i=0; i<phase.timeStamps.length; i++)
            {
                var timing = phase.timeStamps[i];
                if (!timing.offset)
                    continue;

                var bar = netBar.ownerDocument.createElement("DIV");
                netBar.appendChild(bar);

                if (timing.classes)
                    Css.setClass(bar, timing.classes);

                Css.setClass(bar, "netPageTimingBar");

                bar.style.left = timing.offset + "%";
                bar.style.display = "block";
            }
        }
    },

    calculateFileTimes: function(file, phase, rightNow)
    {
        if (phase != file.phase)
        {
            phase = file.phase;
            this.phaseStartTime = phase.startTime;
            this.phaseEndTime = phase.endTime ? phase.endTime : rightNow;

            // End of the first phase has to respect even the window "onload" event time, which
            // can occur after the last received file. This sets the extent of the timeline so,
            // the windowLoadBar is visible.
            if (phase.windowLoadTime && this.phaseEndTime < phase.windowLoadTime)
                this.phaseEndTime = phase.windowLoadTime;

            this.phaseElapsed = this.phaseEndTime - phase.startTime;
        }

        var elapsed = file.loaded ? file.endTime - file.startTime : 0; /*this.phaseEndTime - file.startTime*/
        this.barOffset = Math.floor(((file.startTime-this.phaseStartTime)/this.phaseElapsed) * 100);

        // Helper log for debugging timing problems.
        //NetUtils.traceRequestTiming("net.calculateFileTimes;", file);

        var blockingEnd = NetUtils.getBlockingEndTime(file);
        this.barBlockingWidth = Math.round(((blockingEnd - file.startTime) / this.phaseElapsed) * 100);
        this.barResolvingWidth = Math.round(((file.connectingTime - file.startTime) / this.phaseElapsed) * 100);
        this.barConnectingWidth = Math.round(((file.sendingTime - file.startTime) / this.phaseElapsed) * 100);
        this.barSendingWidth = Math.round(((file.waitingForTime - file.startTime) / this.phaseElapsed) * 100);
        this.barWaitingWidth = Math.round(((file.respondedTime - file.startTime) / this.phaseElapsed) * 100);
        this.barReceivingWidth = Math.round((elapsed / this.phaseElapsed) * 100);

        // Total request time doesn't include the time spent in queue.
        // xxxHonza: since all phases are now graphically distinguished it's easy to
        // see blocking requests. It's make sense to display the real total time now.
        this.elapsed = elapsed/* - (file.sendingTime - file.connectedTime)*/;

        // The nspr timer doesn't have 1ms precision, so it can happen that entire
        // request is executed in l ms (so the total is zero). Let's display at least
        // one bar in such a case so the timeline is visible.
        if (this.elapsed <= 0)
            this.barReceivingWidth = "1";

        // Compute also offset for page timings, e.g.: contentLoadBar and windowLoadBar,
        // which are displayed for the first phase. This is done only if a page exists.
        this.calculateTimeStamps(file, phase);

        return phase;
    },

    calculateTimeStamps: function(file, phase)
    {
        // Iterate all time stamps for the current phase and calculate offsets (from the
        // beginning of the waterfall graphs) for the vertical lines.
        for (var i=0; i<phase.timeStamps.length; i++)
        {
            var timeStamp = phase.timeStamps[i];
            var time = timeStamp.time;

            if (time > 0)
            {
                var offset = (((time - this.phaseStartTime)/this.phaseElapsed) * 100).toFixed(3);
                timeStamp.offset = offset;
            }
         }
    },

    updateSummaries: function(rightNow, updateAll)
    {
        if (!this.invalidPhases && !updateAll)
            return;

        this.invalidPhases = false;

        var phases = this.context.netProgress.phases;
        if (!phases.length)
            return;

        var fileCount = 0, totalSize = 0, cachedSize = 0, totalTime = 0;
        for (var i = 0; i < phases.length; ++i)
        {
            var phase = phases[i];
            phase.invalidPhase = false;

            var summary = this.summarizePhase(phase, rightNow);
            fileCount += summary.fileCount;
            totalSize += summary.totalSize;
            cachedSize += summary.cachedSize;
            totalTime += summary.totalTime
        }

        var row = this.summaryRow;
        if (!row)
            return;

        var countLabel = row.getElementsByClassName("netCountLabel").item(0); //childNodes[1].firstChild;
        countLabel.firstChild.nodeValue = Locale.$STRP("plural.Request_Count2", [fileCount]);

        var sizeLabel = row.getElementsByClassName("netTotalSizeLabel").item(0); //childNodes[4].firstChild;
        sizeLabel.setAttribute("totalSize", totalSize);
        sizeLabel.firstChild.nodeValue = NetRequestEntry.formatSize(totalSize);

        var cacheSizeLabel = row.getElementsByClassName("netCacheSizeLabel").item(0);
        cacheSizeLabel.setAttribute("collapsed", cachedSize == 0);
        cacheSizeLabel.childNodes[1].firstChild.nodeValue =
            NetRequestEntry.formatSize(cachedSize);

        var timeLabel = row.getElementsByClassName("netTotalTimeLabel").item(0);
        var timeText = NetRequestEntry.formatTime(totalTime);
        var firstPhase = phases[0];
        if (firstPhase.windowLoadTime)
        {
            var loadTime = firstPhase.windowLoadTime - firstPhase.startTime;
            timeText += " (onload: " + NetRequestEntry.formatTime(loadTime) + ")";
        }

        timeLabel.innerHTML = timeText;
    },

    summarizePhase: function(phase, rightNow)
    {
        var cachedSize = 0, totalSize = 0;

        var category = Options.get("netFilterCategory");
        if (category == "all")
            category = null;

        var fileCount = 0;
        var minTime = 0, maxTime = 0;

        for (var i=0; i<phase.files.length; i++)
        {
            var file = phase.files[i];

            // Do not count BFCache responses if the user says so.
            if (!Options.get("netShowBFCacheResponses") && file.fromBFCache)
                continue;

            if (!category || file.category == category)
            {
                if (file.loaded)
                {
                    ++fileCount;

                    if (file.size > 0)
                    {
                        totalSize += file.size;
                        if (file.fromCache)
                            cachedSize += file.size;
                    }

                    if (!minTime || file.startTime < minTime)
                        minTime = file.startTime;
                    if (file.endTime > maxTime)
                        maxTime = file.endTime;
                }
            }
        }

        var totalTime = maxTime - minTime;
        return {cachedSize: cachedSize, totalSize: totalSize, totalTime: totalTime,
                fileCount: fileCount}
    },

    updateLogLimit: function(limit)
    {
        var netProgress = this.context.netProgress;

        // Must be positive number;
        limit = Math.max(0, limit);

        var filesLength = netProgress.files.length;
        if (!filesLength || filesLength <= limit)
            return;

        // Remove old requests.
        var removeCount = Math.max(0, filesLength - limit);
        for (var i=0; i<removeCount; i++)
        {
            var file = netProgress.files[0];
            this.removeLogEntry(file);

            // Remove the file occurrence from the queue.
            for (var j=0; j<this.queue.length; j++)
            {
                if (this.queue[j] == file) {
                    this.queue.splice(j, 1);
                    j--;
                }
            }
        }
    },

    removeLogEntry: function(file, noInfo)
    {
        // Remove associated row-entry from the UI before the removeFile method
        // is called (and file.row erased).
        if (this.table)
        {
            var tbody = this.table.querySelector(".netTableBody");
            if (tbody && file.row)
                tbody.removeChild(file.row);
        }

        if (!this.removeFile(file))
            return;

        if (!this.table)
            return;

        var tbody = this.table.querySelector(".netTableBody");
        if (!tbody)
            return;

        if (noInfo || !this.limitRow)
            return;

        this.limitRow.limitInfo.totalCount++;

        NetMonitor.NetLimit.updateCounter(this.limitRow);

        //if (netProgress.currentPhase == file.phase)
        //  netProgress.currentPhase = null;
    },

    removeFile: function(file)
    {
        var netProgress = this.context.netProgress;
        var index = netProgress.files.indexOf(file);
        if (index == -1)
            return false;

        netProgress.files.splice(index, 1);
        netProgress.requests.splice(index, 1);

        // Don't forget to remove the phase whose last file has been removed.
        var phase = file.phase;

        // xxxHonza: This needs to be examined yet. Looks like the queue contains
        // requests from the previous page. When flushed the requestedFile isn't called
        // and the phase is not set.
        if (!phase)
            return true;

        phase.removeFile(file);
        if (!phase.files.length)
        {
            Arr.remove(netProgress.phases, phase);

            if (netProgress.currentPhase == phase)
                netProgress.currentPhase = null;
        }

        file.clear();

        return true;
    },

    insertActivationMessage: function()
    {
        // Make sure the basic structure of the table panel is there.
        this.initLayout();

        // Get the last request row before summary row.
        var lastRow = this.summaryRow.previousSibling;

        // Insert an activation message (if the last row isn't the message already);
        if (Css.hasClass(lastRow, "netActivationRow"))
            return;

        var message = NetRequestEntry.activationTag.insertRows({}, lastRow)[0];

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.insertActivationMessage; " + this.context.getName(), message);
    },

    enumerateRequests: function(fn)
    {
        if (!this.table)
            return;

        var rows = this.table.getElementsByClassName("netRow");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var pageRow = Css.hasClass(row, "netPageRow");

            if (Css.hasClass(row, "collapsed") && !pageRow)
                continue;

            if (Css.hasClass(row, "history"))
                continue;

            // Export also history. These requests can be collapsed and so not visible.
            if (row.files)
            {
                for (var j=0; j<row.files.length; j++)
                    fn(row.files[j].file);
            }

            var file = Chrome.getRepObject(row);
            if (file)
                fn(file);
        }
    },

    setFilter: function(filterCategory)
    {
        this.filterCategory = filterCategory;

        var panelNode = this.panelNode;
        for (var category in NetUtils.fileCategories)
        {
            if (filterCategory != "all" && category != filterCategory)
                Css.setClass(panelNode, "hideCategory-"+category);
            else
                Css.removeClass(panelNode, "hideCategory-"+category);
        }
    },

    clear: function()
    {
        Dom.clearNode(this.panelNode);

        this.table = null;
        this.summaryRow = null;
        this.limitRow = null;

        this.queue = [];
        this.invalidPhases = false;

        if (FBTrace.DBG_NET)
            FBTrace.sysout("net.panel.clear; " + this.context.getName());
    },

    onResize: function()
    {
        this.updateHRefLabelWidth();
    },

    updateHRefLabelWidth: function()
    {
        if (!this.table)
            return;

        // Update max-width of the netHrefLabel according to the width of the parent column.
        // I don't know if there is a way to do this in Css.
        // See Issue 3633: Truncated URLs in net panel
        var netHrefCol = this.table.querySelector("#netHrefCol");
        var hrefLabel = this.table.querySelector(".netHrefLabel");

        if (!hrefLabel)
            return;

        // xxxHonza
        /*if (!Chrome.currentContext)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.updateHRefLabelWidth; Chrome.currentContext == NULL");
            return;
        }*/

        var maxWidth = netHrefCol.clientWidth;

        // This call must precede all getCSSStyleRules calls  FIXME not needed after 3.6
        //CSSModule.cleanupSheets(hrefLabel.ownerDocument, this.context);
        var rules = Dom.domUtils.getCSSStyleRules(hrefLabel);
        for (var i = 0; i < rules.Count(); ++i)
        {
            var rule = Xpcom.QI(rules.GetElementAt(i), Ci.nsIDOMCSSStyleRule);
            if (rule.selectorText == ".netHrefLabel")
            {
                var style = rule.style;
                var paddingLeft = parseInt(style.getPropertyValue("padding-left"));
                if (maxWidth == 0)
                    style.setProperty("max-width", "15%", "");
                else
                    style.setProperty("max-width", (maxWidth - paddingLeft) + "px", "");
                break;
            }
        }
    },
});

// ********************************************************************************************* //

var NetPanelSearch = function(panel, rowFinder)
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

        var scanRE = Search.getTestingRegex(this.text);
        if (scanRE.test(file.responseText))
        {
            if (!Css.hasClass(this.currentRow, "opened"))
                NetRequestEntry.toggleHeadersRow(this.currentRow);

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
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

NetMonitor.ConditionEditor = function(doc)
{
    Breakpoint.ConditionEditor.apply(this, arguments);
}

// xxxHonza
/*NetMonitor.ConditionEditor.prototype = domplate(Breakpoint.ConditionEditor.prototype,
{
    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        var file = target.repObject;
        var panel = Chrome.getElementPanel(target);
        var bp = panel.context.netProgress.breakpoints.findBreakpoint(file.getFileURL());
        if (bp)
            bp.condition = value;
    }
});*/

// ********************************************************************************************* //
// Registration

Chrome.registerPanel(NetPanel);

return NetPanel;

// ********************************************************************************************* //
}});
