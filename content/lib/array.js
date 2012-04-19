/* See license.txt for terms of usage */

define([
    "lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Arr = {};

// ********************************************************************************************* //
// Arrays

Arr.isArray = function(obj)
{
    if (Array.isArray)
        return Array.isArray(obj);

    return Object.prototype.toString.call(obj) === "[object Array]";
}

Arr.values = function(map)
{
    var values = [];
    try
    {
        for (var name in map)
        {
            try
            {
                values.push(map[name]);
            }
            catch (exc)
            {
                // Sometimes we get exceptions trying to access properties
                if (FBTrace.DBG_ERRORS)
                    FBTrace.dumpPropreties("lib.values FAILED ", exc);
            }
        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
        if (FBTrace.DBG_ERRORS)
            FBTrace.dumpPropreties("lib.values FAILED ", exc);
    }

    return values;
};

Arr.remove = function(list, item)
{
    for (var i = 0; i < list.length; ++i)
    {
        if (list[i] == item)
        {
            list.splice(i, 1);
            return true;
        }
    }
    return false;
};

Arr.cloneArray = function(array, fn)
{
   var newArray = [];

   if (fn)
       for (var i = 0; i < array.length; ++i)
           newArray.push(fn(array[i]));
   else
       for (var i = 0; i < array.length; ++i)
           newArray.push(array[i]);

   return newArray;
}

Arr.extendArray = function(array, array2)
{
   var newArray = [];
   newArray.push.apply(newArray, array);
   newArray.push.apply(newArray, array2);
   return newArray;
}

Arr.arrayInsert = function(array, index, other)
{
   for (var i = 0; i < other.length; ++i)
       array.splice(i+index, 0, other[i]);

   return array;
}

// ********************************************************************************************* //

return Arr;

// ********************************************************************************************* //
});
