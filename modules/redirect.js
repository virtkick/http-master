var DispatchTable = require('../DispatchTable');

var regexpHelper = require('../regexpHelper');

function splitFirst(str) {
	var index = str.indexOf('/');
	if (index == -1)
		return [str];
	return [str.substr(0, index), str.substr(index)];

}

module.exports = {
	priority: 9,
	middleware: function(config) {
		if (!config.redirect) return;

		return new DispatchTable({
			config: config.redirect,
			requestHandler: function(req, res, next, target) {
				if(req.pathMatch || req.hostMatch)
					target = regexpHelper(target, req.hostMatch, req.pathMatch);

				target = target.replace("[path]", req.url);
				res.statusCode = 302;
				res.setHeader("Location", target);
				return res.end();
			},
			port: config.port
		});
	}
}