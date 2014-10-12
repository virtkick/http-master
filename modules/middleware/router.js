var DispatchTable = require('../../src/DispatchTable');

var defaultModule = 'proxy';
var entryRegexp = /^\s*(?:(\w+)\s*(?:->|: )\s*)?(.*)/;

function handlerForMiddlewareList(middleware) {
  console.log(middleware, middleware.length);
  return {
    middleware: function(req, res, next) {
      console.log("Middleware length", middleware.length);

      var length = middleware.length;

      function runMiddleware(i) {
        console.log(i, middleware[i]);
        if (i < length) {
          middleware[i].middleware(req, res, function(err) {
            console.log("Err", err);
            if (err) {
              return next(err);
            }
            // delete matches so that each dispatch table
            // on separate routes fills their own
            // TODO: this is probably not correct ...
            delete req.hostMatch;
            delete req.pathMatch;
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

  function passEntryToModule(moduleName, entry) {
    var instance = di.resolve(moduleName + 'Middleware');
    var dispatchTarget = entry;
    if(instance.entryParser) {
      // allow modules to cache arbitrary data per entry
       dispatchTarget = instance.entryParser(entry);
    }
    return {
      middleware: instance.requestHandler,
      dispatchTarget: dispatchTarget,
      moduleName: moduleName, // for debug
      entry: entry // for debug
    };
  }

  function parseSingleEntry(entry) {
    var m = entry.toString().match(entryRegexp);
    var moduleName = m[1] || defaultModule;
    var entryKey = m[2];

    return passEntryToModule(moduleName, entryKey);
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
          entryParser: function(entry) {
            if (typeof entry === 'object') {
              if(entry instanceof Array) {
                return handlerForMiddlewareList(entry.map(parseSingleEntry));
              }
              else {
                return passEntryToModule('router', entry);
              }
            }
            return parseSingleEntry(entry);
          },
          requestHandler: function(req, res, next, target) {
            console.log("Request handler", target.moduleName, target.entry);
            target.middleware(req, res, next, target.dispatchTarget);
          }
        });
        return {
          middleware: DispatchTable.prototype.dispatchRequest.bind(dispatchTable)
        }
      });

      return handlerForMiddlewareList(middlewareList);
    },
    requestHandler: function(req, res, next, target) {
      console.log("Target " + target);
      target.middleware(req, res, next, target.dispatchTarget);
    }
  };
}