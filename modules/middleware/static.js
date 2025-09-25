var serveStatic = require('connect-gzip-static');
var send = require('send');
var path = require('path');
var regexpHelper = require('../../src/regexpHelper');

module.exports = function StaticMiddleware() {
  return {
    requestHandler: function(req, res, next, target) {
      try {
        if (target.isWildcard) {
          // Wildcard case: resolve the pattern dynamically
          var staticPath = target.entry;
          
          // Handle wildcard substitution using regexpHelper
          if (req.match) {
            staticPath = regexpHelper(staticPath, req.match);
          }
          
          // Replace [path] with the request path (without leading slash)
          staticPath = staticPath.replace("[path]", req.url.substring(1));
          
          // For wildcard patterns, serve files directly with fs.readFile
          // to avoid complex send module mock request issues
          var fs = require('fs');
          
          fs.stat(staticPath, function(err, stats) {
            if (err) {
              if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/plain');
                return res.end('Not Found');
              }
              return next(err);
            }
            
            if (!stats.isFile()) {
              return next(); // Not a file, let next middleware handle
            }
            
            fs.readFile(staticPath, function(err, data) {
              if (err) {
                return next(err);
              }
              
              // Set appropriate headers
              res.setHeader('Content-Type', 'application/octet-stream');
              res.setHeader('Content-Length', data.length);
              res.setHeader('Last-Modified', stats.mtime.toUTCString());
              
              res.end(data);
            });
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
      } catch (err) {
        return next(err);
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
