var http = require('http');
var url = require('url');

module.exports = function(config, middleware) {
  var length = middleware.length;

  return {
    request: function(req, res) {
      var i = 0;

			req.parsedUrl = url.parse(req.url);

      function runMiddleware() {
        if (i < length) {
          middleware[i++](req, res, function(err) {
            if (err) {
              return;
            }
            runMiddleware();
          });
        }
      }
      runMiddleware();
    }
  };
};