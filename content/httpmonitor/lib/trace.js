/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

var FBTrace = Components.utils.import("resource://httpmonitor/modules/fbtrace.js").FBTrace;

// ********************************************************************************************* //
// Listeners

var listeners = [];

FBTrace.addListener = function(listener)
{
    listeners.push(listener);
}

FBTrace.removeListener = function(listener)
{
    for (var i=0; i<listeners.length; ++i)
    {
        if (listeners[i] == item)
        {
            listeners.splice(i, 1);
            return true;
        }
    }
    return false;
}

// ********************************************************************************************* //
// Hooks

var originalSysout = FBTrace.sysout;
FBTrace.sysout = function(msg)
{
    // Dispatch to registered listeners.
    for (var i=0; i<listeners.length; ++i)
        listeners[i].sysout.apply(listeners[i], arguments);

    // Dispatch to the original handler.
    originalSysout.apply(this, arguments);
}

// ********************************************************************************************* //

return FBTrace;

// ********************************************************************************************* //
});
