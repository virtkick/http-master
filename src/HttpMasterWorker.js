'use strict';
var crypto = require('crypto'),
  net = require('net'),
  http = require('http'),
  async = require('async'),
  regexpQuote = require('./DispatchTable').regexpQuote,
  tls = require('tls'),
  DI = require('./di'),
  path = require('path'),
  extend = require('extend');

var nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

var EventEmitter = require('eventemitter3');


var punycode = require('punycode');

var createCredentials;
if(tls.createSecureContext) {
  createCredentials = tls.createSecureContext;
} else {
  createCredentials = crypto.createCredentials;
}

function lazyGetTcpServer(port, host, cb) {
  var tcpServers = this.tcpServers;

  var entry = (host ? host + ':' + port : port);
  if (tcpServers[entry]) {
    cb(null, tcpServers[entry]);
  } else {
    var tcpServer = tcpServers[entry] = net.createServer();

    var handler = function(err) {
      if (err) return cb(err);
      cb(null, tcpServer);
    };
    try {
      if (host)
        tcpServer.listen(port, host, handler);
      else
        tcpServer.listen(port, handler);
      tcpServer.once('error', function(err) {
        delete tcpServers[entry];
        cb(err);
      });
    } catch (err) {
      cb(err);
    }
  }
}

function loadKeysforConfigEntry(config, callback) {
  var key;
  if (config.ssl) {
    var SNI = config.ssl.SNI;
    var SNImatchers = {};
    if (config.ssl.SNI) {
      for (key in config.ssl.SNI) {
        SNImatchers[key] = new RegExp('^' + regexpQuote(key).replace(/^\\\*\\\./g, '^([^.]+\\.)?') + '$', 'i'); // domain names are case insensitive
      }
      var sniCallback = function(hostname, cb) {
        hostname = punycode.toUnicode(hostname);
        for (var key in SNI) {
          if (hostname.match(SNImatchers[key])) {
            if (cb) // since node 0.11.5
              return cb(null, SNI[key]);
            else
              return SNI[key];
          }
        }
        if (cb)
          return cb(null);
      };
      config.ssl.SNICallback = sniCallback;
    }

    if (SNI) {
      var todo = [];
      for (key in SNI) {
        todo.push(key);
      }

      async.each(todo, function(key, sniLoaded) {
        if(config.ssl.spdy && SNI[key].spdy === false) {
          SNI[key].NPNProtocols = ['http/1.1', 'http/1.0'];
          SNI[key].ALPNProtocols = ['http/1.1', 'http/1.0'];
        }

        SNI[key].ciphers = SNI[key].ciphers || config.ssl.ciphers;
        SNI[key].honorCipherOrder = SNI[key].honorCipherOrder || config.ssl.honorCipherOrder;
        SNI[key].ecdhCurve = SNI[key].ecdhCurve || config.ssl.ecdhCurve;

        // joyent/node#7249
        if (SNI[key].honorCipherOrder) {
          SNI[key].secureOptions = require('constants').SSL_OP_CIPHER_SERVER_PREFERENCE;
        }
        if (!SNI[key].ecdhCurve) {
          SNI[key].ecdhCurve = require('tls').DEFAULT_ECDH_CURVE;
        }
        try {
          var credentials = createCredentials(SNI[key]);
          SNI[key] = credentials.context;
          sniLoaded();
        } catch (err) {
          sniLoaded(err);
        }
      }, callback);
    } else { // (!SNI)
      callback();
    }
    //    });
  } else { // (!config.ssl)
    callback();
  }
}

function handlePortEntryConfig(host, portNumber, portEntryConfig, callback) {
  var self = this;
  loadKeysforConfigEntry(portEntryConfig, function(err) {
    if (err) {
      return callback(err);
    }
    handleConfigEntryAfterLoadingKeys.call(self, host, portNumber, portEntryConfig, callback);
  });
}

function patchSslConfig(portEntrySslConfig) {
  if(nodeVersion >= 0.11) { // use fancy cipher settings only for 0.11
    if(portEntrySslConfig.honorCipherOrder !== false) {
       // prefer server ciphers over clients - prevents BEAST attack
       portEntrySslConfig.honorCipherOrder = true;
    }
    if(!portEntrySslConfig.ciphers) {
      portEntrySslConfig.ciphers = 'EECDH+ECDSA+AESGCM:EECDH+aRSA+AESGCM:EECDH+ECDSA+SHA384:EECDH+ECDSA+SHA256:EECDH+aRSA+SHA384:EECDH+aRSA+SHA256:EECDH+aRSA+AES+SHA:EECDH+aRSA+RC4:EECDH:EDH+aRSA:RC4:!aNULL:!eNULL:!LOW:!3DES:!MD5:!EXP:!PSK:!SRP:!DSS::+RC4:RC4';
      if(portEntrySslConfig.disableWeakCiphers) {
        portEntrySslConfig.ciphers += ':!RC4';
      }
    }
    else if(portEntrySslConfig.disableWeakCiphers) {
      this.logNotice('disableWeakCiphers is incompatible with pre-set cipher list');
    }
  } else if(portEntrySslConfig.disableWeakCiphers) {
    this.logNotice('disableWeakCiphers is unsupported for node 0.10');
  }  
}



