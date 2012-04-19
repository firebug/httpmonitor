/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/array"
],
function(FBTrace, Arr) {

// ********************************************************************************************* //

function Listener()
{
    // The array is created when the first listeners is added.
    // It can't be created here since derived objects would share
    // the same array.
    this.fbListeners = null;
}

Listener.prototype =
{
    addListener: function(listener)
    {
        if (!listener)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Listener.addListener; ERROR null listener registered.");
            return;
        }

        // Delay the creation until the objects are created so 'this' causes new array
        // for this object (e.g. module, panel, etc.)
        if (!this.fbListeners)
            this.fbListeners = [];

        this.fbListeners.push(listener);
    },

    removeListener: function(listener)
    {
        // if this.fbListeners is null, remove is being called with no add
        Arr.remove(this.fbListeners, listener);
    }
};

// ********************************************************************************************* //

return Listener;

// ********************************************************************************************* //
});
