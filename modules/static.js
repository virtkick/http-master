var nodeStatic = require('node-static');
var DispatchTable = require('../DispatchTable');


var regexpHelper = require('../regexpHelper');

module.exports = {
  middleware: function(config) {
    if (!config.static) return;

    return new DispatchTable({
      config: config.static,
      requestHandler: function(req, res, next, target) {
        var fileServer = target.server;
        console.log(req.url);
        target = target.target;
        console.log(target);
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
        var entrySplit = entry.split(':');

        return [entryKey,  {server: new nodeStatic.Server(entrySplit[0]), target: entrySplit[1]||"[path]"}];
      },
      port: config.port
    });

  }
};