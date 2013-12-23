var DispatchTable = require('../DispatchTable');

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
				var m = req.pathMatch;
				if (m) {
					if (m.length > 1) {
						for(var key in m) {
							target = target.replace("[" + key + "]", m[key]);
						}
					}
				}
				target = target.replace("[path]", req.url);
				res.statusCode = 302;
				res.setHeader("Location", target);
				return res.end();
			},
			port: config.port
		});
	}
}