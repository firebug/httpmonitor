/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/string",
],
function (FBTrace, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// ********************************************************************************************* //
// Implementation

var Url = {};

// ************************************************************************************************
// Regular expressions

Url.reCSS = /\.css$/;
Url.reJavascript = /\s*javascript:\s*(.*)/;
Url.reFile = /file:\/\/([^\/]*)\//;
Url.reChrome = /chrome:\/\/([^\/]*)\//;
Url.reDataURL = /data:text\/javascript;fileName=([^;]*);baseLineNumber=(\d*?),((?:.*?%0A)|(?:.*))/g;

// ************************************************************************************************
// URLs

Url.getFileName = function(url)
{
    var split = Url.splitURLBase(url);
    return split.name;
};

Url.getProtocol = function(url)
{
    var split = Url.splitURLBase(url);
    return split.protocol;
};

Url.splitURLBase = function(url)
{
    if (Url.isDataURL(url))
        return Url.splitDataURL(url);
    return Url.splitURLTrue(url);
};

Url.splitDataURL = function(url)
{
    if (!Str.hasPrefix(url, "data:"))
        return false; //  the first 5 chars must be 'data:'

    var point = url.indexOf(",", 5);
    if (point < 5)
        return false; // syntax error

    var props = { protocol: "data", encodedContent: url.substr(point+1) };

    var metadataBuffer = url.substring(5, point);
    var metadata = metadataBuffer.split(";");
    for (var i = 0; i < metadata.length; i++)
    {
        var nv = metadata[i].split("=");
        if (nv.length == 2)
            props[nv[0]] = nv[1];
    }

    // Additional Firebug-specific properties
    if (props.hasOwnProperty("fileName"))
    {
         var caller_URL = decodeURIComponent(props["fileName"]);
         var caller_split = Url.splitURLTrue(caller_URL);

         props["fileName"] = caller_URL;

        if (props.hasOwnProperty("baseLineNumber"))  // this means it's probably an eval()
        {
            props["path"] = caller_split.path;
            props["line"] = props["baseLineNumber"];
            var hint = decodeURIComponent(props["encodedContent"]).substr(0,200).replace(/\s*$/, "");
            props["name"] =  "eval->"+hint;
        }
        else
        {
            props["name"] = caller_split.name;
            props["path"] = caller_split.path;
        }
    }
    else
    {
        if (!props.hasOwnProperty("path"))
            props["path"] = "data:";
        if (!props.hasOwnProperty("name"))
            props["name"] =  decodeURIComponent(props["encodedContent"]).substr(0,200).replace(/\s*$/, "");
    }

    return props;
};

const reSplitFile = /(.*?):\/{2,3}([^\/]*)(.*?)([^\/]*?)($|\?.*)/;
Url.splitURLTrue = function(url)
{
    var m = reSplitFile.exec(url);
    if (!m)
        return {name: url, path: url};
    else if (m[4] == "" && m[5] == "")
        return {protocol: m[1], domain: m[2], path: m[3], name: m[3] != "/" ? m[3] : m[2]};
    else
        return {protocol: m[1], domain: m[2], path: m[2]+m[3], name: m[4]+m[5]};
};

Url.getFileExtension = function(url)
{
    if (!url)
        return null;

    // Remove query string from the URL if any.
    var queryString = url.indexOf("?");
    if (queryString != -1)
        url = url.substr(0, queryString);

    // Now get the file extension.
    var lastDot = url.lastIndexOf(".");
    return url.substr(lastDot+1);
};

Url.isDataURL = function(url)
{
    return (url && url.substr(0,5) == "data:");
};

Url.getDomain = function(url)
{
    var m = /[^:]+:\/{1,3}([^\/]+)/.exec(url);
    return m ? m[1] : "";
};

Url.getURLPath = function(url)
{
    var m = /[^:]+:\/{1,3}[^\/]+(\/.*?)$/.exec(url);
    return m ? m[1] : "";
};

Url.getPrettyDomain = function(url)
{
    var m = /[^:]+:\/{1,3}(www\.)?([^\/]+)/.exec(url);
    return m ? m[2] : "";
};

var reChromeCase = /chrome:\/\/([^/]*)\/(.*?)$/;
Url.normalizeURL = function(url)  // this gets called a lot, any performance improvement welcome
{
    if (!url)
        return "";
    // Replace one or more characters that are not forward-slash followed by /.., by space.
    if (url.length < 255) // guard against monsters.
    {
        // Replace one or more characters that are not forward-slash followed by /.., by space.
        url = url.replace(/[^/]+\/\.\.\//, "", "g");
        // Issue 1496, avoid #
        url = url.replace(/#.*/,"");
        // For some reason, JSDS reports file URLs like "file:/" instead of "file:///", so they
        // don't match up with the URLs we get back from the DOM
        url = url.replace(/file:\/([^/])/g, "file:///$1");
        // For script tags inserted dynamically sometimes the script.fileName is bogus
        url = url.replace(/[^\s]*\s->\s/, "");

        if (Str.hasPrefix(url, "chrome:"))
        {
            var m = reChromeCase.exec(url);  // 1 is package name, 2 is path
            if (m)
            {
                url = "chrome://"+m[1].toLowerCase()+"/"+m[2];
            }
        }
    }
    return url;
};

// ********************************************************************************************* //

Url.parseURLParams = function(url)
{
    var q = url ? url.indexOf("?") : -1;
    if (q == -1)
        return [];

    var search = url.substr(q+1);
    var h = search.lastIndexOf("#");
    if (h != -1)
        search = search.substr(0, h);

    if (!search)
        return [];

    return Url.parseURLEncodedText(search);
};

Url.parseURLEncodedText = function(text, noLimit)
{
    const maxValueLength = 25000;

    var params = [];

    // In case the text is empty just return the empty parameters
    if (text == "")
        return params;

    // Unescape '+' characters that are used to encode a space.
    // See section 2.2.in RFC 3986: http://www.ietf.org/rfc/rfc3986.txt
    text = text.replace(/\+/g, " ");

    // Unescape '&amp;' character
    text = Str.unescapeForURL(text);

    function decodeText(text)
    {
        try
        {
            return decodeURIComponent(text);
        }
        catch (e)
        {
            return decodeURIComponent(unescape(text));
        }
    }

    var args = text.split("&");
    for (var i = 0; i < args.length; ++i)
    {
        try
        {
            var index = args[i].indexOf("=");
            if (index != -1)
            {
                var paramName = args[i].substring(0, index);
                var paramValue = args[i].substring(index + 1);

                if (paramValue.length > maxValueLength && !noLimit)
                    paramValue = Locale.$STR("LargeData");

                params.push({name: decodeText(paramName), value: decodeText(paramValue)});
            }
            else
            {
                var paramName = args[i];
                params.push({name: decodeText(paramName), value: ""});
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("parseURLEncodedText EXCEPTION ", e);
                FBTrace.sysout("parseURLEncodedText EXCEPTION URI", args[i]);
            }
        }
    }

    params.sort(function(a, b) { return a.name <= b.name ? -1 : 1; });

    return params;
};

Url.reEncodeURL = function(file, text, noLimit)
{
    var lines = text.split("\n");
    var params = Url.parseURLEncodedText(lines[lines.length-1], noLimit);

    var args = [];
    for (var i = 0; i < params.length; ++i)
        args.push(encodeURIComponent(params[i].name)+"="+encodeURIComponent(params[i].value));

    var url = file.href;
    url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");

    return url;
};

Url.makeURI = function(urlString)
{
    try
    {
        if (urlString)
            return ioService.newURI(urlString, null, null);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("makeURI FAILS for \""+urlString+"\" ", exc);

        return false;
    }
}

/**
 * Converts resource: to file: Url.
 * @param {String} resourceURL
 */
Url.resourceToFile = function(resourceURL)
{
    var resHandler = ioService.getProtocolHandler("resource")
        .QueryInterface(Ci.nsIResProtocolHandler);

    var justURL = resourceURL.split("resource://")[1];
    var split = justURL.split("/");
    var sub = split.shift();

    var path = resHandler.getSubstitution(sub).spec;
    return path + split.join("/");
}

// ********************************************************************************************* //
// Registration

return Url;

// ********************************************************************************************* //
});
