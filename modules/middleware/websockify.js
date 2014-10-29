var WebSocketServer = require('ws').Server;
var EventEmitter = require('events').EventEmitter;

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
          req.upgrade.connection.end();
        });
        socket.connect(parseInt(parsedTarget.port), parsedTarget.hostname || 'localhost',  function() {
          parsedEntry.wsServer.handleUpgrade(req, req.upgrade.socket, req.upgrade.head, function(client) {
            client.tcpSocket = socket;
            socket.on('data', function(data) {
              try {
                if(client.protocol === 'base64')
                  client.send(new Buffer(data).toString('base64'));
                else
                  client.send(data, {binary: true});
              } catch(e) {
                socket.end();
              }
            });
            socket.once('end', function() {
              client.close();
            });
            socket.once('error', function() {
              socket.end();
              client.close();
            });

            client.on('message', function(msg) {
              if(client.protocol === 'base64')
                socket.write(new Buffer(msg, 'base64'));
              else
                socket.write(msg, 'binary');
            });
            client.once('close', function(code, reason) {
              socket.end();
            });
            client.once('error', function(err) {
              socket.end();
            });
          });
        });
      }
      next();
    },
    entryParser: function(entry) {

      return {
        wsServer: new WebSocketServer({
          server: new EventEmitter() // fake server for web socket server
        }),
        target: entry
      };
    }
  };
};