function createHandlers(portNumber, portConfig) {
  var self = this;

  var di = this.di.makeChild();
  di.bindInstance('di', di);

  di.bindInstance('portConfig', portConfig);
  di.bindInstance('portNumber', portNumber);

  di.onMissing = function(name) {

    var m;
    if( (m = name.match(/(.+)Middleware$/))) {
      name = m[1];
      try {
        di.bindType(name + 'Middleware', require('../' + path.join('modules/middleware/', name)));
      } catch(err) {
        console.log(err && err.message);
        return;
      }
      return di.resolve(name + 'Middleware');
    }
  };

  var router = di.resolve('routerMiddleware');

  // allow also for specifying 80: 'http://code2flow.com:8080'
  if(typeof portConfig !== 'object' || portConfig instanceof Array) {
    portConfig = {
      router: portConfig
    };
  }

  if(!(portConfig.router instanceof Array)) {
    portConfig.router = [portConfig.router];
  }

  portConfig.router = (self.config.middleware || []).concat(portConfig.middleware || []).concat(portConfig.router);

  var reject = di.resolve('rejectMiddleware');

  var target = router.entryParser(portConfig.router);
  return {
    request: function(req, res, next) {
      router.requestHandler(req, res, next, target);
    },
    error: function(err, req, res) {
      var code = 500;
      if(!err)
        code = 503;
      reject.requestHandler(req, res, null, reject.entryParser(500));
    }
  };
}


function serverForPortConfig(host, portNumber, portConfig) {
  var self = this;
  var server;

  self.cachedServers = self.cachedServers || {};
  var key = (host? host + ':' + portNumber : portNumber);


  var sslCachedConfig = extend({}, portConfig.ssl);
  delete sslCachedConfig.SNI;

  var cached = self.cachedServers[key];
  if(cached) {
    server = self.cachedServers[key].server;
    server.removeAllListeners();
    if(JSON.stringify(sslCachedConfig) === cached.sslConfig) {
      return server;
    }
  }

  if (portConfig.ssl) {
    var baseModule = portConfig.ssl.spdy ? require('spdy') : require('https');

    patchSslConfig.call(self, portConfig.ssl);

    if(self.token) {
        portConfig.ticketKeys = self.token;
    }

    server = baseModule.createServer(portConfig.ssl);

    if (!portConfig.ssl.skipWorkerSessionResumption) {
      server.on('resumeSession', self.tlsSessionStore.get.bind(self.tlsSessionStore));
      server.on('newSession', self.tlsSessionStore.set.bind(self.tlsSessionStore));
    }
  } else {
    server = http.createServer();
  }


  self.cachedServers[key] = {
    server: server,
    sslConfig: JSON.stringify(sslCachedConfig)
  }
  return server;
}

function handleConfigEntryAfterLoadingKeys(host, portNumber, config, callback) {
  var self = this;

  var handlers = createHandlers.call(this, portNumber, config);

  var handler = require('./requestHandler')(handlers.request, handlers.error);

  var server;
  try {
    server = serverForPortConfig.call(this, host, portNumber, config);
    server.removeAllListeners('request');
    server.on('request', handler);
  } catch (err) {
    return callback(err, null);
  }

  function listeningHandler() {
    server.removeAllListeners('error'); // remove the below handler
    callback(null, server);
    server.removeListener('error', errorHandler);
  }

  function errorHandler(err) {
    server.removeAllListeners('listening'); // remove the above handler
    callback(err, server);
    server.removeListener('listening', listeningHandler);
  }

  server.once('listening', listeningHandler);
  server.once('error', errorHandler);

  server.removeAllListeners('upgrade');
  server.on('upgrade', function(req, socket, head) {
    req.upgrade = {
      socket: socket,
      head: head
    };
    handler(req, { // fake res object for log middleware to work
      socket: socket
    });
  });

  lazyGetTcpServer.call(self, portNumber, host, function(err, tcpServer) {

    if (err) return callback(err, null);

    tcpServer.removeAllListeners();
    tcpServer.on('connection', function(socket) {
      server.emit('connection', socket);
    });
    tcpServer.on('error', function(err) {
      server.emit('error', err);
    });
    tcpServer.on('close', function(err) {
      server.emit('close');
    });
    server.emit('listening');
  });
}

