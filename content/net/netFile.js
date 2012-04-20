/* See license.txt for terms of usage */

define([
    "lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Globals

// ID generator
var gSerialNumber = 0;

// ********************************************************************************************* //
// NetFile Implementation

/**
 * A File is a helper object that represents a file for which a request is made.
 * The document refers to it's parent document (NetDocument) through a member
 * variable.
 */
function NetFile(href, document)
{
    this.href = href;
    this.document = document;
    this.serial = ++gSerialNumber;
}

NetFile.prototype =
{
    status: 0,
    files: 0,
    loaded: false,
    fromCache: false,
    size: -1,
    expectedSize: -1,
    endTime: null,
    waitingForTime: null,
    connectingTime: null,

    getFileLink: function(message)
    {
        // this.SourceLink = function(url, line, type, object, instance)
        //var link = new SourceLink.SourceLink(this.href, null, "net", this.request);
        //return link;
        return {};
    },

    getFileURL: function()
    {
        var index = this.href.indexOf("?");
        if (index < 0)
            return this.href;

        return this.href.substring(0, index);
    },

    clear: function()
    {
        // Remove all members to avoid circular references and memleaks.
        for (var name in this)
            delete this[name];
    },

    clone: function()
    {
        var result = {};
        for (var p in this)
            result[p] = this[p];

        // Do not clone request and phase
        delete result.request;
        delete result.phase;

        return result;
    }
};

// ********************************************************************************************* //
// Registration

return NetFile;

// ********************************************************************************************* //
});
