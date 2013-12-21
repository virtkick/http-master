function splitFirst(str) {
	var index = str.indexOf('/');
	if(index == -1)
		return [str];
	return [str.substr(0,index), str.substr(index)];

}

module.exports = {
	priority: 9,
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

			var regexp;
			try {
				regexp = new RegExp("^" + path + "$")
			} catch(err) {
				console.log(err);
				return;
			}

			var redirectEntry = {
				path: path,
				target: target,
				pathRegexp: path?regexp:null
			};
			if(!redirectTable[host]) {
				var entryList = [redirectEntry];
				redirectTable[host] = entryList;
				redirectTable[host + ":" + config.port] = entryList;
			} else {
				redirectTable[host].push(redirectEntry);
			}
		});
		return function(req, res, next) {
			var entryList = redirectTable[req.headers.host];
			if (!entryList) return next();

			for(var i = 0; i < entryList.length; ++i) {
				var entry = entryList[i];

				var target = entry.target;

				var m;
				if(entry.path && entry.pathRegexp) {
					m = req.url.match(entry.pathRegexp);
					if(m) {
						if(m.length > 1) {
							for(var j = 1;j < m.length;++j) {
								target = target.replace("["+j + "]", m[j]);
							}
						}
					}
					else {
						continue;
					}
				}
				target = target.replace("[path]", req.url);
				res.statusCode = 302;
				res.setHeader("Location", target);
				return res.end();
			}
			return next();
		};
	}
}