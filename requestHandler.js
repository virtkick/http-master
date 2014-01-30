var http = require('http');
var url = require('url');

var punycode = require('punycode');

module.exports = function(config, middleware) {
  var length = middleware.length;

  return {
    request: function(req, res) {
      var i = 0;

			req.parsedUrl = url.parse(req.url);

			var hostSplit = req.headers.host.split(':');
			try {
				hostSplit[0] = punycode.toUnicode(hostSplit[0]);
				req.unicodeHost = hostSplit.join(":");
			} catch(err) {
				req.unicodeHost = req.headers.host;
			}

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