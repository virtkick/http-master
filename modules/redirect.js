module.exports = {
	middleware: function(config) {
		var redirectTable = {};

		Object.keys(config.redirect).forEach(function(redirectEntry) {
			var array = redirectEntry.split(/\/(.+)?/);
			var host = array[0];
			var path = array[1];

			var target = config.redirect[redirectEntry];

			if (!target.match(/^http:\/\//) && !target.match(/^https:\/\//)) {
				target = "http://" + target;
			}
			target = target.replace('/[path]', '[path]');
			var redirectEntry = {
				path: '/' + path,
				target: target
			};

			redirectTable[host] = redirectEntry;
			redirectTable[host + ":" + config.port] = redirectEntry;
		});

		return null;
		return function(req, res, next) {
			var entry = redirectTable[req.headers.host];
			if (!entry) return next();

			if (entry.path && req.url !== entry.path) return next();

			var target = entry.target;
			target = target.replace("[path]", req.url);

			res.statusCode = 302;
			res.setHeader("Location", target);
			res.end();
		};
	}
}