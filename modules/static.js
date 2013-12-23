var nodeStatic = require('node-static');


module.exports = {
  middleware: function(config) {
    if (!config.static) return;

    var fileServer = new nodeStatic.Server(config.path || "./public", {
      cache: config.cacheTime || 600
    });

    return function(req, res, next) {
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
    };
  }
};