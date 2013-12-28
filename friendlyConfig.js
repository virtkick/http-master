module.exports = function(config) {
  var domains = {};

  if (!config.ports)
    config.ports = {};


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



  });


  return config;
};