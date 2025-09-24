var serveStatic = require('connect-gzip-static');
var send = require('send');
var path = require('path');
var regexpHelper = require('../../src/regexpHelper');

module.exports = function StaticMiddleware() {
  return {
    requestHandler: function(req, res, next, target) {
      if (target.isWildcard) {
        // Wildcard case: resolve the pattern dynamically
        var staticPath = target.entry;
        
        // Handle wildcard substitution using regexpHelper
        if (req.match) {
          staticPath = regexpHelper(staticPath, req.match);
        }
        
        // Replace [path] with the request path (without leading slash)
        staticPath = staticPath.replace("[path]", req.url.substring(1));
        
        // Create connect-gzip-static middleware with the fully resolved path
        // This ensures gzip functionality works correctly
        var resolvedMiddleware = serveStatic(staticPath);
        
        resolvedMiddleware(req, res, function(err) {
          if(err) return next(err);
          var stream = send(req, path.join(staticPath, '404.html'), {});
          stream.on('error', next);
          stream.pipe(res);
        });
      } else {
        // Normal case: use pre-created middleware
        target.middleware(req, res, function(err) {
          if(err) return next(err);
          var stream = send(req, path.join(target.entry, '404.html'), {});
          stream.on('error', next);
          stream.pipe(res);
        });
      }
    },
    entryParser: function(entry) {
      // For wildcard paths, mark as wildcard and store pattern
      // Don't call serveStatic during initialization for wildcard paths
      if (entry.indexOf('[') !== -1) {
        return {entry: entry, isWildcard: true};
      }
      // For non-wildcard paths, pre-create middleware as before
      return {middleware: serveStatic(entry), entry: entry};
    }
  };
}
