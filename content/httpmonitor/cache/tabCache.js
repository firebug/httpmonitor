/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/locale",
    "httpmonitor/lib/events",
    "httpmonitor/lib/http",
    "httpmonitor/lib/string",
    "httpmonitor/cache/sourceCache",
    "httpmonitor/lib/options",
    "httpmonitor/cache/tabCacheModel"
],
function(FBTrace, Obj, Locale, Events, Http, Str, SourceCache, Options, TabCacheModel) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// Maximum cached size of a single response (bytes)
var responseSizeLimit = Options.get("cache.responseLimit");

// ********************************************************************************************* //
// Tab Cache

/**
 * This cache object is intended to cache all responses made by a specific tab.
 * The implementation is based on nsITraceableChannel interface introduced in
 * Firefox 3.0.4. This interface allows to intercept all incoming HTTP data.
 *
 * This object replaces the SourceCache, which still exist only for backward
 * compatibility.
 *
 * The object is derived from SourceCache so, the same interface and most of the
 * implementation is used.
 */
function TabCache(context)
{
    if (FBTrace.DBG_CACHE)
        FBTrace.sysout("tabCache.TabCache Created for: " + context.getName());

    SourceCache.call(this, context);
};

TabCache.prototype = Obj.extend(SourceCache.prototype,
{
    // Responses in progress
    responses: [],

    storePartialResponse: function(request, responseText, win, offset)
    {
        if (!offset)
            offset = 0;

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.storePartialResponse " + Http.safeGetRequestName(request),
                request.contentCharset);

        var url = Http.safeGetRequestName(request);
        var response = this.getResponse(request);

        // Skip any response data that we have received before (f ex when
        // response packets are repeated due to quirks in how authentication
        // requests are projected to the channel listener)
        var newRawSize = offset + responseText.length;
        var addRawBytes = newRawSize - response.rawSize;

        if (responseText.length > addRawBytes)
            responseText = responseText.substr(responseText.length - addRawBytes);

        try
        {
            responseText = Str.convertToUnicode(responseText, win.document.characterSet);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.storePartialResponse EXCEPTION " +
                    Http.safeGetRequestName(request), err);

            // Even responses that are not converted are stored into the cache.
            // return false;
        }

        // Size of each response is limited.
        var limitNotReached = true;
        if (response.size + responseText.length >= responseSizeLimit)
        {
            limitNotReached = false;
            responseText = responseText.substr(0, responseSizeLimit - response.size);
            FBTrace.sysout("tabCache.storePartialResponse Max size limit reached for: " + url);
        }

        response.size += responseText.length;
        response.rawSize = newRawSize;

        // Store partial content into the cache.
        this.store(url, responseText);

        // Return false if furhter parts of this response should be ignored.
        return limitNotReached;
    },

    getResponse: function(request)
    {
        var url = Http.safeGetRequestName(request);
        var response = this.responses[url];
        if (!response)
        {
            this.invalidate(url);
            this.responses[url] = response = {
                request: request,
                size: 0,
                rawSize: 0
            };
        }

        return response;
    },

    storeSplitLines: function(url, lines)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.storeSplitLines: " + url, lines);

        var currLines = this.cache[url];
        if (!currLines)
            currLines = this.cache[url] = [];

        // Join the last line with the new first one so, the source code
        // lines are properly formatted...
        if (currLines.length && lines.length)
        {
            // ... but only if the last line isn't already completed.
            var lastLine = currLines[currLines.length-1];
            if (lastLine && lastLine.search(/\r|\n/) == -1)
                currLines[currLines.length-1] += lines.shift();
        }

        // Append new lines (if any) into the array for specified url.
        if (lines.length)
            this.cache[url] = currLines.concat(lines);

        return this.cache[url];
    },

    loadFromCache: function(url, method, file)
    {
        // The ancestor implementation (SourceCache) uses ioService.newChannel, which
        // can result in additional request to the server (in case the response can't
        // be loaded from the Firefox cache) - known as double-load problem.
        // This new implementation (TabCache) uses nsITraceableChannel so, all responses
        // should be already cached.

        // xxxHonza: TODO entire implementation of this method should be removed
        // xxxHonza: let's try to get the response from the cache till #449198 is fixed.
        var stream;
        var responseText;
        try
        {
            if (!url)
                return responseText;

            if (url === "<unknown>")
                return [Locale.$STR("message.sourceNotAvailableFor") + ": " + url];

            var channel = ioService.newChannel(url, null, null);

            // These flag combination doesn't repost the request.
            channel.loadFlags = Ci.nsIRequest.LOAD_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

            var charset = "UTF-8";

            if (!this.context.window)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("tabCache.loadFromCache; ERROR this.context.window " +
                        "is undefined");
                }
            }

            var doc = this.context.window ? this.context.window.document : null;
            if (doc)
                charset = doc.characterSet;

            stream = channel.open();

            // The response doesn't have to be in the browser cache.
            if (!stream.available())
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.loadFromCache; Failed to load source for: " + url);

                stream.close();
                return [Locale.$STR("message.sourceNotAvailableFor") + ": " + url];
            }

            // Don't load responses that shouldn't be cached.
            if (!TabCacheModel.shouldCacheRequest(channel))
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.loadFromCache; The resource from this URL is not text: " + url);

                stream.close();
                return [Locale.$STR("message.The resource from this URL is not text") + ": " + url];
            }

            responseText = Http.readFromStream(stream, charset);

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache (response coming from FF Cache) " +
                    url, responseText);

            responseText = this.store(url, responseText);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache EXCEPTION on url \'" + url +"\'", err);
        }
        finally
        {
            if (stream)
                stream.close();
        }

        return responseText;
    },

    // nsIStreamListener - callbacks from channel stream listener component.
    onStartRequest: function(request, requestContext)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.startRequest: " + Http.safeGetRequestName(request));

        // Make sure the response-entry (used to count total response size) is properly
        // initialized (cleared) now. If no data is received, the response entry remains empty.
        var response = this.getResponse(request);

        Events.dispatch(TabCacheModel.fbListeners, "onStartRequest", [this.context, request]);
        Events.dispatch(this.fbListeners, "onStartRequest", [this.context, request]);
    },

    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.onDataAvailable: " + Http.safeGetRequestName(request));

        // If the stream is read a new one must be provided (the stream doesn't implement
        // nsISeekableStream).
        var stream = {
            value: inputStream
        };

        Events.dispatch(TabCacheModel.fbListeners, "onDataAvailable",
            [this.context, request, requestContext, stream, offset, count]);
        Events.dispatch(this.fbListeners, "onDataAvailable", [this.context,
            request, requestContext, stream, offset, count]);

        return stream.value;
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        // The response is finally received so, remove the request from the list of
        // current responses.
        var url = Http.safeGetRequestName(request);
        delete this.responses[url];

        var lines = this.cache[this.removeAnchor(url)];
        var responseText = lines ? lines.join("") : "";

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.stopRequest: " + Http.safeGetRequestName(request),
                responseText);

        Events.dispatch(TabCacheModel.fbListeners, "onStopRequest",
            [this.context, request, responseText]);
        Events.dispatch(this.fbListeners, "onStopRequest", [this.context, request, responseText]);
    }
});

// ********************************************************************************************* //
// Registration

return TabCache;

// ********************************************************************************************* //
});