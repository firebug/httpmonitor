/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Dryice Build File

var copy = require("dryice").copy;
var fs = require("fs");
var os = require("os");
var spawn = require("child_process").spawn;
var shell = require("shelljs");

// ********************************************************************************************* //
// Command Line Arguments

var args = process.argv;
var autoInstall = (args.length == 3 && args[2] === "install")

// ********************************************************************************************* //
// Clean Up

// Helper for the target release directory.
var release = __dirname + "/release";

// Remove target release directory (if there is one left from the last time)
shell.rm("-rf", "release");

// ********************************************************************************************* //
// Initial File Copy

// Create target content directory.
copy.mkdirSync(release + "/content", 0755);

// Copy all html, XUL and JS files into the target dir.
copy({
    source: {
        root: __dirname + "/content",
        include: [/.*\.html$/, /.*\.xul$/, /.*\.js$/]
    },
    dest: release + "/content"
});

// Copy Dryice mini-loader.
copy({
    source: [ copy.getMiniRequire() ],
    dest: release + "/content/loader.js"
});

// ********************************************************************************************* //
// Setup Common JS

// Common JS project dependency tracking.
var project = copy.createCommonJsProject({
    roots: [ __dirname + "/content" ]
});

// Munge define lines to add module names
function moduleDefines(input, source)
{
    input = (typeof input !== "string") ? input.toString() : input;

    var deps = source.deps ? Object.keys(source.deps) : [];
    deps = deps.length ? (", '" + deps.join("', '") + "'") : "";

    var module = source.isLocation ? source.path : source;
    module = module.replace(/\.js$/, "");

    return input.replace(/define\(\[/, "define('" + module + "', [");
};
moduleDefines.onRead = true;

// ********************************************************************************************* //
// Build Main Module

// Copy all modules into one big module file -> /content/main.js
// Use 'moduleDefines' filter that provides module ID for define functions
copy({
    source: [
        {
            project: project,
            require: ["httpmonitor/app/httpMonitor"]
        },
        __dirname + "/content/httpmonitor/app/main.js"
    ],
    filter: moduleDefines,
    dest: release + "/content/httpmonitor/app/main.js"
});

// Helper log of module dependencies
//console.log(project.report());

// Compress main.js file (all extension modules)
//xxxHonza: uncomment for now (the stack trace is not much useful if there is just one line.
/*copy({
    source: release + "/content/httpmonitor/app/main.js",
    filter: copy.filter.uglifyjs,
    dest: release + "/content/httpmonitor/app/main.js"
});*/

// ********************************************************************************************* //
// Copy Skin

// Create target skin dir and copy all styles and images files.
copy.mkdirSync(release + "/skin", 0755);
copy({
    source: {
        root: __dirname + "/skin",
        include: [/.*\.css$/, /.*\.gif$/, /.*\.png$/]
    },
    dest: release + "/skin"
});

// ********************************************************************************************* //
// Copy Locale

// Create target skin dir and copy all styles and images files.
copy.mkdirSync(release + "/locale", 0755);
copy({
    source: {
        root: __dirname + "/locale",
        include: [/.*\.properties$/]
    },
    dest: release + "/locale"
});

// ********************************************************************************************* //
// Copy JS Modules

// Create target 'modules' dir and copy all files.
copy.mkdirSync(release + "/modules", 0755);
copy({
    source: {
        root: __dirname + "/modules",
        include: [/.*\.js$/]
    },
    dest: release + "/modules"
});

// ********************************************************************************************* //
// Copy Installation Files

// Copy other files that are not part of the content dir.
copy({
    source: ["bootstrap.js", "chrome.manifest", "license.txt", "README.md",],
    dest: release
});

// Read version number from package.json file and update install.rdf
var packageFile = fs.readFileSync(__dirname + "/package.json", "utf8");
var version = JSON.parse(packageFile).version;
copy({
    source: ["install.rdf"],
    filter: function(data)
    {
        return data.toString().replace(/@VERSION@/, version);
    },
    dest: release
});

// ********************************************************************************************* //
// Build XPI

// Compute name of the XPI package
var xpiFileName = "httpmonitor-" + version + ".xpi";

// Create final XPI package.
var zip;
if (os.platform() === "win32")
{
    var params = "a -tzip ../" + xpiFileName + " content locale modules skin " +
        "bootstrap.js chrome.manifest install.rdf license.txt README.md";
    zip = spawn("7z.exe", params.split(" "), { cwd: release });
}
else
{
    zip = spawn("zip", [ "-r", __dirname + "/" + xpiFileName, release ]);
}

// As soon as the XPI is created (asynchronously) remove the release directory.
zip.on("exit", function()
{
    shell.rm("-rf", "release");
    console.log(xpiFileName + " is ready");

    // This feature requires 'Extension Auto-Installer' extension installed
    // on the server side. It sends the xpi to the server, which installs it
    // and automatically restarts the browser if necessary.
    // https://addons.mozilla.org/cs/firefox/addon/autoinstaller/
    // You also need 'wget' in your path.
    if (autoInstall)
    {
        var params = "--post-file=httpmonitor-0.5.0.xpi http://127.0.0.1:8888/";
        zip = spawn("wget", params.split(" "), {});

        console.log(xpiFileName + " auto installed");
    }
});

// ********************************************************************************************* //
