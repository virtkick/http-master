var util = require('util');
var fs = require('fs');
var util = require('util');

var watcher = {};

function openLogFile(logFile, cb) {
  var stream = fs.createWriteStream(logFile, {
    'flags': 'a'
  });
  stream.on('open', function() {
    watcher[logFile] = fs.watch(logFile, function(action, filename) {
      if (action == 'rename') {
        watcher[logFile].close();
        cb(openLogFile(logFile));
      }
    });
  });
  return stream;
}

var uidNumber = require('uid-number');

module.exports = function Logging(master, moduleConfig, config) {
  var appStream;
  var logFile;
  if(!master)
    return;

  var user = config.user;
  var group = config.group;

  function logNotice(msg) {
    appStream.write('[' + new Date().toISOString() + '] ' + msg + "\n");

  }
  function logError(msg) {
    appStream.write('[' + new Date().toISOString() + '] ' + msg + "\n");
  }

  master.on('logNotice', logNotice);
  master.on('logError', logError);

  var logFile = moduleConfig;

  // unload file watches and close files since after reload we may not be running
  master.once('reload', function() {
    if(appStream) appStream.end();
    if(logFile) {
      watcher[logFile].close();
      delete watcher[logFile];
    }
    master.removeListener('logNotice', logNotice);
    master.removeListener('logError', logError);
  });


  appStream = openLogFile(logFile, function(newAppStream) {
    appStream = newAppStream;
  });
  if(user || group) {
    uidNumber(user, group, function(err, userId, groupId) {
      fs.chown(file, userId, groupId);
    });
  }

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

// module.exports = {
//   name: 'logging',
//   initMaster: function(master, config) {
//     if (config.logging) {
//       if (config.logging.appLog) {
//         loadAppLog(config.logging.appLog, config.user, config.group);
//       }
//       master.on('allWorkersStarted', function() {
//         var logStream = process.stdout;

//         if (config.logging) {
//           if (config.logging.accessLog)
//             logStream = openLogFile(config.logging.accessLog);
//           if (config.logging.appLog) {
//             loadAppLog(config.logging.appLog);
//           }
//         }

//         process.on('msg:log', function(data) {
//           var str = JSON.stringify(data) + "\n";
//           logStream.write(str);
//         });
//       });
//     }
//   },
//   initWorker: function(config) {
//     if (config.logging) {
//       logging = true;

//       if (config.logging.appLog) {
//         console.log = function() {
//           var args = Array.prototype.slice.call(arguments);
//           args.unshift('[' + new Date().toISOString() + ']');
//           str = util.format.apply(this, args) + "\n";
//           process.sendMessage('appLog', str);
//         }
//       }
//     }
//   },
//   priority: 10, // make sure it is run first
//   middleware: function(configEntry) {
//     if (logging) // middle overhead only when logging is enabled
//       return function(req, res, next) {
//         var startTime = (new Date().getTime());
//         var origEnd = res.end;
//         res.end = function() {
//           var logObject = {
//             timestamp: startTime,
//             method: req.method,
//             httpVersion: req.httpVersion,
//             headers: req.headers,
//             url: req.url,
//             statusCode: res.statusCode,
//             responseTime: (new Date().getTime()) - startTime
//           };
//           process.sendMessage('log', logObject);
//           origEnd.apply(res);
//         };

//         next();
//       };
//   }
// };