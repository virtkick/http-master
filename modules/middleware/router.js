'use strict';

var DispatchTable = require('../../src/DispatchTable');

var defaultModule = 'proxy';
var entryRegexp = /^\s*(?:(\w+)\s*(?:->|: )\s*)?(.*)/;

function handlerForMiddlewareList(middleware) {
  return {
    middleware: function(req, res, next) {
      var length = middleware.length;

      function runMiddleware(i) {
        if (i < length) {
          middleware[i].middleware(req, res, function(err) {
            if (err) {
              return next(err);
            }
            
            runMiddleware(i+1);
          }, middleware[i].dispatchTarget);
        } else {
          next();
        }
      }
      runMiddleware(0);
    },
    moduleName: 'middlewareList',
    entry: middleware
  };
}

module.exports = function RouterMiddleware(di, portConfig, portNumber) {


  function passEntryToModuleInstance(instance, entry) {
    var dispatchTarget = entry;
    if(instance.entryParser) {
      // allow modules to cache arbitrary data per entry
       dispatchTarget = instance.entryParser(entry);
    }
    return {
      middleware: instance.requestHandler,
      dispatchTarget: dispatchTarget
    };
  }

  function passEntryToModule(moduleName, entry) {
    console.log('ROUTER PARSE: Resolving middleware:', moduleName + 'Middleware', 'for entry:', entry);
    var instance = di.resolve(moduleName + 'Middleware');
    console.log('ROUTER PARSE: Instance resolved:', instance ? 'YES' : 'NO');
    var result = passEntryToModuleInstance(instance, entry);
    console.log('ROUTER PARSE: Result:', result);
    return result;
  }

  function parseSingleEntry(entry) {
    var moduleName, entryKey;
    
    if(typeof entry === 'function') {
      return passEntryToModuleInstance(di.resolve(entry), {});
    }
    let m = entry.toString().match(entryRegexp);
    var moduleName = m[1] || defaultModule;
    var entryKey = m[2];

    return passEntryToModule(moduleName, entryKey);
  }

  function parseEntry(entry) {
    if (typeof entry === 'object') {
      if(entry instanceof Array) {
        return handlerForMiddlewareList(entry.map(parseEntry));
      }
      else if(entry.$) {
        return passEntryToModule(entry.$, entry);
      }
      else {
        return passEntryToModule('router', entry);
      }
    }
    return parseSingleEntry(entry);
  }

  return {
    entryParser: function(routerEntries) {
      if (!(routerEntries instanceof Array)) {
        routerEntries = [routerEntries];
      }
      var middlewareList = routerEntries.map(function(routerEntry) {
        if(typeof routerEntry !== 'object' && typeof routerEntry !== 'undefined') {
          return parseSingleEntry(routerEntry);
        }
        var dispatchTable = new DispatchTable(portNumber, {
          config: routerEntry,
          entryParser: parseEntry,
          requestHandler: function(req, res, next, target) {
            console.log('ROUTER: Dispatching to target:', target.dispatchTarget ? target.dispatchTarget.entry : 'undefined');
            console.log('ROUTER: target.middleware type:', typeof target.middleware);
            console.log('ROUTER: target.dispatchTarget:', target.dispatchTarget);
            try {
              target.middleware(req, res, next, target.dispatchTarget);
            } catch (err) {
              console.log('ROUTER: Error calling target.middleware:', err.message);
              next(err);
            }
          }
        });
        process.emit('dispatchTable', dispatchTable.table);
        return {
          middleware: DispatchTable.prototype.dispatchRequest.bind(dispatchTable)
        }
      });

      return handlerForMiddlewareList(middlewareList);
    },
    requestHandler: function(req, res, next, target) {
      console.log('ROUTER: Dispatching to target:', target.dispatchTarget ? target.dispatchTarget.entry : 'undefined');
      target.middleware(req, res, next, target.dispatchTarget);
    }
  };
}
