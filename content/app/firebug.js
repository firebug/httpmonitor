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

    stringCropLength: 50,

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

        // If Firebug is not initialized yet the UI will be updated automatically soon.
        if (!this.isInitialized)
            return;

        Firebug.chrome.syncMainPanels();
        Firebug.chrome.syncSidePanels();
    },

    unregisterPanel: function(panelType)
    {
        var panelName = panelType ? panelType.prototype.name : null;

        if (FBTrace.DBG_REGISTRATION)
        {
            FBTrace.sysout("firebug.unregisterPanel: " +
                (panelName ? panelName : "Undefined panelType"));
        }

        // Remove all instance of the panel.
        Firebug.connection.eachContext(function (context)
        {
            // An empty state can be probably used at this moment since
            // we are unregistering the panel anyway.
            var state = {}; //context.browser.persistedState;
            context.removePanel(panelType, state);
        });

        // Now remove panel-type itself.
        for (var i=0; i<panelTypes.length; i++)
        {
            if (panelTypes[i] == panelType)
            {
                panelTypes.splice(i, 1);
                break;
            }
        }

        delete panelTypeMap[panelType.prototype.name];

        // We don't have to update Firebug UI if it's just closing.
        if (this.isShutdown)
            return;

        // Make sure another panel is selected if the current one is has been removed.
        var panel = this.chrome.getSelectedPanel();
        if (panel && panel.name == panelName)
            Firebug.chrome.selectPanel("html");

        // The panel tab must be removed from the UI.
        Firebug.chrome.syncMainPanels();
        Firebug.chrome.syncSidePanels();
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

    unregisterStringBundle: function(bundleURI)
    {
        // xxxHonza: TODO:
    },

    /**
     * Allows registering of custom stylesheet coming from extension. The stylesheet is then
     * used automatially thorough Firebug UI.
     * @param {Object} styleURI URI of the stylesheet.
     */
    registerStylesheet: function(styleURI)
    {
        this.stylesheets.push(styleURI);

        // Append the stylesheet into the UI if Firebug is already loaded
        if (this.isLoaded)
            Firebug.chrome.appendStylesheet(styleURI);

        if (FBTrace.DBG_REGISTRATION)
            FBTrace.sysout("registerStylesheet " + styleURI);
    },

    unregisterStylesheet: function(styleURI)
    {
        // xxxHonza: TODO
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

    shouldIgnore: function(objectChromeView)
    {
        /*if (objectChromeView)
        {
            var contentView = Wrapper.unwrapObject(objectChromeView);
            return (contentView && contentView.firebugIgnore);
        }*/
        // else don't ignore things we don't understand
    },

    setIgnored: function(objectChromeView)
    {
        /*if (objectChromeView)
        {
            var contentView = Wrapper.unwrapObject(objectChromeView);
            if (contentView)
                contentView.firebugIgnore = true;
        }*/
    },

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
     * The child node that has a repObject
     */
    getRepNode: function(node)
    {
        for (var child = node; child; child = child.parentNode)
        {
            if (child.repObject)
                return child;
        }
    },

    getElementByRepObject: function(element, object)
    {
        for (var child = element.firstChild; child; child = child.nextSibling)
        {
            if (child.repObject == object)
                return child;
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

/**
 * Support for listeners registration. This object also extended by Firebug.Module so,
 * all modules supports listening automatically. Notice that array of listeners
 * is created for each intance of a module within initialize method. Thus all derived
 * module classes must ensure that Firebug.Module.initialize method is called for the
 * super class.
 */
Firebug.Listener = function()
{
    // The array is created when the first listeners is added.
    // It can't be created here since derived objects would share
    // the same array.
    this.fbListeners = null;
}
Firebug.Listener.prototype =
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

/**
 * @module Base class for all modules. Every derived module object must be registered using
 * <code>Firebug.registerModule</code> method. There is always one instance of a module object
 * per browser window.
 */
Firebug.Module = Obj.extend(new Firebug.Listener(),
/** @lends Firebug.Module */
{
    /**
     * Called by Firebug when Firefox window is opened.
     */
    initialize: function()
    {
    },

    /**
     * Called when the UI is ready for context creation.
     * Used by chromebug; normally FrameProgressListener events trigger UI synchronization,
     * this event allows sync without progress events.
     */
    initializeUI: function(detachArgs)
    {
    },

    /**
     * Called by Firebug when Firefox window is closed.
     */
    shutdown: function()
    {
    },

    /**
     * Called when a new context is created but before the page is loaded.
     */
    initContext: function(context, persistedState)
    {
    },

    /**
     * Called when a context is destroyed. Module may store info on persistedState
     * for reloaded pages.
     */
    destroyContext: function(context, persistedState)
    {
    },

    /**
     * Called when attaching to a window (top-level or frame).
     */
    watchWindow: function(context, win)
    {
    },

    /**
     * Called when unwatching a window (top-level or frame).
     */
    unwatchWindow: function(context, win)
    {
    },

    // Called when a FF tab is create or activated (user changes FF tab)
    // Called after context is created or with context == null (to abort?)
    showContext: function(browser, context)
    {
    },

    /**
     * Called after a context's page gets DOMContentLoaded
     */
    loadedContext: function(context)
    {
    },

    /*
     * After "onSelectingPanel", a panel has been selected but is not yet visible
     * @param browser a tab's browser element
     * @param panel selectet panel OR null
     */
    showPanel: function(browser, panel)
    {
    },

    showSidePanel: function(browser, sidePanel)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateOption: function(name, value)
    {
    },

    getObjectByURL: function(context, url)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // intermodule dependency

    // caller needs module. win maybe context.window or iframe in context.window.
    // true means module is ready now, else getting ready
    isReadyElsePreparing: function(context, win)
    {
    },
});

// ********************************************************************************************* //

Firebug.Extension =
{
    acceptContext: function(win,uri)
    {
        return false;
    },

    declineContext: function(win,uri)
    {
        return false;
    }
};

// ********************************************************************************************* //

/**
 * @panel Base class for all panels. Every derived panel must define a constructor and
 * register with <code>Firebug.registerPanel</code> method. An instance of the panel
 * object is created by the framework for each browser tab where Firebug is activated.
 */
Firebug.Panel = Obj.extend(new Firebug.Listener(),
/** @lends Firebug.Panel */
{
    searchable: false,    // supports search
    editable: true,       // clicking on contents in the panel will invoke the inline editor, eg the CSS Style panel or HTML panel.
    breakable: false,     // if true, supports break-on-next (the pause button functionality)
    order: 2147483647,    // relative position of the panel (or a side panel)
    statusSeparator: "<", // the character used to separate items on the panel status (aka breadcrumbs) in the tool bar, eg ">"  in the DOM panel
    enableA11y: false,    // true if the panel wants to participate in A11y accessibility support.
    deriveA11yFrom: null, // Name of the panel that uses the same a11y logic.
    inspectable: false,   // true to support inspecting elements inside this panel

    initialize: function(context, doc)
    {
        /*if (!context.browser)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("attempt to create panel with dud context!");
            return false;
        }*/

        this.context = context;
        this.document = doc;

        this.panelNode = doc.createElement("div");
        this.panelNode.ownerPanel = this;

        Css.setClass(this.panelNode, "panelNode panelNode-" + this.name + " contextUID=" +
            context.uid);

        // Load persistent content if any.
        var persistedState = Firebug.getPanelState(this);
        if (persistedState)
        {
            this.persistContent = persistedState.persistContent;
            if (this.persistContent && persistedState.panelNode)
                this.loadPersistedContent(persistedState);
        }

        doc.body.appendChild(this.panelNode);

        // Update panel's tab in case the break-on-next (BON) is active.
        var shouldBreak = this.shouldBreakOnNext();
        //Firebug.Breakpoint.updatePanelTab(this, shouldBreak);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initialize panelNode for " + this.name);

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.destroy panelNode for " + this.name);

        if (this.panelNode)
        {
            if (this.persistContent)
                this.savePersistedContent(state);
            else
                delete state.persistContent;

            delete this.panelNode.ownerPanel;
        }

        this.destroyNode();

        // xxxHonza: not exactly sure why, but it helps when testing memory-leask.
        // Note the the selection can point to a document (in case of the HTML panel).
        // Perhaps it breaks a cycle (page -> firebug -> page)?
        delete this.selection;
        delete this.panelBrowser;
    },

    savePersistedContent: function(state)
    {
        state.panelNode = this.panelNode;
        state.persistContent = this.persistContent;
    },

    loadPersistedContent: function(persistedState)
    {
        // move the nodes from the persistedState to the panel
        while (persistedState.panelNode.firstChild)
            this.panelNode.appendChild(persistedState.panelNode.firstChild);

        Dom.scrollToBottom(this.panelNode);
    },

    // called when a panel in one XUL window is about to disappear to later reappear
    // another XUL window.
    detach: function(oldChrome, newChrome)
    {
    },

    // this is how a panel in one window reappears in another window; lazy called
    reattach: function(doc)
    {
        this.document = doc;

        if (this.panelNode)
        {
            this.panelNode = doc.adoptNode(this.panelNode, true);
            this.panelNode.ownerPanel = this;
            doc.body.appendChild(this.panelNode);
        }
    },

    // Called at the end of module.initialize; addEventListener-s here
    initializeNode: function(panelNode)
    {
        Events.dispatch(this.fbListeners, "onInitializeNode", [this]);
    },

    // removeEventListener-s here.
    destroyNode: function()
    {
        Events.dispatch(this.fbListeners, "onDestroyNode", [this]);
    },

    show: function(state)  // persistedPanelState plus non-persisted hide() values
    {
    },

    hide: function(state)  // store info on state for next show.
    {
    },

    watchWindow: function(context, win)
    {
    },

    unwatchWindow: function(context, win)
    {
    },

    updateOption: function(name, value)
    {
    },

    /**
     * Called after chrome.applyTextSize
     * @param zoom: ratio of current size to normal size, eg 1.5
     */
    onTextSizeChange: function(zoom)
    {

    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar

    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            Dom.collapse(buttons, !show);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Panel showToolbarButtons FAILS "+exc, exc);
        }
    },

    onGetPanelToolbarButtons: function(panel, items)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns a number indicating the view's ability to inspect the object.
     *
     * Zero means not supported, and higher numbers indicate specificity.
     */
    supportsObject: function(object, type)
    {
        return 0;
    },

    hasObject: function(object)  // beyond type testing, is this object selectable?
    {
        return false;
    },

    navigate: function(object)
    {
        if (!object)
            object = this.getDefaultLocation();
        if (!object)
            object = null;  // not undefined.

        // if this.location undefined, may set to null
        if (!this.location || (object != this.location))
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("navigate "+this.name+" to location "+object, object);

            this.location = object;
            this.updateLocation(object);

            Events.dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
        }
        else
        {
            if (FBTrace.DBG_PANELS)
            {
                FBTrace.sysout("navigate skipped for panel " + this.name + " when object " +
                    object + " vs this.location=" + this.location,
                    {object: object, location: this.location});
            }
        }
    },

    /**
     * The location object has been changed, the panel should update it view
     * @param object a location, must be one of getLocationList() returns
     *  if  getDefaultLocation() can return null, then updateLocation must handle it here.
     */
    updateLocation: function(object)
    {
    },

    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection();

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+
                object+((object==this.selection)?"==":"!=")+this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            Events.dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);
        }
    },

    /**
     * Firebug wants to show an object to the user and this panel has the best supportsObject()
     * result for the object. If the panel displays a container for objects of this type,
     * it should set this.selectedObject = object
     */
    updateSelection: function(object)
    {
    },

    /**
     * Redisplay the panel based on the current location and selection
     */
    refresh: function()
    {
        if (this.location)
            this.updateLocation(this.location);
        else if (this.selection)
            this.updateSelection(this.selection);
    },

    markChange: function(skipSelf)
    {
        if (this.dependents)
        {
            if (skipSelf)
            {
                for (var i = 0; i < this.dependents.length; ++i)
                {
                    var panelName = this.dependents[i];
                    if (panelName != this.name)
                        this.context.invalidatePanels(panelName);
                }
            }
            else
                this.context.invalidatePanels.apply(this.context, this.dependents);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Inspector

    /**
     * Called by the framework when the user starts inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     */
    startInspecting: function()
    {
    },

    /**
     * Called by the framework when inspecting is in progress and the user moves mouse over
     * a new page element. Inspecting must be enabled for the panel (panel.inspectable == true).
     * This method is called in a timeout to avoid performance penalties when the user moves
     * the mouse over the page elements too fast.
     * @param {Element} node The page element being inspected
     * @returns {Boolean} Returns true if the node should be selected within the panel using
     *      the default panel selection mechanism (i.e. by calling panel.select(node) method).
     */
    inspectNode: function(node)
    {
        return true;
    },

    /**
     * Called by the framework when the user stops inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     * @param {Element} node The last page element inspected
     * @param {Boolean} canceled Set to true if inspecing has been canceled
     *          by pressing the escape key.
     */
    stopInspecting: function(node, canceled)
    {
    },

    /**
     * Called by the framework when inspecting is in progress. Allows to inspect
     * only nodes that are supported by the panel. Derived panels can provide effective
     * algorithms to provide these nodes.
     * @param {Element} node Currently inspected page element.
     */
    getInspectNode: function(node)
    {
        while (node)
        {
            if (this.supportsObject(node, typeof node))
                return node;
            node = node.parentNode;
        }
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /*
     * Called by search in the case something was found.
     * This will highlight the given node for a specific timespan. There's only one node
     * highlighted at a time.
     * @param {Node} Node to highlight
     */
    highlightNode: function(node)
    {
        // Not necessary for the Net panel
        /*if (this.highlightedNode)
            Css.cancelClassTimed(this.highlightedNode, "jumpHighlight", this.context);

        this.highlightedNode = node;

        if (node)
            Css.setClassTimed(node, "jumpHighlight", this.context);*/
    },

    /*
     * Called by the framework when panel search is used.
     * This is responsible for finding and highlighting search matches.
     * @param {String} text String to search for
     * @param {Boolean} reverse Indicates, if search is reversed
     * @return true, if search matched, otherwise false
     */
    search: function(text, reverse)
    {
    },

    /**
     * Retrieves the search options that this modules supports.
     * This is used by the search UI to present the proper options.
     */
    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive")
        ];
    },

    /**
     * Navigates to the next document whose match parameter returns true.
     */
    navigateToNextDocument: function(match, reverse)
    {
        // This is an approximation of the UI that is displayed by the location
        // selector. This should be close enough, although it may be better
        // to simply generate the sorted list within the module, rather than
        // sorting within the UI.
        var self = this;
        function compare(a, b) {
            var locA = self.getObjectDescription(a);
            var locB = self.getObjectDescription(b);
            if(locA.path > locB.path)
                return 1;
            if(locA.path < locB.path)
                return -1;
            if(locA.name > locB.name)
                return 1;
            if(locA.name < locB.name)
                return -1;
            return 0;
        }
        var allLocs = this.getLocationList().sort(compare);
        for (var curPos = 0; curPos < allLocs.length && allLocs[curPos] != this.location; curPos++);

        function transformIndex(index)
        {
            if (reverse)
            {
                // For the reverse case we need to implement wrap around.
                var intermediate = curPos - index - 1;
                return (intermediate < 0 ? allLocs.length : 0) + intermediate;
            }
            else
            {
                return (curPos + index + 1) % allLocs.length;
            }
        };

        for (var next = 0; next < allLocs.length - 1; next++)
        {
            var object = allLocs[transformIndex(next)];

            if (match(object))
            {
                this.navigate(object);
                return object;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>,
    //      command:function to set <value>}
    getOptionsMenuItems: function()
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when this panel has focus.
     * See also FirebugRep for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target)
    {
        return [];
    },

    getBreakOnMenuItems: function()
    {
        return [];
    },

    getEditor: function(target, value)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getDefaultSelection: function()
    {
        return null;
    },

    browseObject: function(object)
    {
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    showInfoTip: function(infoTip, x, y)
    {

    },

    getObjectPath: function(object)
    {
        return null;
    },

    // An array of objects that can be passed to getObjectLocation.
    // The list of things a panel can show, eg sourceFiles.
    // Only shown if panel.location defined and supportsObject true
    getLocationList: function()
    {
        return null;
    },

    getDefaultLocation: function()
    {
        return null;
    },

    getObjectLocation: function(object)
    {
        return "";
    },

    // Text for the location list menu eg script panel source file list
    // return.path: group/category label, return.name: item label
    getObjectDescription: function(object)
    {
        var url = this.getObjectLocation(object);
        return Url.splitURLBase(url);
    },

    /**
     *  UI signal that a tab needs attention, eg Script panel is currently stopped on a breakpoint
     *  @param: show boolean, true turns on.
     */
    highlight: function(show)
    {
        var tab = this.getTab();
        if (!tab)
            return;

        if (show)
            tab.setAttribute("highlight", "true");
        else
            tab.removeAttribute("highlight");
    },

    getTab: function()
    {
        var chrome = Firebug.chrome;

        var tab = chrome.$("fbPanelBar2").getTab(this.name);
        if (!tab)
            tab = chrome.$("fbPanelBar1").getTab(this.name);
        return tab;
    },

    /**
     * If the panel supports source viewing, then return a SourceLink, else null
     * @param target an element from the panel under the mouse
     * @param object the realObject under the mouse
     */
    getSourceLink: function(target, object)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for Break On Next

    /**
     * Called by the framework to see if the panel currently supports BON
     */
    supportsBreakOnNext: function()
    {
        return this.breakable;  // most panels just use this flag
    },

    /**
     * Called by the framework when the user clicks on the Break On Next button.
     * @param {Boolean} armed Set to true if the Break On Next feature is
     * to be armed for action and set to false if the Break On Next should be disarmed.
     * If 'armed' is true, then the next call to shouldBreakOnNext should be |true|.
     */
    breakOnNext: function(armed)
    {
    },

    /**
     * Called when a panel is selected/displayed. The method should return true
     * if the Break On Next feature is currently armed for this panel.
     */
    shouldBreakOnNext: function()
    {
        return false;
    },

    /**
     * Returns labels for Break On Next tooltip (one for enabled and one for disabled state).
     * @param {Boolean} enabled Set to true if the Break On Next feature is
     * currently activated for this panel.
     */
    getBreakOnNextTooltip: function(enabled)
    {
        return null;
    },
});

// ********************************************************************************************* //

with (Domplate) {
Firebug.Rep = domplate(
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

    inspectObject: function(object, context)
    {
        Firebug.chrome.select(object);
    },

    browseObject: function(object, context)
    {
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

    cropMultipleLines: function(text, limit)
    {
        return Str.cropMultipleLines(text, limit);
    },

    toLowerCase: function(text)
    {
        return text ? text.toLowerCase() : text;
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }
})};

// ********************************************************************************************* //

// xxxHonza:
Firebug.chrome =
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

return Firebug;

// ********************************************************************************************* //
});
