/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;

const prompts = CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

const prefDomain = "extensions.firebug.netexport";
var sendToConfirmation = "sendToConfirmation";

// ************************************************************************************************

Firebug.NetExport.HARUploader =
{
    upload: function(context, confirm, async, jsonString)
    {
        try
        {
            var serverURL = Firebug.getPref(prefDomain, "beaconServerURL");
            if (!serverURL)
                return;

            if (confirm && Firebug.getPref(prefDomain, sendToConfirmation))
            {
                var uri = makeURI(serverURL);
                var msg = $STR("netexport.sendTo.confirm.msg");
                msg = msg.replace(/%S/g, uri.host);

                var check = {value: false};
                if (!prompts.confirmCheck(context.chrome.window, "NetExport", msg,
                    $STR("netexport.sendTo.confirm.checkMsg"), check))
                    return;

                // Update sendToConfirmation confirmation option according to the value
                // of the dialog's "do not show again" checkbox.
                Firebug.setPref(prefDomain, sendToConfirmation, !check.value)
            }

            if (!jsonString)
            {
                var json = Firebug.NetExport.Exporter.buildJSON(context);
                jsonString = Firebug.NetExport.Exporter.buildData(json);
            }

            if (!jsonString)
                return;

            var pageURL = encodeURIComponent(context.getName());
            serverURL += "?url=" + pageURL;

            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.upload; " + serverURL, jsonString);

            // The instance is associated with the progress meter, which is removed at the end.
            var uploader = new Uploader(serverURL, pageURL, async);
            uploader.start(jsonString);
        }
        catch (e)
        {
            if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                FBTrace.sysout("netexport.upload; EXCEPTION", e);
        }
    }
}

// ************************************************************************************************

function Uploader(serverURL, pageURL, async)
{
    this.serverURL = serverURL;
    this.pageURL = pageURL;
    this.request = null;
    this.progress = null;
    this.async = async;
}

Uploader.prototype =
{
    start: function(jsonString)
    {
        this.request = CCIN("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
        this.request.upload.onprogress = bind(this.onUploadProgress, this);

        this.request.open("POST", this.serverURL, this.async);
        this.request.setRequestHeader("Content-Type", "x-application/har+json");
        this.request.setRequestHeader("Content-Length", jsonString.length);

        this.request.onerror = bind(this.onError, this);
        this.request.onload = bind(this.onFinished, this);
        this.request.onabort = bind(this.onAbort, this);

        this.progress = this.createProgresMeter();
        this.progress.repObject = this;

        this.request.send(jsonString);

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.uploader.start; Request sent to: " + this.serverURL);
    },

    createProgresMeter: function()
    {
        var progress = $("netExportUploadProgressTempl");
        progress = progress.cloneNode(true);
        progress.removeAttribute("id");

        progress.addEventListener("click", bind(this.onContextMenu, this), true);

        progress.setAttribute("tooltiptext", $STR("netexport.tooltip.Uploading_HAR_to") +
            " " + decodeURIComponent(this.serverURL));

        // Append into the toolbar.
        var netExportBtn = $("netExport");
        insertAfter(progress, netExportBtn);

        return progress;
    },

    onContextMenu: function(event)
    {
        var popup = $("netExportUploadAbort");
        FBL.eraseNode(popup);

        var abort = {
            label: "netexport.menu.label.Abort Upload",
            command: bind(this.abort, this)
        }

        FBL.createMenuItem(popup, abort);
        popup.showPopup(event.target, event.screenX, event.screenY, "popup", null, null);
    },

    abort: function()
    {
        if (!this.request)
            return;

        this.request.abort();

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.uploader; Aborted " + this.serverURL);
    },

    onAbort: function(event)
    {
        // Remove reference to itself
        this.progress.repObject = null;

        // Remove progress bar from the UI.
        this.progress.parentNode.removeChild(this.progress);

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.uploader.onAbort; ABORTED " + this.serverURL + " " +
                event.target.status, event);
    },

    onUploadProgress: function(event)
    {
        if (event.lengthComputable)
        {
            this.progress.removeAttribute("collapsed");
            var completed = (event.loaded / event.total) * 100;
            this.progress.setAttribute("value", Math.round(completed));
        }
    },

    onFinished: function(event)
    {
        // Remove reference to itself
        this.progress.repObject = null;

        // Remove progress bar from the UI.
        this.progress.parentNode.removeChild(this.progress);

        // If show preview is on, open the server page with details.
        if (!Firebug.getPref(prefDomain, "showPreview"))
            return;

        var index = this.serverURL.indexOf("beacon/har");
        if (index < 0)
        {
            if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                FBTrace.sysout("netexport.uploader.onFinished; ERROR wrong Beacon server: " +
                    this.serverURL);
            return;
        }

        var showSlowURL = this.serverURL.substr(0, index);
        var lastChar = showSlowURL.charAt(showSlowURL.length - 1);
        if (lastChar != "/")
            showSlowURL += "/";

        // Compute URL of the details page (use URL of the exported page).
        showSlowURL += "details/?url=" + this.pageURL;

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.uploader.onFinished; HAR Beacon sent, open Beacon server: " +
                showSlowURL);

        var tabBrowser = FBL.getTabBrowser();
        tabBrowser.selectedTab = tabBrowser.addTab(showSlowURL);
    },

    onError: function(event)
    {
        // Remove reference to itself
        this.progress.repObject = null;

        // Remove progress bar from the UI.
        this.progress.parentNode.removeChild(this.progress);

        if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
            FBTrace.sysout("netexport.uploader.onError; ERROR " + this.serverURL + " " +
                event.target.status, event);

        alert("Error: " + event.target.status);
    }
};

// ************************************************************************************************

function insertAfter(newElement, targetElement)
{
    var parent = targetElement.parentNode;

    if (parent.lastChild == targetElement)
        parent.appendChild(newElement);
    else
        parent.insertBefore(newElement, targetElement.nextSibling);
}

// ************************************************************************************************
}});
