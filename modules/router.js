var httpProxy = require('http-proxy');
var DispatchTable = require('../DispatchTable');
var url = require('url');

function splitFirst(str, delim) {
	var index = str.indexOf(delim);
	if(index == -1)
		return [str];
	return [str.substr(0,index), str.substr(index)];

}

function parseEntry(entry) {
	var entry = url.parse(entry, true, true)
	entry.ws = true;
	return entry;
}

module.exports = {
	upgrade: function(config) {
		return function(req, socket, head) {
			// FIXME: very hackish
			socket._idleNext.proxy.ws(req, socket, head);
		};
	},
	middleware: function(config) {
		if(!config.router) return;

		var dispatchTable = new DispatchTable(config.router,
				function(req, res, proxy) {
					req.connection.proxy = proxy;
					proxy.web(req, res);
				},
				function(entryKey, entry) {
					if(typeof entry == 'number')
						entry = entry.toString();
					if(typeof entry == 'string') {
						if(entry.match(/^\d+$/)) {
							entry = '127.0.0.1:' + entry;
						}
						if(!entry.match('https?\/\/')) {
							entry = 'http://' + entry;
						}
					}
					var proxy = httpProxy.createProxyServer({agent: null,
							target: parseEntry(entry)});
					proxy.on('error', function(err, req, res) {
						// forward to next route and save error for potential handler
						req.err = err;
		  			req.next();
					});

					return [entryKey,  proxy];
			});
			return DispatchTable.prototype.dispatch.bind(dispatchTable);
		}
};