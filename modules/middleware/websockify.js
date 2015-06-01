var regexpHelper = require('../../src/regexpHelper');
var net = require('net');
var url = require('url');

module.exports = function WebsockifyMiddleware() {
  return {
    requestHandler: function(req, res, next, parsedEntry) {
      if(req.upgrade) {
        var socket = new net.Socket();

        var target = parsedEntry.target;

        if (req.match) {
          target = regexpHelper(target, req.match);
        }
        if(target.match(/^(\d+)$/)) {
          target = 'localhost:' +  target;
        }
        var parsedTarget = url.parse('tcp://' + target);

        socket.once('error', function(err) {
          if(req.connection) {
            req.connection.end();
          }
        });
        socket.connect(parseInt(parsedTarget.port), parsedTarget.hostname || 'localhost',  function() {
          websockifyService(req, socket);
        });
      }
      next();
    },
    entryParser: function(entry) {
      return {
        target: entry
      };
    }
  };
};