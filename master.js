var async = require('async');

var EventEmitter = require('events').EventEmitter;
var common = require('./common');
var runModules = common.runModules;
var path = require('path');
var CertScanner = require('./certScanner');
var extend = require('extend');
var fs = require('fs');

var token;
require('crypto').randomBytes(48, function(ex, buf) {
  token = buf.toString('hex');
});

// TODO: Windows support?
function exitIfEACCES(err)
{
  if(err && err.syscall === 'bind' && err.code === 'EACCES') {
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
    if(!self.autoRestartWorkers) {
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
    if(self.tlsSessionStore[id]) {
      data = self.tlsSessionStore[id].data;
    }
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


function normalizeCert(cert) {
  cert = cert.toString('utf8');
  if (!cert.match(/\n$/g)) {
    return cert + "\n";
  }
  return cert;
}

function loadForCaBundle(context, callback) {
  var chain = normalizeCert(fs.readFileSync(context.ca, 'utf8'));
  chain = chain.split("\n");
  context.ca = [];
  var cert = [];
  chain.forEach(function(line) {
    if (line.length == 0)
      return;
    cert.push(line);
    if (line.match(/-END CERTIFICATE-/)) {
      context.ca.push(cert.join("\n") + "\n");
      cert = [];
    }
  });
  callback();
}

function loadForCaArray(context, callback) {
  var caArray = context.ca;

  if(context.ca.length) {
    async.parallel(context.ca.map(function(elem, i) {
      return function(cb) {
        fs.readFile(caArray[i], 'utf8', function(err, data) {
          context.ca[i] = normalizeCert(data);
          cb(err);
        });
      }
    }), callback);
  }
  else {
    callback();
  }
}

function loadKeysForContext(context, callback) {

  async.each(Object.keys(context), function(key, keyFinished) {
    // If CA certs are specified, load those too.
    if (key === "ca") {
      if (typeof context.ca === 'object') {
        loadForCaArray(context, keyFinished);
      } else {
        loadForCaBundle(context, keyFinished);
      }
    } else if (key == "cert" || key == "key") {

      fs.readFile(context[key], function(err, data) {
        if(err) return keyFinished(err);
        context[key] = normalizeCert(data.toString('utf8'));
        keyFinished();
      });
    } else
      keyFinished();
  }, function(err) {
    callback(err);
  });
}


function preprocessPortConfig(config, cb) {
  var self = this;
  if(config.ssl) {

    var loadsToDo = [];
    loadsToDo.push(config.ssl);
    if(config.ssl.SNI) {
      for(var key in config.ssl.SNI)
        loadsToDo.push(config.ssl.SNI[key]);
    }
    async.each(loadsToDo, loadKeysForContext, function(err) {
      if(!config.ssl.certDir)
        return cb(config);

      var certScanner = new CertScanner(config.ssl.certDir, {read: true, onlyWithKey: true});
      certScanner.on('notice', function(msg) {
        self.logNotice(msg);
      });
      self.logNotice("Scanning for certificates in directory: " + config.ssl.certDir);
      certScanner.scan(function(err, SNIconfig) {
        if(err)  {
          self.logError("Error processing certDir: " + err.toString());
          return cb(config);
        }
        //sslConfig = {SNI: sslConfig};
        if(config.ssl.primaryDomain) {
          config.ssl = extend(true, {}, config.ssl, SNIconfig[config.ssl.primaryDomain]);
        }
        config.ssl = extend(true, {}, config.ssl, {SNI: SNIconfig});
        certScanner.removeAllListeners();
        cb(config);
      });

    });

  }
  else {
    cb(config);
  }
}

function preprocessConfig(config, cb) {
  var self = this;
  async.each(Object.keys(config.ports), function(portKey, cb) {
    preprocessPortConfig.call(self, config.ports[portKey], function(portConfig) {
      config.ports[portKey] = portConfig;
      cb();
    });
  }, function() {

    if(config.debug === 'config')
      console.log(require('util').inspect(config, false, null));
    cb(config);
  });
}


HttpMaster.prototype.reload = function(config, reloadDone) {
  var self = this;

  function actualReload(config) {
    self.config = config;
    var workers = self.workers;


    if(config.workerCount !== self.workerCount) {
      self.logError("Different workerCount, exiting! Hopefully we will be restarted and run with new workerCount");
      process.exit(1);
      return;
    }

    if(self.singleWorker) {
      self.singleWorker.loadConfig(config, function(err) {
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
        });
    }
  }

  preprocessConfig.call(this, config, actualReload);
};


HttpMaster.prototype.init = function(config, initDone) {
  var worker;
  var self = this;
  var workers = this.workers;

  function actualInit(config) {
    self.config = config;

    runModules("initMaster", self, config);
    self.workerCount = config.workerCount || 0;

    if(self.workerCount === 0) {
      var singleWorker = self.singleWorker = new (require('./workerLogic'))();
      singleWorker.on('logNotice', self.logNotice.bind(self));
      singleWorker.on('logError', self.logError.bind(self));
      self.singleWorker.loadConfig(config, function(err) {
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
      while(!token) {} // busy wait in case we have not got it yet..
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
  preprocessConfig.call(this, config, actualInit);
}

module.exports = HttpMaster;