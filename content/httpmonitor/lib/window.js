/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/http",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Http, Chrome) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

// Module object
var Win = {};

// ********************************************************************************************* //
// Window

Win.getRootWindow = function(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent || !(win.parent instanceof win.Window) )
            return win;
    }
    return null;
};

// ********************************************************************************************* //
// Firefox Tab Browser

Win.getTabForWindow = function(aWindow)
{
    aWindow = Win.getRootWindow(aWindow);

    var tabBrowser = Win.getTabBrowser();
    if (!aWindow || !tabBrowser || !tabBrowser.getBrowserIndexForDocument)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("getTabForWindow FAIL aWindow: "+aWindow+" tabBrowser: "+tabBrowser, tabBrowser);

        var mainWindow = aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
           .getInterface(Components.interfaces.nsIWebNavigation)
           .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
           .rootTreeItem
           .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
           .getInterface(Components.interfaces.nsIDOMWindow);

        tabBrowser = mainWindow.gBrowser;
    }

    if (!tabBrowser)
        return;

    try
    {
        var targetDoc = aWindow.document;

        var tab = null;
        var targetBrowserIndex = tabBrowser.getBrowserIndexForDocument(targetDoc);
        if (targetBrowserIndex != -1)
        {
            tab = tabBrowser.tabContainer.childNodes[targetBrowserIndex];
            return tab;
        }
    }
    catch (ex)
    {
    }

    return null;
};

Win.getTabIdForWindow = function(win)
{
    var tab = Win.getTabForWindow(win);
    return tab ? tab.linkedPanel : null;
};

Win.getTabBrowser = function()
{
    var context = Chrome.currentContext;
    if (!context)
        return;

    var doc = context.browser.ownerDocument;
    return doc.getElementById("content");
}

Win.openNewTab = function(url, postText)
{
    if (!url)
        return;

    var postData = null;
    if (postText)
    {
        var stringStream = Http.getInputStreamFromString(postText);
        postData = Cc["@mozilla.org/network/mime-input-stream;1"].createInstance(Ci.nsIMIMEInputStream);
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
        postData.addContentLength = true;
        postData.setData(stringStream);
    }

    var tabBrowser = Win.getTabBrowser();
    return tabBrowser.selectedTab = tabBrowser.addTab(url, null, null, postData);
};

// ********************************************************************************************* //
// Browser Windows Iteration

/**
 * Iterate over all opened firefox windows of the given type. If the callback returns true
 * the iteration is stopped.
 * 
 * @param {Object} windowType
 * @param {Object} callback
 */
Win.iterateBrowserWindows = function(windowType, callback)
{
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var windowList = wm.getZOrderDOMWindowEnumerator(windowType, true);
    if (!windowList.hasMoreElements())
        windowList = wm.getEnumerator(windowType);

    while (windowList.hasMoreElements())
    {
        if (callback(windowList.getNext()))
            return true;
    }

    return false;
};

Win.iterateBrowserTabs = function(browserWindow, callback)
{
    var tabBrowser = browserWindow.getBrowser();
    var numTabs = tabBrowser.browsers.length;

    for(var index=0; index<numTabs; index++)
    {
        var currentBrowser = tabBrowser.getBrowserAtIndex(index);
        if (callback(tabBrowser.mTabs[index], currentBrowser))
            return true;
    }

    return false;
}

// ********************************************************************************************* //
// Wrappers

Win.unwrap = function(win)
{
    return win.wrappedJSObject ? win.wrappedJSObject : win;
}

// ********************************************************************************************* //

return Win;

// ********************************************************************************************* //
});
