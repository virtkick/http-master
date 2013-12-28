var util = require('util');
var fs = require('fs');
var logging = false;
var util = require('util');


var appStream;


var watcher = {};

function openLogFile(logFile) {
	var stream = fs.createWriteStream(logFile, {
		'flags': 'a'
	});
	stream.on('open', function() {
		watcher[logFile] = fs.watch(logFile, function(action, filename) {
			if (action == 'rename') {
				watcher[logFile].close();
				openLogFile(logFile);
			}
		});
	});
	return stream;
}

var uidNumber = require('uid-number');

function loadAppLog(file, user, group) {
	if(appStream)
		appStream.end();
	appStream = openLogFile(file);
	if(user || group) {
		uidNumber(user, group, function(err, userId, groupId) {
			fs.chown(file, userId, groupId);
		});
	}

	console.log = function() {
	 	var args = Array.prototype.slice.call(arguments);
	 	args.unshift('[' + new Date().toISOString() + ']');
	 	str = util.format.apply(this, args) + "\n";
	 	appStream.write(str);
	}
	process.removeAllListeners('msg:appLog');
	process.on('msg:appLog', function(data) {
		appStream.write(data);
	});
}


module.exports = {
	name: 'logging',
	initMaster: function(config) {
		if (config.logging) {
			if (config.logging.appLog) {
				loadAppLog(config.logging.appLog, config.user, config.group);
			}
		}
	},
	initWorker: function(config) {
		if (config.logging) {
			logging = true;

			if (config.logging.appLog) {
				console.log = function() {
					var args = Array.prototype.slice.call(arguments);
					args.unshift('[' + new Date().toISOString() + ']');
					str = util.format.apply(this, args) + "\n";
					process.sendMessage('appLog', str);
				}
			}
		}
	},
	allWorkersStarted: function(config) {
		var logStream = process.stdout;

		if (config.logging) {

			if (config.logging.accessLog)
				logStream = openLogFile(config.logging.accessLog);
			if (config.logging.appLog) {
				loadAppLog(config.logging.appLog);
			}

		}

		process.on('msg:log', function(data) {
			var str = JSON.stringify(data) + "\n";
			logStream.write(str);
		});
	},
	priority: 10, // make sure it is run first
	middleware: function(configEntry) {
		if (logging) // middle overhead only when logging is enabled
			return function(req, res, next) {
				var startTime = (new Date().getTime());
				var origEnd = res.end;
				res.end = function() {
					var logObject = {
						timestamp: startTime,
						method: req.method,
						httpVersion: req.httpVersion,
						headers: req.headers,
						url: req.url,
						statusCode: res.statusCode,
						responseTime: (new Date().getTime()) - startTime
					};
					process.sendMessage('log', logObject);
					origEnd.apply(res);
				};

				next();
			};
	}
};