/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module Loader Implementation

var Loader = (function() {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

// ********************************************************************************************* //
// Module Loader implementation

var Loader =
{
    config: {},
    modules: {},
    currentModule: [],

    require: function(config, modules, callback)
    {
        this.config = config ? config : this.config;
        this.currentModule = [];

        var main = this.modules["main"] = {
            scope: {}
        };

        this.currentModule.push(main);
        this.define(modules, callback);
    },

    define: function(modules, callback)
    {
        var args = [];
        for (var i=0; i<modules.length; i++)
        {
            var id = modules[i];
            args.push(this.loadModule(id));
        }

        try
        {
            var module = this.currentModule[this.currentModule.length-1];
            module.exports = callback.apply(module.scope, args);
        }
        catch (err)
        {
            Cu.reportError(err);
        }
    },

    loadModule: function(moduleId)
    {
        var module = this.modules[moduleId];
        if (module)
            return module.exports;

        module = this.modules[moduleId] = {};
        module.scope = {
            define: this.define.bind(this)
        }

        try
        {
            this.currentModule.push(module);
            var moduleUrl = this.config.baseUrl + "/" + moduleId + ".js";
            Services.scriptloader.loadSubScript(moduleUrl, module.scope);
        }
        catch (err)
        {
            Cu.reportError(err);
        }
        finally
        {
            this.currentModule.pop();
        }

        // Exports (the module return value in case of AMD) is set in define function.
        return module.exports;
    }
}

// ********************************************************************************************* //

return Loader.require.bind(Loader);

// ********************************************************************************************* //
})();
