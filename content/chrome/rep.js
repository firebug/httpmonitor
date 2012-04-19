/* See license.txt for terms of usage */

/**
 * Firebug module can depend only on modules that don't use the 'Firebug' namespace.
 * So, be careful before you create a new dependency.
 */
define([
    "lib/trace",
    "lib/css",
    "lib/object",
    "lib/domplate",
    "lib/options",
    "lib/events",
    "lib/dom",
    "lib/array"
],
function(FBTrace, Css, Obj, Domplate, Options, Events, Dom, Arr) {
with (Domplate) {

// ********************************************************************************************* //

/**
 * Base object for most of the domplate templates
 */
var Rep = domplate(
{
    className: "",
    inspectable: true,

    supportsObject: function(object, type)
    {
        return false;
    },

    highlightObject: function(object, context)
    {
        var realObject = this.getRealObject(object, context);
        if (realObject)
            Firebug.Inspector.highlightObject(realObject, context);
    },

    unhighlightObject: function(object, context)
    {
        Firebug.Inspector.highlightObject(null);
    },

    persistObject: function(object, context)
    {
    },

    getRealObject: function(object, context)
    {
        return object;
    },

    getTitle: function(object)
    {
        if (object.constructor && typeof(object.constructor) == 'function')
        {
            var ctorName = object.constructor.name;
            if (ctorName && ctorName != "Object")
                return ctorName;
        }

        var label = FBL.safeToString(object); // eg [object XPCWrappedNative [object foo]]

        const re =/\[object ([^\]]*)/;
        var m = re.exec(label);
        var n = null;
        if (m)
            n = re.exec(m[1]);  // eg XPCWrappedNative [object foo

        if (n)
            return n[1];  // eg foo
        else
            return m ? m[1] : label;
    },

    getTooltip: function(object)
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when the underlying object
     * has this rep. See also Panel for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     *
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @param context: the context, probably Firebug.currentContext
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Convenience for domplates

    STR: function(name)
    {
        return Locale.$STR(name);
    },

    cropString: function(text)
    {
        return Str.cropString(text);
    },

    toLowerCase: function(text)
    {
        return text ? text.toLowerCase() : text;
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }
});

// ********************************************************************************************* //

return Rep;

// ********************************************************************************************* //
}});
