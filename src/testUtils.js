var net = require('net');

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
