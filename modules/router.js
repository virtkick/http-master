var httpProxy = require('http-proxy');
var DispatchTable = require('../DispatchTable');
var url = require('url');

function splitFirst(str, delim) {
	var index = str.indexOf(delim);
	if(index == -1)
		return [str];
	return [str.substr(0,index), str.substr(index)];

}

var proxy = httpProxy.createProxyServer({
	//agent: http.globalAgent
	agent: null
});

module.exports = {
	upgrade: function(config) {
		return function(req, socket, head) {
			proxy.ws(req, socket, head);
		}
	},
	middleware: function(config) {
		if(!config.router) return;

		proxy.off('error');
		proxy.on('error', function(err, req, res) {
			// forward to next route and save error for potential handler
			req.err = err;
		  req.next();
		});

		var dispatchTable = new DispatchTable(config.router,
				function(req, res, target) {
					proxy.web(req, res, {target: target});
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
					return [entryKey, url.parse(entry, true, true)];
			});
			return DispatchTable.prototype.dispatch.bind(dispatchTable);
		}
};