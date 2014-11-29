var yaml = require('js-yaml');

/* This is sample preprocessor, modify it for your needs */
module.exports = function(argv, data, cb) {

  var oldWarn = console.warn;
  console.warn = function() {};

  var config = yaml.safeLoad(data);


  if(config.logging) {
    if(config.logging.appLog) {
      config.modules = config.modules || {};
      config.modules.appLog = config.logging.appLog;
    }
    if(config.logging.accessLog) {
      config.middleware = config.middleware || [];
      config.middleware.push(
        'log -> ' + config.logging.accessLog
      );
    }
    delete config.logging;
  }
  config.ports = config.ports || {};
  if(config.gzip) {
    config.middleware = config.middleware || [];
    config.middleware.push(
      'gzip -> 9'
    );
  }
  delete config.gzip;
  Object.keys(config.ports).forEach(function(port) {
    var portConfig = config.ports[port];
    if(portConfig.gzip) {
	config.ports[port] = ['gzip -> 9', portConfig];
    }
    delete portConfig.gzip;
    
    portConfig.router = portConfig.router || {};

    function migrateEntries(name) {
      Object.keys(portConfig[name]).forEach(function(key) {
        var portConfigEntry = portConfig[name][key];
        if(name !== 'proxy')
          portConfigEntry = name + " -> " + portConfigEntry.toString();
        if(name === 'proxy' && portConfigEntry.auth) {
    	    portConfigEntry = ['auth -> ' + portConfigEntry.auth, portConfigEntry.target];
        }
        portConfig.router[key] = portConfigEntry;
      });
    }
    delete portConfig.silent;
    if(portConfig.reject) {
      migrateEntries('reject');
      delete portConfig.reject;
    }
    if(portConfig.static) {
     migrateEntries('static');
     delete portConfig.static;
    }
    if(portConfig.redirect) {
     migrateEntries('redirect');
     delete portConfig.redirect;
    }
    if(portConfig.proxy) {
      migrateEntries('proxy');
      delete portConfig.proxy;
    }
    if(portConfig.ssl) { // make sure ssl is appended at the end
      var sslConfig = portConfig.ssl;
      delete portConfig.ssl;
      portConfig.ssl = sslConfig;
    }

  });
  console.log("Migrated old config!");
	cb(null, config);
};