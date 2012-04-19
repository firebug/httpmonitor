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

// ********************************************************************************************* //
// Constants

var modules = [];
var panelTypes = [];
var earlyRegPanelTypes = []; // See Firebug.registerPanelType for more info
var reps = [];
var defaultRep = null;
var defaultFuncRep = null;
var menuItemControllers = [];
var panelTypeMap = {};

// ********************************************************************************************* //

/**
 * @class Represents the main Firebug application object. An instance of this object is
 * created for each browser window (browser.xul).
 */
Firebug =
{
    modules: modules,
    panelTypes: panelTypes,
    earlyRegPanelTypes: earlyRegPanelTypes,
    uiListeners: [],
    reps: reps,

    // Custom stylesheets registered by extensions.
    stylesheets: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    registerModule: function()
    {
        modules.push.apply(modules, arguments);

        // Fire the initialize event for modules that are registered later.
        if (Firebug.isInitialized)
            Events.dispatch(arguments, "initialize", []);

        if (FBTrace.DBG_REGISTRATION)
        {
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerModule "+arguments[i].dispatchName);
        }
    },

    unregisterModule: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(modules, arguments[i]);

        // Fire shutdown if module was unregistered dynamically (not on Firebug shutdown).
        if (!Firebug.isShutdown)
            Events.dispatch(arguments, "shutdown", []);
    },

    registerUIListener: function()
    {
        for (var j = 0; j < arguments.length; j++)
            Firebug.uiListeners.push(arguments[j]);
    },

    unregisterUIListener: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(Firebug.uiListeners, arguments[i]);
    },

    registerPanel: function()
    {
        // In order to keep built in panels (like Console, Script...) be the first one
        // and insert all panels coming from extension at the end, catch any early registered
        // panel (i.e. before FBL.initialize is called, such as YSlow) in a temp array
        // that is appended at the end as soon as FBL.initialize is called.
        if (earlyRegPanelTypes)
            earlyRegPanelTypes.push.apply(earlyRegPanelTypes, arguments);
        else
            panelTypes.push.apply(panelTypes, arguments);

        for (var i = 0; i < arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];

        if (FBTrace.DBG_REGISTRATION)
        {
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerPanel "+arguments[i].prototype.name);
        }
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    unregisterRep: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(reps, arguments[i]);
    },

    setDefaultReps: function(funcRep, rep)
    {
        defaultRep = rep;
        defaultFuncRep = funcRep;
    },

    registerStringBundle: function(bundleURI)
    {
        Locale.registerStringBundle(bundleURI);
    },

    registerMenuItem: function(menuItemController)
    {
        FBTrace.sysout("Firebug.registerMenuItem");
        menuItemControllers.push(menuItemController);
    },

    registerTracePrefix: function(prefix, type, removePrefix, styleURI)
    {
        var listener = Firebug.TraceModule.getListenerByPrefix(prefix);
        if (listener && FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.registerTracePrefix; ERROR " +
                "there is already such prefix registered!");
            return;
        }

        listener = new TraceListener(prefix, type, removePrefix, styleURI);
        Firebug.TraceModule.addListener(listener);
    },

    unregisterTracePrefix: function(prefix)
    {
        var listener = Firebug.TraceModule.getListenerByPrefix(prefix);
        if (listener)
            Firebug.TraceModule.removeListener(listener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getPanelType: function(panelName)
    {
        if (panelTypeMap.hasOwnProperty(panelName))
            return panelTypeMap[panelName];
        else
            return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Gets an object containing the state of the panel from the last time
     * it was displayed before one or more page reloads.
     * The 'null' return here is a too-subtle signal to the panel code in bindings.xml.
     * Note that panel.context may not have a persistedState, but in addition the persisted
     * state for panel.name may be null.
     */
    getPanelState: function(panel)
    {
        var persistedState = panel.context.persistedState;
        if (!persistedState || !persistedState.panelState)
            return null;

        return persistedState.panelState[panel.name];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // URL mapping

    getObjectByURL: function(context, url)
    {
        for (var i = 0; i < modules.length; ++i)
        {
            var object = modules[i].getObjectByURL(context, url);
            if (object)
                return object;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Reps

    getRep: function(object, context)
    {
        var type = typeof(object);
        if (type == 'object' && object instanceof String)
            type = 'string';

        for (var i = 0; i < reps.length; ++i)
        {
            var rep = reps[i];
            try
            {
                if (rep.supportsObject(object, type, (context?context:Firebug.currentContext) ))
                {
                    //if (FBTrace.DBG_DOM)
                    //    FBTrace.sysout("getRep type: "+type+" object: "+object, rep);
                    return rep;
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("firebug.getRep FAILS: "+ exc, exc);
                    FBTrace.sysout("firebug.getRep reps["+i+"/"+reps.length+"]: "+
                        (typeof(reps[i])), reps[i]);
                }
            }
        }

        //if (FBTrace.DBG_DOM)
        //    FBTrace.sysout("getRep default type: "+type+" object: "+object, rep);

        return (type == "function") ? defaultFuncRep : defaultRep;
    },

    getRepObject: function(node)
    {
        var target = null;
        for (var child = node; child; child = child.parentNode)
        {
            if (Css.hasClass(child, "repTarget"))
                target = child;

            if (child.repObject)
            {
                if (!target && Css.hasClass(child, "repIgnore"))
                    break;
                else
                    return child.repObject;
            }
        }
    },

    /**
     * Takes an element from a panel document and finds the owning panel.
     */
    getElementPanel: function(element)
    {
        for (; element; element = element.parentNode)
        {
            if (element.ownerPanel)
                return element.ownerPanel;
        }
    },
};

// ********************************************************************************************* //

return Firebug;

// ********************************************************************************************* //
});
