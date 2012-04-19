/* See license.txt for terms of usage */

define([
    "lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Chrome

/**
 * This object mediate access to the application UI (XUL document).
 */
var Chrome =
{
    $: function(id)
    {
        if (typeof(top) == "undefined")
            return;

        return top.document.getElementById(id);
    },

    setGlobalAttribute: function(id, name, value)
    {
        var elt = this.$(id);
        if (elt)
        {
            if (value == null)
                elt.removeAttribute(name);
            else
                elt.setAttribute(name, value);
        }
    },

    getGlobalAttribute: function(id, name)
    {
        var elt = this.$(id);
        if (elt)
            return elt.getAttribute(name);
    },
}

// ********************************************************************************************* //

return Chrome;

// ********************************************************************************************* //
});
