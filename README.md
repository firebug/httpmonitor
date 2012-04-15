HTTP Monitor
============

HTTPMonitor is Firefox extension that visualizes HTTP communication between a page and
the server. Implementation of this extension is based on Firebug's Net panel.

Installation
------------
* Install the extension (doesn't require browser restart)
* Open the monitor: Top left orange button -> **Web Developer** -> **HTTP Monitor**
* Select a (browser) tab in *Select Tab* menu. This menu is located at top left corner of the HTTP Monitor window
* Refresh the tab in the browser
* Check HTTP Monitor window for all collected HTTP requests.

Remote HTTP Monitoring
----------------------
You can also watch HTTP activity remotely. In such case you just need to install this extension on both machines. Server is the browser you want to monitor and the client is displaying all results.

At the moment there is no UI for settings so be ready to use `about:config`

* Install the extension on both machines (client/server)
* Set `extensions.httpmonitor.serverMode` preference to `true` on the server side.
* Set `extensions.httpmonitor.serverHost` preference (name/IP address) on the client side (to point to your server machine).
* Run browsers on both sides. There is a new menu at the top left corner of the HTTP Monitor window. If it says *name:port* of the server - the connection has been properly established. It can also say *Connecting...*
* After successful connection, pick a remote tab in *Select Tab* menu.
* Refresh the tab in the browser.

Resources
---------
* [HTTP Monitor Remoting](http://getfirebug.com/wiki/index.php/Net_Panel_Remoting)
* [HTTP Monitor Architecture](http://getfirebug.com/wiki/index.php/Net_Panel_Architecture_Review)
* [Remote Protocol](https://wiki.mozilla.org/Remote_Debugging_Protocol)
* [Issue Tracker](https://wiki.mozilla.org/Remote_Debugging_Protocol)