function handleConfig(config, configHandled) {
  var self = this;

  self.config = config;

  var errors = {};

  async.parallel(Object.keys(config.ports || {}).map(function(portEntry) {
    return function(asyncCallback) {
      var m;
      // TODO: IPV6?
      if ((m = portEntry.match(/((\S+):)?(\d+)/))) {
        var listenHost = m[2];
        var listenPortNumber = parseInt(m[3]);

        var portConfig = config.ports[portEntry];

        handlePortEntryConfig.call(self, listenHost, listenPortNumber, portConfig, function(err, server) {
          var entryString = (listenHost ? listenHost + ':' + listenPortNumber : 'port ' + listenPortNumber);
          if (err) {
            self.logError('Error while starting entry ' + entryString + ' : ' + err.toString());
            if (err.stack)
              self.logError(err.stack);
            errors[portEntry] = err;
          }
          if (server) {
            self.logNotice('Listening on port: ' + entryString);
          } else
            self.logNotice('Entry ' + entryString + ' is unusable');
          // ignore error to not crash the entire proxy
          asyncCallback(null, server);
        });
      }
    };
  }), function(err, results) {
    // if (err) {
    //   return configHandled(err);
    // } 
    self.logNotice('Start successful');

    self.servers = results.filter(function(server) {
      return !!server;
    });
    if(Object.keys(errors).length == 0) {
      configHandled(null);
    } else {
      configHandled(errors);
    }
  });
}

function unbindAll(cb) {
  this.servers.forEach(function(server) {
    server.unref();
  });
  this.servers = [];
  var self = this;
  Object.keys(this.tcpServers).forEach(function(key) {
    self.tcpServers[key].removeAllListeners();
  });
  cb();
}

function HttpMasterWorker(config) {
  config = config || {};
  this.config = config;
  var store = {};
  this.tlsSessionStore = config.tlsSessionStore || {
    get: function(id, cb) {
      id = id.toString('base64');
      cb(null, store[id], null);
    },
    set: function(id, data, cb) {
      id = id.toString('base64');
      store[id] = data;
      if (cb)
        cb();
    }
  };
  this.tcpServers = {};
  this.servers = [];
}

HttpMasterWorker.prototype = Object.create(EventEmitter.prototype);

HttpMasterWorker.prototype.logNotice = function(msg) {
  this.emit('logNotice', msg);
};

HttpMasterWorker.prototype.logError = function(msg) {
  this.emit('logError', msg);
};

HttpMasterWorker.prototype.unbindAll = function(unbindFinished) {
  unbindAll.call(this, unbindFinished);
};

HttpMasterWorker.prototype.loadConfig = function(config, configLoaded) {
  var self = this;

  var events = new EventEmitter();
  function messageHandler(msg) {
    events.emit('msg:'+msg.type, msg.data);
  }
  this.handleMessage = messageHandler;

  this.unbindAll(function() {});
  if(this.di) {
    this.emit('reload');
  }
  var di = this.di = new DI();

  di.onMissing = function(name) {
    var m;
    if( (m = name.match(/(.+)Service$/))) {
      name = m[1];
      try {
        this.bindType(name + 'Service', require(path.join(__dirname, '..', 'modules/services/', name)));
      } catch(err) {
        console.log(err && err.message);
        return;
      }
      self.emit('loadService', name);
      return this.resolve(name + 'Service');
    }
  };

  di.bindInstance('di', di);
  di.bindInstance('worker', this);

  this.once('reload', function() {
    process.removeListener('msg', messageHandler);
    events.emit('reload');
    events.removeAllListeners();
  });

  di.bindInstance('events', events);
  di.bindResolver('config', function() {
    return self.config;
  });
  di.bindInstance('master', null);
  Object.keys(config.modules || {}).forEach(function(moduleName) {
    if(!config.modules[moduleName])
      return;
    var di = self.di.makeChild();
    di.bindInstance('di', di);
    di.bindInstance('moduleConfig', config.modules[moduleName]);
    try {
      di.resolve(require(path.join(__dirname, '..', 'modules', moduleName)));
    } catch(err) {
      console.error("Error loading module:", moduleName, err);
    }
  });

  handleConfig.call(this, config, function(err) {
    self.gcServers(function() {
      if(configLoaded)
        configLoaded(err);
    });
  });
};

HttpMasterWorker.prototype.gcServers = function(gcFinished) {
  var self = this;
  var toClose = [];

  Object.keys(this.tcpServers).forEach(function(key) {
    var server = self.tcpServers[key];
    if (require('events').EventEmitter.listenerCount(server, 'connection') === 0) {
      toClose.push(server);
      delete self.tcpServers[key];
      if(self.cachedServers[key]) {
        self.cachedServers[key].server.removeAllListeners();
        delete self.cachedServers[key];  
      }      
    }
  });
  async.each(toClose, function(server, cb) {
    server.close();
    cb();
  }, gcFinished);

};

module.exports = HttpMasterWorker;