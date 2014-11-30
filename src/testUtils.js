var net = require('net');
var async = require('async');

exports.findPort = function(fn) {
  var net = require('net')
  var tester = net.createServer();
  var port;
  tester.once('error', function (err) {
    if (err.code !== 'EADDRINUSE') return fn(err)
    exports.findPort(fn);
  })
  .once('listening', function() {
    port = tester.address().port;
    tester.once('close', function() {
      fn(null, port);
    })
    tester.close();
  })
  .listen(0);
};

exports.findPorts = function(num, cb) {
  async.times(num, function(n, cb) {
    exports.findPort(cb);
  }, function(err, port) {
    cb(err, port);
  }, cb);
}

exports.assurePortNotListening =function(port, cb) {
  var client = net.connect({
      port: port
    },
    function() {
      throw new Error('Port ' + port + ' should have been not listening');
    });
  client.once('error', function(err) {
    cb();
  });
};

exports.assurePortIsListening = function(port, cb) {
  var client = net.connect({
      port: port
    },
    function() {
      cb();
    });
  client.once('error', function(err) {
    throw new Error('Port ' + port + ' should have been listening');
  });
};
