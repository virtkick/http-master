var WebSocketServer = require('ws').Server;
var EventEmitter = require('events').EventEmitter;

var net = require('net');

module.exports = function Websockify() {
  return {
    requestHandler: function(req, res, next, parsedEntry) {
      if(req.upgrade) {
        var socket = new net.Socket();

        socket.connect(parseInt(parsedEntry.port), parsedEntry.host || 'localhost',  function() {
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
            socket.on('end', function() {
              client.close();
            });
            socket.on('error', function() {
              socket.end();
              client.close();
            });

            client.on('message', function(msg) {
              if(client.protocol === 'base64')
                socket.write(new Buffer(msg, 'base64'));
              else
                socket.write(msg, 'binary');
            });
            client.on('close', function(code, reason) {
              socket.end();
            });
            client.on('error', function(err) {
              socket.end();
            });
          });
        });
      }
      next();
    },
    entryParser: function(entry) {
      var splitEntry = entry.split(/:/);
      return {
        wsServer: new WebSocketServer({
          server: new EventEmitter() // fake server for web socket server
        }),
        host: splitEntry.length > 1?splitEntry[0]:null,
        port: splitEntry.length > 1?splitEntry[1]:splitEntry[0],
      };
    }
  };
};