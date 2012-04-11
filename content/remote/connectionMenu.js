/* See license.txt for terms of usage */

define([
    "lib/trace",
    "app/firebug",
    "lib/object",
    "lib/options",
    "lib/events",
    "remote/connection",
],
function(FBTrace, Firebug, Obj, Options, Events, Connection) {

// ********************************************************************************************* //
// Globals

// Server settings
var host;
var port;

// ********************************************************************************************* //
// Module

/**
 * @module This object represent a popu menu that is responsible for Connect and
 * disconnect to/from remote browser.
 */
var ConnectionMenu = Obj.extend(Firebug.Module,
/** @lends ConnectionMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; RemoteNetModule.initialize");

        // Server settings
        host = Options.get("serverHost");
        port = Options.get("serverPort");

        this.updateUI();

        var onConnect = Obj.bind(this.onConnect, this);
        var onDisconnect = Obj.bind(this.onDisconnect, this);

        // Create connection and connect by default.
        this.connection = new Connection(onConnect, onDisconnect);
        this.connect();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Server Connection

    isConnected: function()
    {
        return (this.connection && this.connection.isConnected());
    },

    getConnection: function()
    {
        return this.connection;
    },

    connect: function()
    {
        if (this.isConnected())
        {
            if (FBTrace.DBG_REMOTEBUG)
                FBTrace.sysout("remotebug; Already connected!");
            return;
        }

        if (FBTrace.DBG_REMOTEBUG)
            FBTrace.sysout("remotebug; Connecting to " + host + ":" + port + " ...");

        try
        {
            this.connection.open(host, port);
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
        var menu = Firebug.chrome.$("httpMonitorConnectionMenu");
        var isConnected = this.isConnected();

        var label = "Connect Me ";
        if (isConnected)
            label = host + ":" + port + " ";

        menu.setAttribute("label", label + " ");
    },

    onShowing: function(popup)
    {
        var isConnected = this.isConnected();

        var connectItem = Firebug.chrome.$("cmd_httpMonitorConnect");
        var disconnectItem = Firebug.chrome.$("cmd_httpMonitorDisconnect");

        connectItem.setAttribute("disabled", isConnected ? "true" : "false");
        connectItem.setAttribute("label", "Connect to: " + host + ":" + port);

        disconnectItem.setAttribute("disabled", isConnected ? "false" : "true");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(ConnectionMenu);

return ConnectionMenu;

// ********************************************************************************************* //
});
