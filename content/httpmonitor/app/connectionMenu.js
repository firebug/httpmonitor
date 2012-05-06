/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/object",
    "httpmonitor/lib/options",
    "httpmonitor/lib/events",
    "httpmonitor/remote/connection",
    "httpmonitor/lib/dom",
    "httpmonitor/base/module",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Obj, Options, Events, Connection, Dom, Module, Chrome) {

// ********************************************************************************************* //
// Module

/**
 * @module This object represent a popu menu that is responsible for Connect and
 * disconnect to/from remote browser.
 */
var ConnectionMenu = Obj.extend(Module,
/** @lends ConnectionMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; RemoteNetModule.initialize");

        Options.addListener(this);

        this.updateUI();

        var onConnect = Obj.bind(this.onConnect, this);
        var onDisconnect = Obj.bind(this.onDisconnect, this);

        // Create connection and connect by default.
        this.connection = new Connection(onConnect, onDisconnect);
        this.connect();
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Options.removeListener(this);

        this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Server Connection

    isConnected: function()
    {
        return (this.connection && this.connection.isConnected());
    },

    isConnecting: function()
    {
        return (this.connection && this.connection.isConnecting());
    },

    getConnection: function()
    {
        return this.connection;
    },

    connect: function()
    {
        if (this.isConnected())
            this.disconnect();

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        // Do not connect if host or port is not specified.
        if (!host || !port)
        {
            if (FBTrace.DBG_REMOTEBUG)
            {
                FBTrace.sysout("remotebug; You need to specify host and port. Check: " +
                    "extensions.httpmonitor.serverHost and " +
                    "extensions.httpmonitor.serverPort");
            }
            return;
        }

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Connecting to " + host + ":" + port + " ...");

        try
        {
            this.connection.open(host, port);
            this.updateUI();
        }
        catch (err)
        {
            if (FBTrace.DBG_REMOTEBUG || FBTrace.DBG_ERRORS)
                FBTrace.sysout("remotebug; connect EXCEPTION " + err, err);
        }
    },

    disconnect: function()
    {
        if (!this.isConnected())
            return;

        try
        {
            this.connection.close();
        }
        catch(err)
        {
            if (FBTrace.DBG_REMOTEBUG || FBTrace.DBG_ERRORS)
                FBTrace.sysout("remotebug; disconnect EXCEPTION " + err, err);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection Hooks

    onConnect: function()
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Connected OK");

        this.updateUI();

        Events.dispatch(this.fbListeners, "onConnect");
    },

    onDisconnect: function()
    {
        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Disconnected");

        this.updateUI();

        Events.dispatch(this.fbListeners, "onDisconnect");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menu UI

    updateUI: function()
    {
        var menu = Chrome.$("httpMonitorConnectionMenu");
        var connected = this.isConnected();
        var connecting = this.isConnecting();

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        var label = "Connect Me ";
        if (connecting)
            label = "Connecting...";
        else if (connected)
            label = host + ":" + port + " ";

        menu.setAttribute("label", label + " ");
        menu.setAttribute("disabled", connecting ? "true" : "false");

        // xxxHonza: Hide the remoting feature behind a pref for now.
        // There should be UI for specifying the host and port in the future.
        Dom.collapse(menu, !host || !port);
    },

    onShowing: function(popup)
    {
        var isConnected = this.isConnected();

        var connectItem = Chrome.$("cmd_httpMonitorConnect");
        var disconnectItem = Chrome.$("cmd_httpMonitorDisconnect");

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        connectItem.setAttribute("disabled", isConnected ? "true" : "false");
        connectItem.setAttribute("label", "Connect to: " + host + ":" + port);

        disconnectItem.setAttribute("disabled", isConnected ? "false" : "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Preferences

    updateOption: function(name, value)
    {
        if (name == "serverHost" || name == "serverPort")
        {
            this.updateUI();
            this.connect();
        }
    }
});

// ********************************************************************************************* //
// Registration

Chrome.registerModule(ConnectionMenu);

return ConnectionMenu;

// ********************************************************************************************* //
});
