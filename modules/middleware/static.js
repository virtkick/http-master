var serveStatic = require('connect-gzip-static');
var send = require('send');
var path = require('path');

module.exports = function StaticMiddleware() {
  return {
    requestHandler: function(req, res, next, target) {
      target.middleware(req, res, function(err) {
        if(err) return next(err);
        var stream = send(req, path.join(target.entry, '404.html'), {});
        stream.on('error', next);
        stream.pipe(res);
      });
    },
    entryParser: function(entry) {
      return {middleware: serveStatic(entry), entry: entry};
    }
  };
}
