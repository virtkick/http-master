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
	if(typeof entry == 'number')
		entry = entry.toString();
	if(typeof entry == 'string') {
		if(entry.match(/^\d+(?:|\/.*)$/)) {
			entry = '127.0.0.1:' + entry;
		}
		if(!entry.match('https?\/\/')) {
			entry = 'http://' + entry;
		}
	}
	entry = url.parse(entry, true, true)
	entry.ws = true;
	return entry;
}

var proxy = httpProxy.createProxyServer({agent: null});
var regexpHelper = require('../regexpHelper');

proxy.on('error', function(err, req, res) {
	// forward to next route and save error for potential handler
	req.err = err;
	req.next();
});

module.exports = {
	middleware: function(config) {
		if(!config.router) return;

		return new DispatchTable({
			config: config.router,
			requestHandler: function(req, res, next, target) {
				req.connection.proxy = proxy;
				req.next = next;
				if(req.pathMatch || req.hostMatch) {
					target = url.parse(regexpHelper(target.href, req.hostMatch, req.pathMatch));
					req.url = target.path;
				}
				proxy.web(req, res, {target: target});
			},
			upgradeHandler: function(req, socket, head, target) {
				if(req.pathMatch || req.hostMatch) {
					target = url.parse(regexpHelper(target.href, req.hostMatch, req.pathMatch));
					req.url = target.path;
				}
				proxy.ws(req, socket, head, {target: target});
			},
			entryParser: function(entryKey, entry) {
				return [entryKey,  parseEntry(entry)];
			},
			port: config.port
		});
		}
};