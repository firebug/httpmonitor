/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/xpcom",
    "httpmonitor/lib/trace",
    "httpmonitor/lib/string"
],
function(Xpcom, FBTrace, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

var Http = {};

// ********************************************************************************************* //
// Module Implementation

Http.readFromStream = function(stream, charset, noClose)
{
    // Causes a memory leak (see https://bugzilla.mozilla.org/show_bug.cgi?id=699801)
    //var sis = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    //sis.setInputStream(stream);

    var sis = Cc["@mozilla.org/scriptableinputstream;1"].
        createInstance(Ci.nsIScriptableInputStream);
    sis.init(stream);

    var segments = [];
    for (var count = stream.available(); count; count = stream.available())
        segments.push(sis.readBytes(count));

    if (!noClose)
        sis.close();

    var text = segments.join("");

    try
    {
        return Str.convertToUnicode(text, charset);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("http.readFromStream EXCEPTION charset: " + charset, err);
    }

    return text;
};

Http.readPostTextFromPage = function(url, context)
{
    if (!context.browser)
    {
        FBTrace.sysout("Http.readPostTextFromPage; ERROR context.browser not available")
        return;
    }

    if (url == context.browser.contentWindow.location.href)
    {
        try
        {
            var webNav = context.browser.webNavigation;
            var descriptor = (webNav instanceof Ci.nsIWebPageDescriptor) ?
                webNav.currentDescriptor : null;

            if (!(descriptor instanceof Ci.nsISHEntry))
                return;

            var entry = descriptor;
            if (entry && entry.postData)
            {
                if (!(entry.postData instanceof Ci.nsISeekableStream))
                    return;

                var postStream = entry.postData;
                postStream.seek(NS_SEEK_SET, 0);

                var charset = context.window.document.characterSet;
                return Http.readFromStream(postStream, charset, true);
            }
         }
         catch (exc)
         {
             if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("http.readPostText FAILS, url:"+url, exc);
         }
     }
};

Http.getResource = function(aURL)
{
    try
    {
        var channel = ioService.newChannel(aURL, null, null);
        var input = channel.open();

        return Http.readFromStream(input);
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.getResource FAILS for \'"+aURL+"\'", e);
    }
};

/**
 * Returns a posted data for specified request object. The return value might contain
 * headers (if request.uploadStreamHasHeaders is set to true). You can remove these
 * headers using {@link Http.removeHeadersFromPostText}
 * 
 * @param {Object} request The request object
 * @param {Object} context Current context (to get charset of the current document)
 */
Http.readPostTextFromRequest = function(request, context)
{
    try
    {
        var is = (request instanceof Ci.nsIUploadChannel) ? request.uploadStream : null;
        if (is)
        {
            if (!(is instanceof Ci.nsISeekableStream))
                return;

            var ss = is;
            var prevOffset;
            if (ss)
            {
                prevOffset = ss.tell();
                ss.seek(NS_SEEK_SET, 0);
            }

            // Read data from the stream..
            var charset = (context && context.window) ? context.window.document.characterSet : null;
            var text = Http.readFromStream(is, charset, true);

            // Seek locks the file so, seek to the beginning only if necko hasn't read it yet,
            // since necko doesn't seek to 0 before reading (at lest not till 459384 is fixed).
            if (ss && prevOffset == 0)
                ss.seek(NS_SEEK_SET, 0);

            return text;
        }
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("http.readPostTextFromRequest FAILS ", exc);
    }

    return null;
};

/**
 * Remove headers from post body, https://bugzilla.mozilla.org/show_bug.cgi?id=649338
 * 
 * @param {Object} request Channel implementing nsIUploadChannel2
 * @param {Object} text Extracted text (can include headers at the beginning).
 */
Http.removeHeadersFromPostText = function(request, text)
{
    if (!text)
        return text;

    if (typeof(Ci.nsIUploadChannel2) == "undefined")
        return text;

    if (!(request instanceof Ci.nsIUploadChannel2))
        return text;

    if (!request.uploadStreamHasHeaders)
        return text;

    var headerSeparator = "\r\n\r\n";
    var index = text.indexOf(headerSeparator);
    if (index == -1)
        return text;

    return text.substring(index + headerSeparator.length);
}

/**
 * Returns an array of headers from posted data (appended by Firefox)
 * 
 * @param {Object} request Channel implementing nsIUploadChannel2
 * @param {Object} text Posted data from the channel object.
 */
Http.getHeadersFromPostText = function(request, text)
{
    var headers = [];
    if (!text)
        return headers;

    if (typeof(Ci.nsIUploadChannel2) == "undefined")
        return headers;

    if (!(request instanceof Ci.nsIUploadChannel2))
        return headers;

    if (!request.uploadStreamHasHeaders)
        return headers;

    var headerSeparator = "\r\n\r\n";
    var index = text.indexOf(headerSeparator);
    if (index == -1)
        return headers;

    var text = text.substring(0, index);
    var lines = Str.splitLines(text);

    for (var i=0; i<lines.length; i++)
    {
        var header = lines[i].split(":");
        if (header.length != 2)
            continue;

        headers.push({
            name: Str.trim(header[0]),
            value: Str.trim(header[1]),
        });
    }

    return headers;
}

Http.getInputStreamFromString = function(dataString)
{
    var stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
        createInstance(Ci.nsIStringInputStream);

    if ("data" in stringStream) // Gecko 1.9 or newer
        stringStream.data = dataString;
    else // 1.8 or older
        stringStream.setData(dataString, dataString.length);

    return stringStream;
};

Http.getWindowForRequest = function(request)
{
    var loadContext = Http.getRequestLoadContext(request);
    try
    {
        if (loadContext)
            return loadContext.associatedWindow;
    }
    catch (ex)
    {
    }

    return null;
};

Http.getRequestLoadContext = function(request)
{
    try
    {
        if (request && request.notificationCallbacks)
        {
            //StackFrame.suspendShowStackTrace();
            return request.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
    }
    catch (exc)
    {
    }
    finally
    {
        //StackFrame.resumeShowStackTrace();
    }

    try
    {
        if (request && request.loadGroup && request.loadGroup.notificationCallbacks)
        {
            //StackFrame.suspendShowStackTrace();
            return request.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
    }
    catch (exc)
    {
    }
    finally
    {
        //StackFrame.resumeShowStackTrace();
    }

    return null;
};

// ********************************************************************************************* //
// HTTP Channel Fields

Http.safeGetRequestName = function(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
    }

    return null;
}

Http.safeGetURI = function(browser)
{
    try
    {
        return browser.currentURI;
    }
    catch (exc)
    {
    }

    return null;
}

Http.safeGetContentType = function(request)
{
    try
    {
        return new String(request.contentType).toLowerCase();
    }
    catch (err)
    {
    }

    return null;
}

Http.safeGetXHRResponseText = function(xhr)
{
    try
    {
        return xhr.responseText;
    }
    catch (err)
    {
    }

    return null;
}

// ********************************************************************************************* //
// IP Adress and port number (Requires Gecko 5).

Http.safeGetLocalAddress = function(request)
{
    try
    {
        if (request instanceof Ci.nsIHttpChannelInternal)
            return request.localAddress;
    }
    catch (err)
    {
    }
    return null;
}

Http.safeGetLocalPort = function(request)
{
    try
    {
        if (request instanceof Ci.nsIHttpChannelInternal)
            return request.localPort;
    }
    catch (err)
    {
    }
    return null;
}

Http.safeGetRemoteAddress = function(request)
{
    try
    {
        if (request instanceof Ci.nsIHttpChannelInternal)
            return request.remoteAddress;
    }
    catch (err)
    {
    }
    return null;
}

Http.safeGetRemotePort = function(request)
{
    try
    {
        if (request instanceof Ci.nsIHttpChannelInternal)
            return request.remotePort;
    }
    catch (err)
    {
    }
    return null;
}

// ********************************************************************************************* //
// XHR

Http.isXHR = function(request)
{
    try
    {
        var callbacks = request.notificationCallbacks;
        //StackFrame.suspendShowStackTrace();
        var xhrRequest = callbacks ? callbacks.getInterface(Ci.nsIXMLHttpRequest) : null;
        return (xhrRequest != null);
    }
    catch (exc)
    {
    }
    finally
    {
        //StackFrame.resumeShowStackTrace();
    }

    return false;
}

// ********************************************************************************************* //
// Registration

return Http;

// ********************************************************************************************* //
});
