var assert = require('assert');

var XRegExp = require('xregexp').XRegExp;

XRegExp.install({
  // Overrides native regex methods with fixed/extended versions that support named
  // backreferences and fix numerous cross-browser bugs
  natives: true,

  // Enables extensibility of XRegExp syntax and flags
  extensibility: true
});

module.exports = function(config) {
  var domains = config.domains || {};

  if (!config.ports)
    config.ports = {};

  var ports = config.ports;

  if (typeof config.http == 'boolean') {
    config.http = [80];
  }
  if (typeof config.https == 'boolean') {
    config.https = [443];
  }

  if (config.http) {
    config.http.forEach(function(portEntry) {
      config.ports[portEntry.port || portEntry] = {};
      if(portEntry.port)
        delete portEntry.port;
    });
  }


  var sslConfig = {};

  if (config.https) {
    config.https.forEach(function(portEntry) {


      config.ports[portEntry.port || portEntry] = {

        ssl: typeof portEntry === 'object' ? portEntry : sslConfig
      };
      if(portEntry.port)
        delete portEntry.port;
    });
  }

  Object.keys(domains).forEach(function(domain) {
    var domainEntry = domains[domain];
    
    if(typeof domainEntry == 'object') {
    }
    else { // assume it is int/string
      assert(typeof domainEntry == 'string' || typeof domainEntry == 'number', 'port num');
      var destination = domainEntry;
      var m = domain.match(new XRegExp("^(?<host>[^:]*)(?::(?<port>\\d+))?$"));

      assert(m.port, "port should be defined");

      ports[m.port][m.host] = domainEntry;


    }

  });


  return config;
};