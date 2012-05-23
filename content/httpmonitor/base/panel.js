/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/css",
    "httpmonitor/lib/object",
    "httpmonitor/lib/events",
    "httpmonitor/lib/dom",
    "httpmonitor/lib/array",
    "httpmonitor/base/listener",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Css, Obj, Events, Dom, Arr, Listener, Chrome) {

// ********************************************************************************************* //
// Panel

/**
 */
var Panel = Obj.extend(new Listener(),
/** @lends Panel */
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
        var persistedState = Chrome.getPanelState(this);
        if (persistedState)
        {
            this.persistContent = persistedState.persistContent;
            if (this.persistContent && persistedState.panelNode)
                this.loadPersistedContent(persistedState);
        }

        doc.body.appendChild(this.panelNode);

        // Update panel's tab in case the break-on-next (BON) is active.
        var shouldBreak = this.shouldBreakOnNext();
        //Breakpoint.updatePanelTab(this, shouldBreak);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Panel.initialize panelNode for " + this.name);

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Panel.destroy panelNode for " + this.name);

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
        // Perhaps it breaks a cycle?
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
            var buttons = Chrome.$(buttonsId);
            Dom.collapse(buttons, !show);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Panel showToolbarButtons FAILS "+exc, exc);
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

            Events.dispatch(Chrome.uiListeners, "onPanelNavigate", [object, this]);
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
            FBTrace.sysout("Panel.select "+this.name+" forceUpdate: "+forceUpdate+" "+
                object+((object==this.selection)?"==":"!=")+this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            Events.dispatch(Chrome.uiListeners, "onObjectSelected", [object, this]);
        }
    },

    /**
     * The framework wants to show an object to the user and this panel has the best supportsObject()
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
        // xxxHonza: the 'Search' box is not available yet.
        return [
            Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive")
        ];
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
     * See also rep.js for a similar function also called by onContextMenu
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

    getPopupObject: function(target)
    {
        return Chrome.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return Chrome.getRepObject(target);
    },

    showInfoTip: function(infoTip, x, y)
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

return Panel;

// ********************************************************************************************* //
});
