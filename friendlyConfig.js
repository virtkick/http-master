var assert = require('assert');

var XRegExp = require('xregexp').XRegExp;

var extend = require('extend');

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
      path: m.path,
      group: group
    };
  }

  function parseEntry(entry) {
    function parseString(entry) {
      var m = entry.target.match(/^(?:(\w+)\s*:)?\s*(.*)$/);

      var domainInput = parseDomainInput(entry.matchDescription);

      return extend(domainInput, {
        matchDescription: entry.matchDescription,
        module: m[1] || 'proxy',
        value: m[2],
        interfaces: entry.interfaces,
        ports: entry.ports
      });
    }

    function parseNumber(entry) {
      var domainInput = parseDomainInput(entry.matchDescription);

      return extend(domainInput, {
        matchDescription: entry.matchDescription,
        module: 'proxy',
        value: entry.target,
        interfaces: entry.interfaces,
        ports: entry.ports
      });
    }

    function parseSingleEntry(entry) {
      if (typeof entry.target == 'number')
        return parseNumber(entry);
      else if (typeof entry.target == 'string') {
        return parseString(entry);
      } else {
        throw new Error('unsupported entry');
      }
    }


    var group = parseDomainInput(entry.matchDescription, entry).group;

    var subdomains = {};
    if (entry.target && entry.target.subdomains) {
      subdomains = extend(subdomains, entry.target.subdomains);
    }
    if (group.subdomains) {


      Object.keys(group.subdomains).forEach(function(key) {
        var value = group.subdomains[key];
        subdomains[key] = value.replace("[target]", entry.target);
      });
    }

    //    if(typeof subdomains[''] == 'undefined') {
    //      subdomains[''] = entry.target;
    //    }

    if (typeof entry.target == 'object') {

      return Object.keys(subdomains).map(function(key) {
        var subdomainInput = key;
        var subdomainTarget = subdomains[key];

        var matchDescription = parseDomainInput(entry.matchDescription, entry);

        return parseSingleEntry({
          target: subdomainTarget,
          matchDescription: subdomainInput + entry.matchDescription
        });
      });
    } else { // declares as simple string or port number
      if (typeof subdomains[''] == 'undefined') {
        subdomains[''] = entry.target;
      }
      return Object.keys(subdomains).map(function(key) {
        var subdomainInput = key;
        var subdomainTarget = subdomains[key];

        var matchDescription = parseDomainInput(entry.matchDescription, entry);

        return parseSingleEntry({
          target: subdomainTarget,
          matchDescription: subdomainInput + entry.matchDescription.replace(/^.*?\|\s*/, ''),
          interfaces: matchDescription.interfaces,
          ports: matchDescription.ports
        });
      });

      // return [parseSingleEntry(entry)];
    }
  }


  Object.keys(domains).forEach(function(domain) {

    var entries = parseEntry({
      matchDescription: domain,
      target: domains[domain]
    });

    if (entries.length) {
      //console.log(entries[0].matchDescription);
    }

    entries.forEach(function(entry) {
      var destination = entry.target;
      var domainInput = parseDomainInput(entry.matchDescription, entry);


      // bind to interfaces defined in group, if not defined
      //     bind to interfaces defined globally, if not defined
      //         bind to all interfaces
      var interfacesToAssign = entry.interfaces || config.interfaces || ["*"];

      // if "*" is on the list, discard other interfaces since they are redunundand
      if (interfacesToAssign.indexOf("*") != -1)
        interfacesToAssign = ["*"];


      interfacesToAssign.forEach(function(interfaceToAssign) {

        entry.ports.forEach(function(port) {
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

          //          console.log(domainInput.subdomains);

          ports[port][entry.module][domainInput.host + (domainInput.path || "")] = entry.value;
        });

      });
    });

  });


  return newConfig;
};