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

  var newConfig = {};
  if (!newConfig.ports)
    newConfig.ports = {};

  var allPorts = [];

  var ports = newConfig.ports;

  if (typeof config.http == 'boolean') {
    config.http = [80];
  }
  if (typeof config.https == 'boolean') {
    config.https = [443];
  }

  if (config.http) {
    config.http.forEach(function(portEntry) {
      allPorts.push(portEntry.port || portEntry);

      ports[portEntry.port || portEntry] = {};
      if (portEntry.port)
        delete portEntry.port;
    });
  }


  var sslConfig = {};

  if (config.https) {
    config.https.forEach(function(portEntry) {

      allPorts.push(portEntry.port || portEntry);

      ports[portEntry.port || portEntry] = {

        ssl: typeof portEntry === 'object' ? portEntry : sslConfig
      };
      if (portEntry.port)
        delete portEntry.port;
    });
  }

  var groups = config.groups || {};
  Object.keys(groups).forEach(function(groupName) {

  });


  function parseDomainInput(domain) {
    var m = domain.match(new XRegExp("^(?:(?<group>[^/ \t]*)\\s*\\|)?\\s*(?<host>.*?)(?::(?<port>\\d+))?(?<path>\\/.*)?$"));

    var group = groups[m.group || ""] || {};

    return {
      ports: m.port ? [m.port] : (group.ports ? group.ports : allPorts),
      interfaces: group.interfaces,
      host: m.host,
      path: m.path
    };
  }

  function parseEntry(entry) {
    function parseString(entry) {
      var m = entry.target.match(/^(?:(\w+)\s*:)?\s*(.*)$/);
      return {
        matchDescription: entry.matchDescription,
        module: m[1] || 'proxy',
        value: m[2]
      };
    }
    function parseNumber(entry) {
      return {
        matchDescription: entry.matchDescription,
        module: 'proxy',
        value: entry.target
      };
    }
    function parseSingleEntry(entry) {
      if (typeof entry.target == 'number')
        return parseNumber(entry);
      else if (typeof entry.target == 'string') {
        return parseString(entry);
      }
      else
        throw new Error('unsupported entry');
    }

    if(typeof entry.target == 'object') {
      
      return Object.keys(entry.target.subdomains).map(function(entryKey) {
        var subdomainInput = entryKey;
        var subdomainTarget = entry.target.subdomains[entryKey];
        return parseSingleEntry({target: subdomainTarget, matchDescription: subdomainInput + entry.matchDescription});
      });
    }
    else { // declares as simple string or port number

      
      return [parseSingleEntry(entry)];
    }
  }


  Object.keys(domains).forEach(function(domain) {

    var entries = parseEntry({matchDescription: domain, target: domains[domain]});


    entries.forEach(function(entry) {
      var destination = entry.target;
      var domainInput = parseDomainInput(entry.matchDescription);

      // bind to interfaces defined in group, if not defined
      //     bind to interfaces defined globally, if not defined
      //         bind to all interfaces
      var interfacesToAssign = domainInput.interfaces || config.interfaces || ["*"];

      // if "*" is on the list, discard other interfaces since they are redunundand
      if (interfacesToAssign.indexOf("*") != -1)
        interfacesToAssign = ["*"];

      interfacesToAssign.forEach(function(interfaceToAssign) {

        domainInput.ports.forEach(function(port) {
          if (interfaceToAssign && interfaceToAssign != "*") {
            if (interfaceToAssign.match(/:/)) // ipv6
              port = "[" + interfaceToAssign + "]:" + port;
            else
              port = interfaceToAssign + ":" + port;
          }

          if (!ports[port])
            ports[port] = {};

          if (!ports[port][entry.module])
            ports[port][entry.module] = {};

          ports[port][entry.module][domainInput.host + (domainInput.path || "")] = entry.value;
        });

      });
    });

  });


  return newConfig;
};