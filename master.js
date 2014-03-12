var async = require('async');

var EventEmitter = require('events').EventEmitter;
var common = require('./common');
var runModules = common.runModules;
var path = require('path');

var token;
require('crypto').randomBytes(48, function(ex, buf) {
  token = buf.toString('hex');
});

// TODO: Windows support?
function exitIfEACCES(err)
{
  if(err && err.syscall == 'bind' && err.code == 'EACCES') {
    this.logError("Unable to bind to port, exiting! Hopefully we will be restarted with privileges to bind the port.");
    process.exit(1);
  }
}

function HttpMaster()
{
  var workers = this.workers = [];
  this.tlsSessionStore = {};

  // hacky way to ensure that our cluster is a locally loaded one
  // use this until https://github.com/joyent/node/pull/3367 is merged
  var oldCluster = require.cache[require.resolve('cluster')];
  delete require.cache[require.resolve('cluster')];
  var cluster = this.cluster = require('cluster');
  require.cache[require.resolve('cluster')] = oldCluster;

  this.cluster.setupMaster({
    exec: path.join(__dirname, 'worker.js'),
    args: []
  });

  
  this.autoRestartWorkers = true;

  var self = this;
  cluster.on('exit', function(worker, code, signal) {
    if(!self.autoRestartWorkers)
      return;
    self.logError("Worker " + worker.id + " failed with code " + code + "/" + signal + " ... starting replacement");
    workers[worker.id - 1] = undefined;
    var newWorker = initWorker.call(self, function() {
      self.logNotice("Worker " + newWorker.id + " started in place of worker " + worker.id);
      workers[newWorker.id - 1] = newWorker;
    });
  });

}

function initWorker(cb) {
  var self = this;
  var worker = this.cluster.fork();
  worker.sendMessage = function(type, data) {
    worker.send(JSON.stringify({
      type: type,
      data: data
    }));
  };

  worker.sendMessage('start', {
    config: this.config,
    token: this.token
  });
  worker.emitter = new EventEmitter();
  worker.on("message", function(msg) {
    var msg = JSON.parse(msg);
    process.emit('msg:' + msg.type, msg.data, worker);
    worker.emit('msg:' + msg.type, msg.data);
  });
  worker.on("listening", function(host, port) {});
  worker.once('msg:started', function() {
    cb();
  });
  worker.on('msg:exception', function(err) {
    exitIfEACCES.call(self, err);
  });

  worker.on('msg:tlsSession:set', function(msg) {
    self.tlsSessionStore[msg.id] = {
      data: msg.data,
      created: new Date()
    };
  });

  worker.on('msg:tlsSession:get', function(id) {
    var data = '';
    if(self.tlsSessionStore[id])
      data = self.tlsSessionStore[id].data;
    worker.sendMessage('session:'+id, data);
  });

  return worker;
}

HttpMaster.prototype = Object.create(EventEmitter.prototype);


HttpMaster.prototype.logNotice = function(msg) {
  this.emit('logNotice', msg);
}

HttpMaster.prototype.logError = function(msg) {
  this.emit('logError', msg);
}



HttpMaster.prototype.reload = function(config, reloadDone) {
  var self = this;
  this.config = config;
  var workers = this.workers;

  var startTime = new Date().getTime();

  if(config.workerCount != this.workerCount) {
    this.logError("Different workerCount, exiting! Hopefully we will be restarted and run with new workerCount");
    process.exit(1);
    return;
  }

  if(this.singleWorker) {
    this.singleWorker.loadConfig(config, function(err) {
      exitIfEACCES.call(self, err);
      if(!err)
        self.emit('allWorkersReloaded');
      else
        self.emit('error', err);

      self.emit('allWorkersReloaded');
      if(reloadDone)
        reloadDone(err);
    });
  }
  else {
    async.parallel(workers.filter(function(worker) {
        return !!worker;
      }) // dead workers leave undefined keys
      .map(function(worker) {
        return function(asyncCallback) {
          worker.once('msg:unbindFinished', function() {

            worker.once('msg:started', function() {
              asyncCallback();
            });
            worker.sendMessage('reload', config);
          });
          worker.sendMessage('unbind');
        };
      }), function(err) {
        if(!err)
          self.emit('allWorkersReloaded');
        else
          self.emit('error', err);
        if(reloadDone)
          reloadDone(err);
      });;
  }
};


HttpMaster.prototype.init = function(config, initDone) {
  this.config = config;
  var worker;
  var self = this;
  var workers = this.workers;

  runModules("initMaster", this, config);
  this.workerCount = config.workerCount || 0;

  if(this.workerCount === 0) {
    var singleWorker = this.singleWorker = new (require('./workerLogic'))();
    singleWorker.on('logNotice', self.logNotice.bind(this));
    singleWorker.on('logError', self.logError.bind(this));
    this.singleWorker.loadConfig(config, function(err) {
      if (err) {
        return initDone(err);
      }
      self.emit('allWorkersStarted');

      runModules("allWorkersStarted", config);
      if(initDone)
        initDone()

    });
  }
  else {
    
    while(!token); // busy wait in case we have not got it yet..
    self.token = token;

    async.times((config.workerCount), function(n, next) {
      workers.push(initWorker.call(self, function() {
        next(null);
      }));
    }, function(err) {
      if (err) {
        return initDone(err);
      }

      self.emit('allWorkersStarted');

      runModules("allWorkersStarted", config);
      if(initDone)
        initDone()
    });
  };
}

module.exports = HttpMaster;