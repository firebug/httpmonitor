/* See license.txt for terms of usage */

define([
    "lib/trace",
    "lib/array",
    "lib/string",
],
function(FBTrace, Arr, Str) {

// ********************************************************************************************* //

var Obj = {};

// ********************************************************************************************* //

Obj.bind = function()  // fn, thisObject, args => thisObject.fn(arguments, args);
{
   var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function bind() { return fn.apply(object, Arr.arrayInsert(Arr.cloneArray(args), 0, arguments)); }
};

Obj.bindFixed = function() // fn, thisObject, args => thisObject.fn(args);
{
    var args = Arr.cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); }
};

Obj.extend = function(l, r)
{
    if (!l || !r)
    {
        FBTrace.sysout("object.extend; ERROR", [l, r]);
        throw new Error("Obj.extend on undefined object");
    }

    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
};

// ************************************************************************************************

/**
 * Returns true if the passed object has any properties, otherwise returns false.
 *
 * @param {Object} ob Inspected object
 * @param {Object} nonEnumProps If set to true, check also non-enumerable properties (optional)
 * @param {Object} ownPropsOnly If set to true, only check own properties not inherited (optional)
 */
Obj.hasProperties = function(ob, nonEnumProps, ownPropsOnly)
{
    try
    {
        if (!ob)
            return false;

        var obString = Str.safeToString(ob);
        if (obString === "[object StorageList]" ||
            obString === "[xpconnect wrapped native prototype]")
        {
            return true;
        }

        // The default case (both options false) is relatively simple.
        // Just use for..in loop.
        if (!nonEnumProps && !ownPropsOnly)
        {
            for (var name in ob)
            {
                // Try to access the property before declaring existing properties.
                // It's because some properties can't be read see:
                // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
                var value = ob[name];
                return true;
            }
            return false;
        }

        var type = typeof(ob);
        if (type == "string" && ob.length)
            return true;

        if (nonEnumProps)
            props = Object.getOwnPropertyNames(ob);
        else
            props = Object.keys(ob);

        if (props.length)
        {
            // Try to access the property before declaring existing properties.
            // It's because some properties can't be read see:
            // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
            var value = ob[props[0]];
            return true;
        }

        // Not interested in inherited properties, bail out.
        if (ownPropsOnly)
            return false;

        // Climb prototype chain.
        var inheritedProps = [];
        var parent = Object.getPrototypeOf(ob);
        if (parent)
            return this.hasProperties(parent, nonEnumProps, ownPropsOnly);
    }
    catch (exc)
    {
        // Primitive (non string) objects will throw an exception when passed into
        // Object.keys or Object.getOwnPropertyNames APIs.
        // There are also many of "security error" exceptions I guess none is really
        // necessary to be dispalyed in FBTrace console so, remove the tracing for now.
        // if (FBTrace.DBG_ERRORS)
        //     FBTrace.sysout("lib.hasProperties(" + Str.safeToString(ob) + ") ERROR " + exc, exc);

        // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
        if (ob.wrappedJSObject)
            return true;
    }

    return false;
};

Obj.getUniqueId = function()
{
    return this.getRandomInt(0,65536);
}

Obj.getRandomInt = function(min, max)
{
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// ********************************************************************************************* //

return Obj;

// ********************************************************************************************* //
});
