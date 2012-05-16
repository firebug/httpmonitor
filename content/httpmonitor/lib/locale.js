/* See license.txt for terms of usage */

define([ "httpmonitor/lib/trace" ], function(FBTrace) {

// ********************************************************************************************* //
// Module

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Services

// Import of PluralForm object.
Cu.import("resource://gre/modules/PluralForm.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// ********************************************************************************************* //
// Firebug UI Localization

var stringBundleService = Services.strings;
var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

// xxxHonza: should be pref
var useDefaultLocale = false; 

// This module
var Locale = {};

/*
 * $STR - intended for localization of a static string.
 * $STRF - intended for localization of a string with dynamically inserted values.
 * $STRP - intended for localization of a string with dynamically plural forms.
 *
 * Notes:
 * 1) Name with _ in place of spaces is the key in the *.properties file.
 * 2) If the specified key isn't localized for particular language, both methods use
 *    the part after the last dot (in the specified name) as the return value.
 *
 * Examples:
 * $STR("Label"); - search for key "Label" within the *.properties file
 *                 and returns its value. If the key doesn't exist returns "Label".
 *
 * $STR("Button Label"); - search for key "Button_Label" withing the *.properties
 *                        file. If the key doesn't exist returns "Button Label".
 *
 * $STR("net.Response Header"); - search for key "net.Response_Header". If the key doesn't
 *                               exist returns "Response Header".
 *
 * *.properties:
 * net.timing.Request_Time=Request Time: %S [%S]
 *
 * var param1 = 10;
 * var param2 = "ms";
 * $STRF("net.timing.Request Time", param1, param2);  -> "Request Time: 10 [ms]"
 *
 * - search for key "net.timing.Request_Time" within the *.properties file. Parameters
 *   are inserted at specified places (%S) in the same order as they are passed. If the
 *   key doesn't exist the method returns "Request Time".
 */
Locale.$STR = function(name, bundle)
{
    var strKey = name.replace(" ", "_", "g");

    if (!useDefaultLocale)
    {
        try
        {
            if (bundle)
                return bundle.getString(strKey);
            else
                return Locale.getStringBundle().GetStringFromName(strKey);
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("lib.getString FAILS '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var defaultBundle = Locale.getDefaultStringBundle();
        if (defaultBundle)
            return defaultBundle.GetStringFromName(strKey);
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("lib.getString (default) FAILS '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0 && name.charAt(index-1) != "\\")
        name = name.substr(index + 1);
    name = name.replace("_", " ", "g");
    return name;
}

Locale.$STRF = function(name, args, bundle)
{
    var strKey = name.replace(" ", "_", "g");

    if (!useDefaultLocale)
    {
        try
        {
            if (bundle)
                return bundle.getFormattedString(strKey, args);
            else
                return Locale.getStringBundle().formatStringFromName(strKey, args, args.length);
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("lib.getString FAILS '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var defaultBundle = Locale.getDefaultStringBundle();
        if (defaultBundle)
            return defaultBundle.formatStringFromName(strKey, args, args.length);
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("lib.getString (default) FAILS '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
}

Locale.$STRP = function(name, args, index, bundle)
{
    // xxxHonza:
    // pluralRule from chrome://global/locale/intl.properties for Chinese is 1,
    // which is wrong, it should be 0.

    var getPluralForm = PluralForm.get;
    var getNumForms = PluralForm.numForms;

    // Get custom plural rule; otherwise the rule from chrome://global/locale/intl.properties
    // (depends on the current locale) is used.
    var pluralRule = Locale.getPluralRule();
    if (!isNaN(parseInt(pluralRule, 10)))
        [getPluralForm, getNumForms] = PluralForm.makeGetter(pluralRule);

    // Index of the argument with plural form (there must be only one arg that needs plural form).
    if (!index)
        index = 0;

    // Get proper plural form from the string (depends on the current Firefox locale).
    var translatedString = Locale.$STRF(name, args, bundle);
    if (translatedString.search(";") > 0)
        return getPluralForm(args[index], translatedString);

    // translatedString contains no ";", either rule 0 or getString fails
    return translatedString;
}

/*
 * Use the current value of the attribute as a key to look up the localized value.
 */
Locale.internationalize = function(element, attr, args)
{
    if (element)
    {
        var xulString = element.getAttribute(attr);
        if (xulString)
        {
            var localized = args ? Locale.$STRF(xulString, args) : Locale.$STR(xulString);
            // Set localized value of the attribute only if it exists.
            if (localized)
                element.setAttribute(attr, localized);
        }
    }
    else
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("Failed to internationalize element with attr "+attr+" args:"+args);
    }
}

Locale.internationalizeElements = function(doc, elements, attributes)
{
    for (var i=0; i<elements.length; i++)
    {
        var element = elements[i];

        if (typeof(elements) == "string")
            element = doc.getElementById(elements[i]);

        if (!element)
            continue;

        // Remove fbInternational class so, the label is not translated again later.
        element.classList.remove("fbInternational");

        for (var j=0; j<attributes.length; j++)
        {
            if (element.hasAttribute(attributes[j]))
                Locale.internationalize(element, attributes[j]);
        }
    }
}

Locale.registerStringBundle = function(bundleURI)
{
    // Notice that this category entry must not be persistent in Fx 4.0
    categoryManager.addCategoryEntry("strings_httpmonitor", bundleURI, "", false, true);
    this.stringBundle = null;
}

Locale.getStringBundle = function()
{
    if (!this.stringBundle)
        this.stringBundle = stringBundleService.createExtensibleBundle("strings_httpmonitor");
    return this.stringBundle;
}

Locale.getDefaultStringBundle = function()
{
    if (!this.defaultStringBundle)
    {
        var chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].
            getService(Ci.nsIChromeRegistry);

        var uri = Services.io.newURI("chrome://httpmonitor/locale/httpmonitor.properties", "UTF-8", null);
        var fileURI = chromeRegistry.convertChromeURL(uri).spec;
        var parts = fileURI.split("/");
        parts[parts.length - 2] = "en-US";
        this.defaultStringBundle = stringBundleService.createBundle(parts.join("/"));
    }
    return this.defaultStringBundle;
}

Locale.getPluralRule = function()
{
    try
    {
        return this.getStringBundle().GetStringFromName("pluralRule");
    }
    catch (err)
    {
    }
}

// ********************************************************************************************* //

return Locale;

// ********************************************************************************************* //
});
