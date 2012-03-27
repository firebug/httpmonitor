/* See license.txt for terms of usage */

// ********************************************************************************************* //

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cm = Components.manager;

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

// ********************************************************************************************* //
// Bootstrap API

var global = this;

function startup(data, reason)
{
    var resource = Services.io.getProtocolHandler("resource").
        QueryInterface(Ci.nsIResProtocolHandler);

    resource.setSubstitution("httpmonitor", data.resourceURI);

    // Load Monitor into all existing browser windows.
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements())
        loadBrowserOverlay(enumerator.getNext());

    // Listen for new windows, the overlay must be loaded into them too.
    Services.ww.registerNotification(windowWatcher);
}

function shutdown(data, reason)
{
    if (reason == APP_SHUTDOWN)
        return;

    var resource = Services.io.getProtocolHandler("resource").
        QueryInterface(Ci.nsIResProtocolHandler);

    resource.setSubstitution("httpmonitor", null);
}

function install(data, reason)
{
}

function uninstall(data, reason)
{
}

// ********************************************************************************************* //
// Browser Overlay

function loadBrowserOverlay(win)
{
    try
    {
        Services.scriptloader.loadSubScript(
            "resource://httpmonitor/content/browserOverlay.js",
            win);
    }
    catch (e)
    {
        Cu.reportError(e);
    }
}

function unloadBrowserOverlay(win)
{
    // xxxHonza: TODO
}

// ********************************************************************************************* //
// Window Listener

var windowWatcher = function windowWatcher(win, topic)
{
    if (topic != "domwindowopened")
        return;

    win.addEventListener("load", function onLoad()
    {
        win.removeEventListener("load", onLoad, false);
        if (win.document.documentElement.getAttribute("windowtype") == "navigator:browser")
            loadBrowserOverlay(win);
    }, false);
}

// ********************************************************************************************* //
