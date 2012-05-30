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
    "alwaysOpen": false,
    "stringCropLength": 50,

// Net
    "netFilterCategory": "all",
    "net.logLimit": 500,
    "netDisplayedResponseLimit": 102400,
    "netDisplayedPostBodyLimit": 10240,
    "net.hiddenColumns": "netProtocolCol netLocalAddressCol",
    "netPhaseInterval": 1000,
    "sizePrecision": 1,
    "netParamNameLimit": 25,
    "netShowPaintEvents": false,
    "netShowBFCacheResponses": true,
    "netHtmlPreviewHeight": 100,

// Cache
    "cache.mimeTypes": "",
    "cache.responseLimit": 5242880,

// Remoting
    "serverHost": "localhost",
    "serverPort": 2929,
    "remoteTrace": false,

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
