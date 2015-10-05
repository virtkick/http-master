var config = {};
var cluster = require('cluster');
var util = require('util');

var droppedPrivileges = false;

process.title = 'http-master-worker#' + cluster.worker.id;

function logError(str) {
  console.log('[' + cluster.worker.id + '] ' + str);
}
var logNotice = logError;

console.log = function() {
  process.sendMessage("logNotice", util.format.apply(this, arguments));
};
console.error = function() {
  process.sendMessage("logError", util.format.apply(this, arguments));
};

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
        cb(null, data.length ? new Buffer(data, 'base64') : null, null);
      });
      process.sendMessage('tlsSession:get', id.toString('base64'));
    },
    set: function(id, data, cb) {
      process.sendMessage('tlsSession:set', {
        id: id.toString('base64'),
        data: data.toString('base64')
      });
      if (cb)
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

worker.sendMessage = process.sendMessage;

worker.on('loadService', function(service) {
  process.sendMessage('masterLoadService', service);
});

var JSONfn = require('jsonfn').JSONfn;

process.on('message', function(msg) {
  msg = JSONfn.parse(msg);
  process.emit('msg', {
    type: msg.type,
    data: msg.data
  });
  process.emit('msg:' + msg.type, msg.data);
});

process.on('uncaughtException', function(err) {
  logError("[Uncaught exception] " + err.stack || err.message);
  process.exit(1);
});

process.on('msg:start', function(data) {
  config = data.config;
  process.emit('initWorker');

  dropPrivileges();
  worker.token = data.token;
  worker.loadConfig(data.config, function(err) {
    // if (err) {
    //   process.sendMessage('exception', err);
    //   logError("Exitting worker due to error: " + err.toString());
    //   return process.exit();
    // }
    process.sendMessage("started", err);
  });
});

process.on('msg:unbind', function() {
  logNotice('Reloading config');
  worker.unbindAll(function() {
    process.sendMessage("unbindFinished");
  });
});

process.on('msg', function(data) {
  if (worker.handleMessage)
    worker.handleMessage(data);
});

var originalLog = console.log;
var originalError = console.error;

process.on('msg:reload', function(config) {
  if (config.silent) {
    console.log = function(msg) {};
    console.error = function(msg) {};
  } else {
    console.log = originalLog;
    console.error = originalError;
  }

  worker.loadConfig(config, function(err) {
    // if (err) {
    //   process.sendMessage('exception', err);
    //   logError("Exitting worker due to error: " + err.toString());
    //   return process.exit();
    // }
    process.sendMessage("started", err);
  });
});

process.on('msg:unregister', function() {
  process.removeAllListeners();
});

process.on('SIGINT', function() {});

if(global.gc) { // if gc is exposed then utilize it
  setInterval(function() {
    global.gc();
  }, 30000);
}