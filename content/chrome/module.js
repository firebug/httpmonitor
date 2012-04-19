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
    "lib/array",
    "chrome/listener"
],
function(FBTrace, Css, Obj, Domplate, Options, Events, Dom, Arr, Listener) {

// ********************************************************************************************* //

/**
 * @module
 */
var Module = Obj.extend(new Listener(),
/** @lends Module */
{
    initialize: function()
    {
    },

    initializeUI: function(detachArgs)
    {
    },

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

return Module;

// ********************************************************************************************* //
});
