var async = require('async');

var EventEmitter = require('eventemitter3');
var path = require('path');
var CertScanner = require('./certScanner');
var extend = require('extend');
var loadKeysForContext = require('./keyContextLoader');

var token = require('crypto').randomBytes(64).toString('hex');
var JSONfn = require('jsonfn').JSONfn;

// TODO: Windows support?
function exitIfEACCES(err) {
  if (err && err.syscall === 'bind' && err.code === 'EACCES') {
    this.logError("Unable to bind to port, exiting! Hopefully we will be restarted with privileges to bind the port.");
    process.exit(1);
  }
}

function HttpMaster() {
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
    if (!self.autoRestartWorkers) {
      return;
    }
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
    worker.send(JSONfn.stringify({
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
    msg = JSON.parse(msg);
    process.emit('msg:' + msg.type, msg.data, worker);
    worker.emit('msg:' + msg.type, msg.data);
    worker.emit('msg', {
      type: msg.type,
      data: msg.data
    });
  });

  worker.once('msg:started', function(err) {
    cb(err);
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
    if (self.tlsSessionStore[id]) {
      data = self.tlsSessionStore[id].data;
    }
    worker.sendMessage('session:' + id, data);
  });

  return worker;
}

HttpMaster.prototype = Object.create(EventEmitter.prototype);

HttpMaster.prototype.logNotice = function(msg) {
  this.emit('logNotice', msg);
};

HttpMaster.prototype.logError = function(msg) {
  this.emit('logError', msg);
};

function preprocessPortConfig(config, cb) {
  var self = this;
  if (config.ssl) {

    var loadsToDo = [];
    loadsToDo.push(config.ssl);
    if (config.ssl.SNI) {
      for (var key in config.ssl.SNI)
        loadsToDo.push(config.ssl.SNI[key]);
    }
    async.each(loadsToDo, loadKeysForContext, function(err) {
      if (!config.ssl.certDir)
        return cb(config);

      var certScanner = new CertScanner(config.ssl.certDir, {
        read: true,
        onlyWithKey: true
      });
      certScanner.on('notice', function(msg) {
        self.logNotice(msg);
      });
      self.logNotice("Scanning for certificates in directory: " + config.ssl.certDir);
      certScanner.scan(function(err, SNIconfig) {
        if (err) {
          self.logError("Error processing certDir: " + err.toString());
          return cb(config);
        }
        //sslConfig = {SNI: sslConfig};
        if (config.ssl.primaryDomain) {
          config.ssl = extend(true, {}, config.ssl, SNIconfig[config.ssl.primaryDomain]);
        } else {
          var firstKey = Object.keys(SNIconfig)[0];
          if (firstKey) {
            self.logNotice("Primary domain not set, assuming: " + firstKey);
            config.ssl = extend(true, {}, config.ssl, SNIconfig[firstKey]);
          }
        }
        config.ssl = extend(true, {}, config.ssl, {
          SNI: SNIconfig
        });
        certScanner.removeAllListeners();
        cb(config);
      });

    });

  } else {
    cb(config);
  }
}

function preprocessConfig(config, cb) {
  var self = this;
  async.each(Object.keys(config.ports || {}), function(portKey, cb) {
    preprocessPortConfig.call(self, config.ports[portKey], function(portConfig) {
      config.ports[portKey] = portConfig;
      cb();
    });
  }, function() {

    if (config.debug === 'config')
      console.log(require('util').inspect(config, false, null));
    cb(config);
  });
}


function setupDi() {
  var self = this;
  var di = this.di = new DI();
  di.onMissing = function(name) {
    var m;
    if ((m = name.match(/(.+)Service$/))) {
      name = m[1];
      try {
        this.bindType(name + 'Service', require(path.join(__dirname, '..', 'modules', 'services', name)));
      } catch (err) {
        console.log(err && err.message);
        return;
      }
      self.emit('loadService', name);
      return this.resolve(name + 'Service');
    }
  };

  di.bindInstance('di', di);
  di.bindInstance('master', this);
  di.bindInstance('worker', null);
  di.bindInstance('events', process);

  di.bindResolver('config', function() {
    return self.config;
  });
  var config = self.config;

  config.modules = config.modules || {};

  Object.keys(config.modules).forEach(function(moduleName) {
    if (!config.modules[moduleName])
      return;
    var di = self.di.makeChild();
    di.bindInstance('di', di);
    di.bindInstance('moduleConfig', config.modules[moduleName]);
    try {
      di.resolve(require(path.join(__dirname, '..', 'modules', moduleName)));
    } catch (err) {
      console.error("Error loading module:", moduleName, err);
    }
  });
}

HttpMaster.prototype.reload = function(config, reloadDone) {
  var self = this;
  this.emit('reload');

  function actualReload(config) {
    self.config = config;
    var workers = self.workers;

    setupDi.call(self);

    if ((config.workerCount || 0) !== self.workerCount) {
      //self.logError("Different workerCount, exiting! Hopefully we will be restarted and run with new workerCount");
      var err = new Error('Got different workerCount than initialized with');
      self.emit('error', err);
      self.emit('restartIfPossible'); // http-master may exit
      if (reloadDone)
        reloadDone(err);
      return;
    }

    if (self.singleWorker) {
      self.singleWorker.loadConfig(config, function(err) {
        exitIfEACCES.call(self, err);
        if (!err)
          self.emit('allWorkersReloaded');
        else
          self.emit('error', err);

        self.emit('allWorkersReloaded');
        if (reloadDone)
          reloadDone(err);
      });
    } else {
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
        }),
        function(err) {
          if (!err)
            self.emit('allWorkersReloaded');
          else
            self.emit('error', err);
          if (reloadDone)
            reloadDone(err);
        });
    }
  }

  preprocessConfig.call(this, config, actualReload);
};

var DI = require('./di');

HttpMaster.prototype.init = function(config, initDone) {
  var self = this;
  var workers = this.workers;

  function actualInit(config) {
    self.config = config;

    setupDi.call(self);

    self.workerCount = config.workerCount || 0;
    if (self.workerCount === 0) {
      var singleWorker = self.singleWorker = new(require('./HttpMasterWorker'))();

      singleWorker.sendMessage = function(type, data) {
        process.emit('msg:' + type, data);
      };
      singleWorker.on('logNotice', self.logNotice.bind(self));
      singleWorker.on('logError', self.logError.bind(self));
      singleWorker.on('loadService', function(name) {
        self.di.resolve(name + 'Service');
      });
      self.singleWorker.loadConfig(config, function(err) {
        if (err) {
          return initDone(err);
        }
        self.emit('allWorkersStarted');

        //runModules("allWorkersStarted", config);
        if (initDone) {
          initDone();
        }
      });
    } else {
      while (!token) {} // busy wait in case we have not got it yet..
      self.token = token;

      async.times((config.workerCount), function(n, next) {
        var worker = initWorker.call(self, function(err) {
          next(err);
        });
        worker.on('msg:logNotice', self.logNotice.bind(self));
        worker.on('msg:logError', self.logError.bind(self));
        worker.on('msg:masterLoadService', function(name) {
          self.di.resolve(name + 'Service');
        });
        workers.push(worker);
      }, function(err) {
        self.emit('allWorkersStarted');

        if (initDone)
          initDone(err);
      });
    }
  }
  preprocessConfig.call(this, config, actualInit);
};

module.exports = HttpMaster;
module.exports.CertScanner = CertScanner;
module.exports.regexpHelper = require('./regexpHelper');
