/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Default Preferences

/**
 * HTTP Monitor extension is restart-less and so, we need to define default preference
 * manually (defaults/preferences directory doesn't work in this case)
 */
var DefaultPrefs =
{
// Global
    "textSize": 0,
    "showInfoTips": true,
    "toolbarCustomizationDone": false,
    "alwaysOpen": false,
    "stringCropLength": 50, 

// Console
    "showNetworkErrors": true,

// Net
    "netFilterCategory": "all",
    "net.logLimit": 500,
    "net.enableSites": false,
    "netDisplayedResponseLimit": 102400,
    "netDisplayedPostBodyLimit": 10240,
    "net.hiddenColumns": "netProtocolCol netLocalAddressCol",
    "netPhaseInterval": 1000,
    "sizePrecision": 1,
    "netParamNameLimit": 25,
    "netShowPaintEvents": false,
    "netShowBFCacheResponses": true,
    "netHtmlPreviewHeight": 100,

// JSON Preview
    "sortJsonPreview": false,

// Cache
    "cache.mimeTypes": "",
    "cache.responseLimit": 5242880,

// Remoting
    "serverHost": "legoas",
    "serverPort": 2929,

// Server
    "serverMode": false,
    "postDataTimeout": 600,

// Search
    "searchUseRegularExpression": false
}

// ********************************************************************************************* //
// Registration

return DefaultPrefs;

// ********************************************************************************************* //
});
