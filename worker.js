var config = {};
var cluster = require('cluster');

var common = require('./common');
var runModules = common.runModules;

var droppedPrivileges = false;

function logError(str) {
  if (config.silent)
    return;
  console.log('[' + cluster.worker.id + '] ' + str);
}
var logNotice = logError;

// TODO: move to common
function dropPrivileges() {
  var strInfo;
  if (process.setgid) {
    var group = config.group;
    if (typeof group === 'string') {
      process.setgid(group);
      strInfo = group;
    }
  }
  if (process.setuid) {
    var user = config.user;
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


var HttpMasterWorker = require('./HttpMasterWorker');
var worker = new HttpMasterWorker({
  tlsSessionStore: {
    get: function(id, cb) {
      process.once('msg:session:' + id.toString('base64'), function(data) {
        logNotice("Got session data " + data);
        cb(null, data.length ? new Buffer(data, 'base64') : null, null);
      });
      logNotice("Get session data " + id.toString('base64'));
      process.sendMessage('tlsSession:get', id.toString('base64'));
    },
    set: function(id, data, cb) {
      logNotice("Set session data " + id.toString('base64') + " " + data.toString('base64'));
      process.sendMessage('tlsSession:set', {
        id: id.toString('base64'),
        data: data.toString('base64')
      });
      if(cb)
        cb();
    }
  }
});

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
  config = data.config;
  runModules("initWorker", data.config);
  dropPrivileges();
  worker.token = data.token;
  worker.loadConfig(data.config, function(err) {
    if (err) {
      process.sendMessage('exception', err);
      logError("Exitting worker due to error: " + err.toString())
      return process.exit();
    }
    process.sendMessage("started");
  });
});

process.on('msg:unbind', function() {
  logNotice('Reloading config');
  worker.unbindAll(function() {
    process.sendMessage("unbindFinished");
  });
});
process.on('msg:reload', function(config) {
  worker.loadConfig(config, function(err) {
    if (err) {
      process.sendMessage('exception', err);
      logError("Exitting worker due to error: " + err.toString())
      return process.exit();
    }
    process.sendMessage("started");
  });
});

process.on('msg:unregister', function() {
  process.removeAllListeners();
});