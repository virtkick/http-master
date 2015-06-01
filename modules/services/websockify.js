var WebSocketServer = require('ws').Server;
var EventEmitter = require('events').EventEmitter;

module.exports = function WebsockifyService() {
  var wsServer = new WebSocketServer({
    server: new EventEmitter() // fake server for web socket server
  })
  return function(req, socket, cb) {
    wsServer.handleUpgrade(req, req.upgrade.socket, req.upgrade.head, function(client) {
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
      if(cb) {
        cb(client);
      }
    });
  };
};