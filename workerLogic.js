var path = require('path'),
  fs = require('fs'),
  util = require('util'),
  crypto = require('crypto'),
  tls = require('tls'),
  extend = require('extend'),
  net = require('net'),
  http = require('http'),
  https = require('https'),
  cluster = require('cluster'),
  async = require('async'),
  regexpQuote = require('./DispatchTable').regexpQuote,
  url = require('url');

var EventEmitter = require('events').EventEmitter;

var config = {}; // will be sent by master
var argv = {}; // will be sent by master

var common = require('./common');
var runModules = common.runModules;
var punycode = require('punycode');

function getTcpServer(port, host, cb) {
  var tcpServers = this.tcpServers;

  var entry = (host ? host + ":" + port : port);
  if (tcpServers[entry]) {
    cb(null, tcpServers[entry]);
  } else {
    var tcpServer = tcpServers[entry] = net.createServer();

    function handler(err) {
      if (err) return cb(err);
      cb(null, tcpServer);
    }
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

function normalizeCert(cert) {
  if (!cert.match(/\n$/g)) {
    return cert + "\n";
  }
  return cert;
}


function loadKeysforConfigEntry(config, callback) {

  if (config.ssl) {
    var SNI = config.ssl.SNI;
    var SNImatchers = {};
    if (config.ssl.SNI) {
      for (key in config.ssl.SNI) {
        SNImatchers[key] = new RegExp(regexpQuote(key).replace(/^\\\*\\\./g, '^([^.]+\\.)?'), 'i'); // domain names are case insensitive
      }
      var sniCallback = function(hostname, cb) {
        hostname = punycode.toUnicode(hostname);
        for (key in SNI) {
          if (hostname.match(SNImatchers[key])) {
            if (cb) // since node 0.11.5
              return cb(null, SNI[key])
            else
              return SNI[key];
          }
        }
        if (cb)
          return cb(null);
      }
      config.ssl.SNICallback = sniCallback;
    }

    //    loadKeysForContext(config.ssl, function(err) {
    //      if (err) return callback(err);

    if (SNI) {
      var todo = [];
      for (key in SNI)
        todo.push(key);

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

        //          loadKeysForContext(SNI[key], function(err) {
        //            if (err) return sniLoaded(err);
        try {
          var credentials;
          if(tls.createSecureContext) {
            credentials = tls.createSecureContext(SNI[key]);
          } else {
            credentials = crypto.createCredentials(SNI[key]);
          }
          SNI[key] = credentials.context;
          sniLoaded();
        } catch (err) {
          sniLoaded(err);
        }
        //          });
      }, callback);
    } else { // (!SNI)
      callback();
    }
    //    });
  } else { // (!config.ssl)
    callback();
  }
}

function handleConfigEntry(config, callback) {
  var self = this;
  loadKeysforConfigEntry(config, function(err) {
    if (err) {
      return callback(err);
    }
    handleConfigEntryAfterLoadingKeys.call(self, config, callback);
  });
}

function handleConfigEntryAfterLoadingKeys(config, callback) {
  var self = this;
  //
  // Check to see if we should silence the logs
  //
  config.silent = typeof argv.silent !== 'undefined' ? argv.silent : config.silent;

  var middlewares = [];

  var requestHandlers = [];
  var upgradeHandlers = [];

  runModules(function(name, middleware) {
    if (middleware.failedEntries) {
      Object.keys(middleware.failedEntries).forEach(function(key) {
        var failedEntry = middleware.failedEntries[key];
        self.logError('Failed starting entry ' + key + ' : ' + JSON.stringify(failedEntry.entry));
        self.logError(failedEntry.err);
      });
    }

    middlewares.push(middleware);
    if (typeof middleware == 'function')
      requestHandlers.push(middleware);
    else if (middleware.requestHandler)
      requestHandlers.push(middleware.handleRequest.bind(middleware));
    if (middleware.upgradeHandler)
      upgradeHandlers.push(middleware.handleUpgrade.bind(middleware));
  }, "middleware", config);

  var handler = require('./requestHandler')(config, requestHandlers);

  var server;
  try {
    if (config.ssl) {
      var baseModule = config.ssl.spdy ? require('spdy') : https;
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
            self.logNotice("SSL/TLS ticket session resumption may not work due to missing method _setServerData, you might be using an old version of Node");
          }
        }
      }
      // if(config.ssl.honorCipherOrder !== false) {
      //   // prefer server ciphers over clients - prevents BEAST attack
      //   config.ssl.honorCipherOrder = true;
      // }

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

  getTcpServer.call(this, config.port, config.host, function(err, tcpServer) {

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

    runModules('onServerListening', config, server);
  });
}

function handleConfig(config, configHandled) {
  var self = this;
  runModules('preprocessConfig', config);

  async.parallel(Object.keys(config.ports || {}).map(function(portEntry) {

    return function(asyncCallback) {

      var m;
      // TODO: IPV6?
      if ((m = portEntry.match(/((\S+):)?(\d+)(?:(?:\s*=>\s*)?(\S+):(\d+)?)?/))) {
        var host = m[2];
        var port = parseInt(m[3]);
        var targetHost = m[4];
        var targetPort = m[5];

        var portConfig = config.ports[portEntry];
        var configEntry = extend({
          targetHost: targetHost,
          targetPort: targetPort,
          host: host,
          port: port,
        }, portConfig);

        handleConfigEntry.call(self, configEntry, function(err, server) {
          var entryString = (configEntry.host ? configEntry.host + ":" + configEntry.port : "port " + configEntry.port);
          if (err) {
            self.logError("Error while starting entry " + entryString + " : " + err.toString());
            if (err.stack)
              self.logError(err.stack);
          }
          if (server) {
            self.logNotice("Listening on port: " + entryString);
          } else
            self.logNotice("Entry " + entryString + " is unusable");
          // ignore error to not crash the entire proxy
          asyncCallback(null, server);
        });
      };
    };
  }), function(err, results) {
    if (err) {
      return configHandled(err);
    }
    self.logNotice("Start successful");

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
}

HttpMasterWorker.prototype = Object.create(EventEmitter.prototype);

HttpMasterWorker.prototype.logNotice = function(msg) {
  this.emit('logNotice', msg);
}

HttpMasterWorker.prototype.logError = function(msg) {
  this.emit('logError', msg);
}

HttpMasterWorker.prototype.unbindAll = function(unbindFinished) {
  unbindAll.call(this, unbindFinished);
}

HttpMasterWorker.prototype.loadConfig = function(config, configLoaded) {
  var self = this;

  this.unbindAll(function() {});

  handleConfig.call(this, config, function(err) {
    if (err) return configLoaded(err);
    self.gcServers(configLoaded);
  });

}

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