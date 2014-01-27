var path = require('path'),
  fs = require('fs'),
  util = require('util'),
  crypto = require('crypto'),
  extend = require('extend'),
  net = require('net'),
  http = require('http'),
  https = require('https'),
  cluster = require('cluster'),
  async = require('async');

var config = {}; // will be sent by master
var argv = {}; // will be sent by master

var servers = [];
var tcpServers = {};

var common = require('./common');
var runModules = common.runModules;

function logError(str) {
  if (argv.silent || config.silent)
    return;
  console.log('[' + cluster.worker.id + '] ' + str);
}
var logNotice = logError;

var droppedPrivileges = false;
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

function getTcpServer(port, host, cb) {
  var entry = (host ? host + ":" + port : port);
  if (tcpServers[entry]) {
    cb(null, tcpServers[entry]);
  } else {
    var tcpServer = tcpServers[entry] = net.createServer();

    function handler(err) {
      if (err) return cb(err);
      cb(null, tcpServer);
    }
    if (host)
      tcpServer.listen(port, host, handler);
    else
      tcpServer.listen(port, handler);
  }
}

function normalizeCert(cert) {
  if (!cert.match(/\n$/g)) {
    return cert + "\n";
  }
  return cert;
}

function loadKeysForContext(context, callback) {

  async.each(Object.keys(context), function(key, keyFinished) {
    // If CA certs are specified, load those too.
    if (key === "ca") {
      if (typeof context.ca == 'object') {
        for (var i = 0; i < context.ca.length; i++) {
          if (context.ca === undefined) {
            context.ca = [];
          }
          context.ca[i] = normalizeCert(fs.readFileSync(context[key][i], 'utf8'));
        }
      } else {
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
      }
      keyFinished();
    } else if (key == "cert" || key == "key") {
      
      fs.readFile(context[key], function(err, data) {
          context[key] = normalizeCert(data.toString('utf8'));
          keyFinished(err);
      });
    }
    else
      keyFinished();
  }, function() {
    callback(context);
  });
}

function loadKeysforConfigEntry(config, callback) {

  if (config.ssl) {
    var SNI = config.ssl.SNI;
    var SNImatchers = {};
    if (config.ssl.SNI) {
      for (key in config.ssl.SNI) {
        SNImatchers[key] = new RegExp("^" + key + "$", 'i'); // domain names are case insensitive
      }
      var sniCallback = function(hostname, cb) {
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

    loadKeysForContext(config.ssl, function() {
      if (SNI) {
        var todo = [];
        for (key in SNI)
          todo.push(key);
        
        async.each(todo, function(key, sniLoaded) {
          loadKeysForContext(SNI[key], function(err) {
            if(err) return sniLoaded(err);
            try {
              SNI[key] = crypto.createCredentials(SNI[key]).context;
              sniLoaded();
            } catch(err) {
              sniLoaded(err);
            }
          });
        }, callback);
      }
      else { // (!SNI)
        callback();
      }
    });
  } 
  else { // (!config.ssl)
    callback();
  }
}

function handleConfigEntry(config, callback) {
  loadKeysforConfigEntry(config, function() {
    handleConfigEntryAfterLoadingKeys(config, callback);
  });
}

function handleConfigEntryAfterLoadingKeys(config, callback) {
  //
  // Check to see if we should silence the logs
  //
  config.silent = typeof argv.silent !== 'undefined' ? argv.silent : config.silent;

  var middlewares = [];

  var requestHandlers = [];
  var upgradeHandlers = [];

  runModules(function(name, middleware) {
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
    for (var i = 0; i < upgradeHandlers.length; ++i) {
      if (upgradeHandlers[i](req, socket, head)) { // ws handled
        break;
      }
    }
  });

  getTcpServer(config.port, config.host, function(err, tcpServer) {

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

function handleConfig(config) {

  runModules('preprocessConfig', config);

  async.parallel(Object.keys(config.ports).map(function(portEntry) {

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


        handleConfigEntry(configEntry, function(err, server) {
          var entryString = (configEntry.host ? configEntry.host + ":" + configEntry.port : "port " + configEntry.port);
          if (err) {
            logError("Error while starting entry " + entryString + " : " + err.toString());
          }
          if (server) {
            logNotice("Listening on port: " + entryString);
          } else
            logNotice("Entry " + entryString + " is unusable");
          asyncCallback(err, server);
        });
      };
    };
  }), function(err, results) {
    if (err) {
      return process.exit();
    }
    logNotice("Start successful");
    dropPrivileges();
    process.sendMessage("started");
    servers = results;
  });
}







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
    handleConfig(data.config);
  });

function unbindAll(cb) {
  servers.forEach(function(server) {
    server.removeAllListeners();
  });
  cb();
}

process.on('msg:unbind', function() {
  logNotice('Reloading config');
  unbindAll(function() {
    process.sendMessage("unbindFinished");
  });
});
process.on('msg:reload', function(config) {
  handleConfig(config);
});