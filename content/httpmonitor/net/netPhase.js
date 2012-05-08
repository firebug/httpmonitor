/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/array",
],
function(FBTrace, Arr) {

// ********************************************************************************************* //
// NetPhase Implementation

/**
 * A Phase is a helper object that groups requests made in the same time frame.
 * In other words, if a new requests is started within a given time (specified
 * by phaseInterval [ms]) - after previous request has been started -
 * it automatically belongs to the same phase.
 * If a request is started after this period, a new phase is created
 * and this file becomes to be the first in that phase.
 * The first phase is ended when the page finishes it's loading. Other phases
 * might be started by additional XHR made by the page.
 *
 * All phases are stored within NetProgress.phases array.
 *
 * Phases are used to compute size of the graphical timeline. The timeline
 * for each phase starts from the beginning of the graph.
 */
function NetPhase(file)
/** @lends NetPhase */
{
    // Start time of the phase. Remains the same, even if the file
    // is removed from the log (due to a max limit of entries).
    // This ensures stability of the time line.
    this.startTime = file.startTime;

    // The last finished request (file) in the phase.
    this.lastFinishedFile = null;

    // Set to true if the phase needs to be updated in the UI.
    this.invalidPhase = null;

    // List of files associated with this phase.
    this.files = [];

    // List of time-stamps. Can be window related events like load, paint or DOMContentLoaded
    // or custom events provided by e.g. console.timeStamp() method.
    this.timeStamps = [];

    this.addFile(file);
}

NetPhase.prototype =
{
    addFile: function(file)
    {
        this.files.push(file);
        file.phase = this;
    },

    removeFile: function removeFile(file)
    {
        Arr.remove(this.files, file);

        // The file don't have a parent phase now.
        file.phase = null;

        // If the last file has been removed, update the last file member.
        if (file == this.lastFinishedFile)
        {
            if (this.files.length == 0)
            {
                this.lastFinishedFile = null;
            }
            else
            {
                for (var i=0; i<this.files.length; i++)
                {
                    if (this.lastFinishedFile.endTime < this.files[i].endTime)
                        this.lastFinishedFile = this.files[i];
                }
            }
        }
    },

    get lastStartTime()
    {
        return this.files[this.files.length - 1].startTime;
    },

    get endTime()
    {
        var endTime = this.lastFinishedFile ? this.lastFinishedFile.endTime : null;
        if (this.timeStamps.length > 0)
        {
            var lastTimeStamp = this.timeStamps[this.timeStamps.length-1].time;
            endTime = (endTime > lastTimeStamp) ? endTime : lastTimeStamp;
        }
        return endTime;
    },

    addTimeStamp: function(label, classes)
    {
        var timeStamp = {
            label: label,
            classes: classes
        };

        this.timeStamps.push(timeStamp);

        // Store phase timing info also into the first phase file so, it can be sent
        // over the network (in case of remote) if necessary. Only files are sent to the client.
        var firstFile = this.files[0];
        if (!firstFile.timeStamps)
            firstFile.timeStamps = [];

        firstFile.timeStamps.push(timeStamp);

        return timeStamp;
    },

    getTimeStamp: function(label)
    {
        for (var i=0; i<this.timeStamps.length; i++)
        {
            var timeStamp = this.timeStamps[i];
            if (timeStamp.label == label)
                return timeStamp;
        }
    }
};

// ********************************************************************************************* //
// Registration

return NetPhase;

// ********************************************************************************************* //
});
