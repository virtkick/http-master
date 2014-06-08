'use strict';
var crypto = require('crypto'),
  extend = require('extend'),
  net = require('net'),
  http = require('http'),
  https = require('https'),
  async = require('async'),
  regexpQuote = require('./DispatchTable').regexpQuote,
  url = require('url'),
  tls = require('tls'),
  DI = require('./di'),
  DispatchTable = require('./DispatchTable'),
  path = require('path');

var nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1]);

var EventEmitter = require('events').EventEmitter;

var argv = {}; // will be sent by master

var common = require('./common');
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
        SNImatchers[key] = new RegExp(regexpQuote(key).replace(/^\\\*\\\./g, '^([^.]+\\.)?'), 'i'); // domain names are case insensitive
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

function handlerForMiddlewareList(middleware) {
  var i = 0;
  var length = middleware.length;

  return {
    middleware: function runMiddleware(req, res, next, target) {
      if (i < length) {
        middleware[i].middleware(req, res, function(err) {
          if (err) {
            return next(err);
          }
          i += 1;
          runMiddleware(req, res, next, middleware[i].dispatchTarget);
        }, middleware[i].dispatchTarget);
      } else {
        next();
      }
    }
  };
}

function fetchRequestAndUpgradeHandlers(portNumber, portConfigEntry, cb) {
  var self = this;
  var requestHandlers = [];
  var upgradeHandlers = [];

  var di = this.di.makeChild();
  di.bindInstance('di', di);
  di.bindInstance('portConfig', portConfigEntry);

  var moduleInstanceCache = {};
  di.onMissing = function(name) {
    try {
      di.bindType(name, require('./' + path.join('modules/router/', name)));
    } catch(err) {
      console.log(err && err.message);
      return;
    }
    return di.resolve(name);
  };

  // make an array to unify handling
  var routerEntries = portConfigEntry.router;
  if(!(routerEntries instanceof Array)) {
    routerEntries = [routerEntries];
  }

  var defaultModule = 'proxy';
  var entryRegexp = /^\s*(?:(\w+)\s*->\s*)?(.*)/;
  function parseSingleEntry(entry) {
    var m = entry.match(entryRegexp);
    var moduleName = m[1] || defaultModule;
    var entryKey = m[2];

    var t = (new Date()).getTime();
    var instance = di.resolve(moduleName);
    if(instance.entryParser) {
      // allow modules to cache arbitrary data per entry
      entry = instance.entryParser(entryKey);
    }
    return {
      middleware: instance.requestHandler,
      uprade: instance.upgradeHandler,
      dispatchTarget: entry
    };
  }

  var dispatchTables = routerEntries.map(function(entry) {
    return new DispatchTable(portNumber, {
      config: entry,
      entryParser: function(entry) {
        if(typeof entry === 'object' && entry instanceof Array) {
          return handlerForMiddlewareList(entry.map(parseSingleEntry));
        }
        return parseSingleEntry(entry);
      },
      requestHandler: function(req, res, next, target) {
//        console.log(target.middleware.toString(), target.dispatchTarget);
        console.log(target);

        target.middleware(req, res, next, target.dispatchTarget);
      }
    });
  });
  requestHandlers = dispatchTables.map(function(dispatchTable) {
    return DispatchTable.prototype.dispatchRequest.bind(dispatchTable);
  });

  cb(requestHandlers, upgradeHandlers);
}

function handleConfigEntryAfterLoadingKeys(host, portNumber, config, callback) {
  var self = this;

  fetchRequestAndUpgradeHandlers.call(this, portNumber, config, function(requestHandlers, upgradeHandlers) {

    var handler = require('./requestHandler')(config, requestHandlers);
    var server;
    try {
      if (config.ssl) {
        var baseModule = config.ssl.spdy ? require('spdy') : https;

        patchSslConfig.call(self, config.ssl);

        server = baseModule.createServer(config.ssl, handler.request);

        if (!config.ssl.skipWorkerSessionResumption) {
          server.on('resumeSession', self.tlsSessionStore.get.bind(self.tlsSessionStore));
          server.on('newSession', self.tlsSessionStore.set.bind(self.tlsSessionStore));

          if (self.token) {
            if (server._setServerData) {
              server._setServerData({
                ticketKeys: self.token
              });
            } else {
              self.logNotice('SSL/TLS ticket session resumption may not work due to missing method _setServerData, you might be using an old version of Node');
            }
          }
        }
      } else {
        server = http.createServer(handler.request);
      }
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
    server.on('upgrade', function(req, socket, head) {
      req.parsedUrl = url.parse(req.url);
      for (var i = 0; i < upgradeHandlers.length; ++i) {
        if (upgradeHandlers[i](req, socket, head)) { // ws handled
          break;
        }
      }
    });

    lazyGetTcpServer.call(self, portNumber, host, function(err, tcpServer) {

      if (err) return callback(err, server);

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
      // FIXME: this should run at every config reload

//      runModules('onServerListening', config, server);
    });
  });
}

function handleConfig(config, configHandled) {
  var self = this;
//  runModules('preprocessConfig', config);

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
    if (err) {
      return configHandled(err);
    }
    self.logNotice('Start successful');

    // TODO
    //dropPrivileges();

    self.servers = results.filter(function(server) {
      return !!server;
    });
    configHandled();
  });
}

function unbindAll(cb) {
  this.servers.forEach(function(server) {
    server.removeAllListeners();
  });
  var self = this;
  Object.keys(this.tcpServers).forEach(function(key) {
    self.tcpServers[key].removeAllListeners();
  });
  cb();
}

function HttpMasterWorker(config) {
  config = config || {};
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
  this.di = new DI();
  this.di.bindInstance('worker', this);
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

  this.unbindAll(function() {});

  handleConfig.call(this, config, function(err) {
    if (err) return configLoaded(err);
    self.gcServers(configLoaded);
  });
};

HttpMasterWorker.prototype.gcServers = function(gcFinished) {
  var self = this;
  var toClose = [];

  Object.keys(this.tcpServers).forEach(function(key) {
    var server = self.tcpServers[key];
    if (EventEmitter.listenerCount(server, 'connection') === 0) {
      toClose.push(server);
      delete self.tcpServers[key];
    }
  });
  async.each(toClose, function(server, cb) {
    server.close();
    cb();
  }, gcFinished);

};

module.exports = HttpMasterWorker;