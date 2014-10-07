var util = require('util');
var fs = require('fs');
var util = require('util');

module.exports = function Logging(logFileService, master, moduleConfig) {
  var appStream;
  if(!master)
    return;

  var appStream = logFileService(moduleConfig);

  function timestamp() {
    return '[' + new Date().toISOString() + ']';
  }

  function logNotice(msg) {
    appStream.write(timestamp() + ' ' + msg + "\n");

  }
  function logError(msg) {
    appStream.write(timestamp() + ' ' + msg + "\n");
  }

  master.on('logNotice', logNotice);
  master.on('logError', logError);

  // second instance of Logging will load after reload, unbind event handlers
  master.once('reload', function() {
    master.removeListener('logNotice', logNotice);
    master.removeListener('logError', logError);
  });

  function logFunction() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[' + new Date().toISOString() + ']');
    str = util.format.apply(this, args) + "\n";
    appStream.write(str);
  }

  return {
    notice: logNotice,
    error: logError
  }
};
