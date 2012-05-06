/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/events",
    "httpmonitor/lib/trace"
],
function factoryOptions(Events, FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const PrefService = Cc["@mozilla.org/preferences-service;1"];

const nsIPrefService = Ci.nsIPrefService;
const prefService = PrefService.getService(nsIPrefService);
const prefs = PrefService.getService(nsIPrefBranch2);

Cu.import("resource://gre/modules/Services.jsm");

var optionUpdateMap = {};

// ********************************************************************************************* //

var prefTypeMap = (function()
{
    var map = {}, br = Ci.nsIPrefBranch;
    map["string"] = map[br.PREF_STRING] = "CharPref";
    map["boolean"] = map[br.PREF_BOOL] = "BoolPref";
    map["number"] = map[br.PREF_INT] = "IntPref";
    return map;
})();

// ********************************************************************************************* //

/**
 * Interface to preference storage.
 * Panels send commands to request option change.
 * Backend responds with events when the change is accepted.
 */
var Options =
/** @lends Options */
{
    getPrefDomain: function()
    {
        return this.prefDomain;
    },

    initialize: function(prefDomain)
    {
        this.prefDomain = prefDomain;

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("options.initialize with prefDomain " + this.prefDomain);

        this.initializePrefs();
    },

    initializePrefs: function()
    {
        if (this.observing)
            this.shutdown();

        prefs.addObserver(this.prefDomain, this, false);

        this.observing = true;
    },

    shutdown: function()
    {
        prefService.savePrefFile(null);

        if (this.observing)
            prefs.removeObserver(this.prefDomain, this, false);

        this.observing = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Custom Listeners

    listeners: [],

    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        for (var i=0; i<this.listeners.length; ++i)
            if (this.listeners[i] == listener)
                return this.listeners.splice(i, 1);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIPrefObserver

    observe: function(subject, topic, data)
    {
        if (data.indexOf(Options.prefDomain) === -1)
            return;

        var name = data.substr(Options.prefDomain.length+1);  // +1 for .
        var value = this.get(name);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.observe name = value: "+name+"= "+value+"\n");

        this.updatePref(name, value);
    },

    updatePref: function(name, value)
    {
        // Prevent infinite recursion due to pref observer
        if (optionUpdateMap.hasOwnProperty(name))
            return;

        try
        {
            optionUpdateMap[name] = 1;

            Events.dispatch(this.listeners, "updateOption", [name, value]);
        }
        catch (err)
        {
            if (FBTrace.DBG_OPTIONS || FBTrace.DBG_ERRORS)
                FBTrace.sysout("options.updatePref EXCEPTION:" + err, err);
        }
        finally
        {
            delete optionUpdateMap[name];
        }

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.updatePref EXIT: "+name+"="+value+"\n");
    },

    register: function(name, value)
    {
        var currentValue = this.getPref(this.prefDomain, name);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("registerPreference "+name+" -> "+value+" type "+typeof(value)+
                " with currentValue "+currentValue);

        if (currentValue === undefined)
        {
            // https://developer.mozilla.org/en/Code_snippets/Preferences
            // This is the reason why you should usually pass strings ending with a dot to
            // getBranch(), like prefs.getBranch("accessibility.").
            var defaultBranch = prefService.getDefaultBranch(this.prefDomain+"."); //

            var type = this.getPreferenceTypeByExample(typeof(value));
            if (this.setPreference(name, value, type, defaultBranch))
                return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options
    // TODO support per context options eg break on error

    togglePref: function(name)
    {
        var value = this.getPref(this.prefDomain, name);
        this.setPref(this.prefDomain, name, !value);
    },

    get: function(name)
    {
        return Options.getPref(this.prefDomain, name);
    },

    getPref: function(prefDomain, name)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);

        var value;
        if (type == nsIPrefBranch.PREF_STRING)
            value = prefs.getCharPref(prefName);
        else if (type == nsIPrefBranch.PREF_INT)
            value = prefs.getIntPref(prefName);
        else if (type == nsIPrefBranch.PREF_BOOL)
            value = prefs.getBoolPref(prefName);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.getPref "+prefName+" has type "+
                this.getPreferenceTypeName(type)+" and value "+value);

        return value;
    },

    set: function(name, value)
    {
        Options.setPref(Options.prefDomain, name, value);
    },

    /**
     * Set a preference value.
     *
     * @param prefDomain, e.g. "extensions.httpmonitor"
     * @param name Name of the preference (the part after prfDomain without dot)
     * @param value New value for the preference.
     * @param prefType optional pref type useful when adding a new preference.
     */
    setPref: function(prefDomain, name, value, prefType)
    {
        var prefName = prefDomain + "." + name;

        var type = this.getPreferenceTypeByExample((prefType ? prefType : typeof(value)));
        if (!this.setPreference(prefName, value, type, prefs))
            return;

        setTimeout(function delaySavePrefs()
        {
            try
            {
                if (FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("options.delaySavePrefs type="+type+" name="+prefName+
                        " value="+value);

                prefs.savePrefFile(null);
            }
            catch (e)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("options.delaySavePrefs; EXCEPTION type="+type+
                        " name="+prefName+ " value="+value+": " + e, e);
            }
        });

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.setPref type="+type+" name="+prefName+" value="+value);
    },

    setPreference: function(prefName, value, type, prefBranch)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("setPreference "+prefName, {prefName: prefName, value: value});

        if (type == nsIPrefBranch.PREF_STRING)
            prefBranch.setCharPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_INT)
            prefBranch.setIntPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_BOOL)
            prefBranch.setBoolPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_INVALID)
        {
            FBTrace.sysout("options.setPref FAILS: Invalid preference "+prefName+" with type "+
                type+", check that it is listed in defaults/prefs.js");

            return false;
        }

        return true;
    },

    getPreferenceTypeByExample: function(prefType)
    {
        if (prefType)
        {
            if (prefType === typeof("s"))
                var type = nsIPrefBranch.PREF_STRING;
            else if (prefType === typeof(1))
                var type = nsIPrefBranch.PREF_INT;
            else if (prefType === typeof (true))
                var type = nsIPrefBranch.PREF_BOOL;
            else
                var type = nsIPrefBranch.PREF_INVALID;
        }
        else
        {
            var type = prefs.getPrefType(prefName);
        }

        return type;
    },

    getPreferenceTypeName: function(prefType)
    {
        if (prefType == Ci.nsIPrefBranch.PREF_STRING)
            return "string";
        else if (prefType == Ci.nsIPrefBranch.PREF_INT)
            return "int";
        else if (prefType == Ci.nsIPrefBranch.PREF_BOOL)
            return "boolean";
    },

    clearPref: function(prefDomain, name)
    {
        var prefName = prefDomain + "." + name;
        if (prefs.prefHasUserValue(prefName))
            prefs.clearUserPref(prefName);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Default Prefs

    registerDefaultPrefs: function(prefMap, domain)
    {
        prefMap = prefMap || this.defaultPrefs;
        domain = domain || this.prefDomain;

        var pb = Services.prefs.getDefaultBranch(domain + ".");

        for (var name in prefMap)
        {
            var value = prefMap[name];
            var type = prefTypeMap[typeof value];

            try
            {
                pb["set" + type](name, value);
            }
            catch(e)
            {
                if (e.result == 0x8000ffff)
                {
                    try
                    {
                        pb.clearUserPref(name);
                        pb["set" + type](name, value);
                    }
                    catch(e)
                    {
                        Cu.reportError("can't set default value for " + name);
                    }
                }
            }
        }
    },
};

// ********************************************************************************************* //
// Registration

return Options;

// ********************************************************************************************* //
});
