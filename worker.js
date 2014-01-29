
var argv = {};
var config = {};
var cluster = require('cluster');

var common = require('./common');
var runModules = common.runModules;

var droppedPrivileges = false;

function logError(str) {
  if (argv.silent || config.silent)
    return;
  console.log('[' + cluster.worker.id + '] ' + str);
}
var logNotice = logError;

function dropPrivileges() {
  var strInfo;
  if (process.setgid) {
    var group = argv.group || config.group;
    if (typeof group === 'string') {
      process.setgid(group);
      strInfo = group;
    }
  }
  if (process.setuid) {
    var user = argv.user || config.user;
    if (typeof user === 'string') {
      process.setuid(user);
      if (strInfo)
        strInfo = user + ":" + strInfo;
      else
        strInfo = user;
    }
  }
  if (!droppedPrivileges && strInfo)
    logNotice("Dropped privileges to: " + strInfo);
  droppedPrivileges = true;
}


var HttpMasterWorker = require('./workerLogic');
var worker = new HttpMasterWorker();

worker.on('logNotice', logNotice);
worker.on('logError', logError);

process.sendMessage = function(type, data) {
  process.send(JSON.stringify({
    type: type,
    data: data
  }));
};

process.on('message', function(msg) {
  var msg = JSON.parse(msg);
  process.emit('msg:' + msg.type, msg.data);
});

process.on('uncaughtException', function(err) {
  logError("[Uncaught exception] " + err.stack || err.message);
  process.exit(1);
});

process.on('msg:start', function(data) {
  runModules("initWorker", data.config);
  argv = data.argv;
  worker.loadConfig(data.config, function(err) {
    if(err) {
      logError("Exitting worker due to error: " + err.toString())
      return process.exit();
    }
    process.sendMessage("started");
  });
});

process.on('msg:unbind', function() {
  logNotice('Reloading config');
  unbindAll(function() {
    process.sendMessage("unbindFinished");
  });
});
process.on('msg:reload', function(config) {
  handleConfig(config);
});



