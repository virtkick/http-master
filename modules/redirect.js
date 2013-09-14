function splitFirst(str) {
	var index = str.indexOf('/');
	if(index == -1)
		return [str];
	return [str.substr(0,index), str.substr(index)];

}

module.exports = {
	middleware: function(config) {
		if(!config.redirect) return;

		var redirectTable = {};
		Object.keys(config.redirect).forEach(function(redirectEntry) {
			var array = splitFirst(redirectEntry);
			var host = array[0];
			var path = array[1];

			var target = config.redirect[redirectEntry];

			if (!target.match(/^http:\/\//) && !target.match(/^https:\/\//)) {
				target = "http://" + target;
			}
			target = target.replace('/[path]', '[path]');
			var redirectEntry = {
				path: path,
				target: target
			};

			redirectTable[host] = redirectEntry;
			redirectTable[host + ":" + config.port] = redirectEntry;
		});

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