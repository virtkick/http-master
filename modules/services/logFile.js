var fs = require('fs');
var uidNumber = require('uid-number');

module.exports = function LogFileService(config, commService, master, worker) {

  var comm = commService('logFile');

  var logFileHandlers = {};

  var user = config.user;
  var group = config.group;

  if(master) {
    var serviceFunction = function(logFile) {
      if(logFileHandlers[logFile])
        return logFileHandlers[logFile];

      var watch;
      var stream;

      function openLogFile(logFile) {
        if(logFile === 'stdout' || logFile === 'stderr') {
          stream = process[logFile];
          return stream;
        }
        stream = fs.createWriteStream(logFile, {
          'flags': 'a'
        });
        if(user || group) {
          uidNumber(user, group, function(err, userId, groupId) {
            fs.chown(logFile, userId, groupId);
          });
        }
        stream.once('open', function() {
          watch = fs.watch(logFile, function(action, filename) {
            if (action == 'rename') {
              watch.close();
              openLogFile(logFile);
            }
          });
        });
        return stream;
      }
      openLogFile(logFile);

      comm.on('write:' + logFile, function(data) {
        stream.write(data);
      });

      logFileHandlers[logFile] = {
        write: function(data) {
          stream.write(data);
        }
      };

      return logFileHandlers[logFile];
    };

    comm.on('open', serviceFunction);

    return serviceFunction;

  } else {
    return function(logFile) {
      comm.send('open', logFile);
      return {
        write: function(data) {
          comm.send('write:' + logFile, data);
        }
      }
    };
  }
};
