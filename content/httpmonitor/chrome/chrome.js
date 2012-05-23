/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/array",
    "httpmonitor/lib/css",
],
function(FBTrace, Arr, Css) {

// ********************************************************************************************* //
// Chrome

/**
 * This object mediate access to the application UI (XUL document).
 */
var Chrome =
{
    modules: [],
    panelTypes: [],
    uiListeners: [],
    panelTypeMap: {},
    reps: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    registerModule: function()
    {
        this.modules.push.apply(this.modules, arguments);
    },

    registerUIListener: function()
    {
        this.uiListeners.push.apply(this.uiListeners, arguments);
    },

    unregisterUIListener: function()
    {
        for (var i=0; i<arguments.length; ++i)
            Arr.remove(this.uiListeners, arguments[i]);
    },

    registerPanel: function()
    {
        this.panelTypes.push.apply(this.panelTypes, arguments);

        for (var i=0; i<arguments.length; ++i)
            this.panelTypeMap[arguments[i].prototype.name] = arguments[i];
    },

    registerRep: function()
    {
        this.reps.push.apply(this.reps, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Reps

    getRep: function(object, context)
    {
        var type = typeof(object);
        if (type == 'object' && object instanceof String)
            type = 'string';

        for (var i = 0; i < this.reps.length; ++i)
        {
            var rep = this.reps[i];
            try
            {
                if (rep.supportsObject(object, type, (context?context:Chrome.currentContext) ))
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
                    FBTrace.sysout("getRep FAILS: "+ exc, exc);
                    FBTrace.sysout("getRep reps["+i+"/"+this.reps.length+"]: "+
                        (typeof(this.reps[i])), this.reps[i]);
                }
            }
        }

        //if (FBTrace.DBG_DOM)
        //    FBTrace.sysout("getRep default type: "+type+" object: "+object, rep);

        // xxxHonza: do we need default reps?
        //return (type == "function") ? defaultFuncRep : defaultRep;
    },

    getRepObject: function(node)
    {
        var target = null;
        for (var child = node; child; child = child.parentNode)
        {
try {
	            if (Css.hasClass(child, "repTarget"))
                target = child;

} catch (e) {
FBTrace.sysout("EXCEPTION " + e, e);
}


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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panels

    getPanelType: function(panelName)
    {
        if (this.panelTypeMap.hasOwnProperty(panelName))
            return this.panelTypeMap[panelName];
        else
            return null;
    },

    getPanelState: function(panel)
    {
        var persistedState = panel.context.persistedState;
        if (!persistedState || !persistedState.panelState)
            return null;

        return persistedState.panelState[panel.name];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI (XUL document)

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
