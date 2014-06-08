var nodeStatic = require('node-static');
var regexpHelper = require('../regexpHelper');

module.exports = function Static() {
  return {
    requestHandler: function(req, res, next, target) {
      var fileServer = target.server;
      target = target.target;
      target = target.replace('[path]', req.url);

      req.url = regexpHelper(target, req.hostMatch, req.pathMatch);

      fileServer.serve(req, res, function(e, serveRes) {
        if (e && (e.status === 404)) { // If the file wasn't found
          var promise = fileServer.serveFile('/404.html', 404, {}, req, res);
          promise.on('error', function(err) {
            res.writeHead(500, {
              'Content-Type': 'text/plain'
            });
            res.write('');
            res.end();
          });
        }
      });
    },
    entryParser: function(entryKey, entry) {
      return {server: new nodeStatic.Server(entry.path || entry), target: entry.target || "[path]"};
    }
  };
}
