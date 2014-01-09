var XRegExp = require('xregexp').XRegExp;
var url = require('url');

XRegExp.install({
	// Overrides native regex methods with fixed/extended versions that support named
	// backreferences and fix numerous cross-browser bugs
	natives: true,

	// Enables extensibility of XRegExp syntax and flags
	extensibility: true
});

function splitFirst(str) {

	var m = str.match(/^(\^?[^\/]+)\$?(?:(\/)(\^?)(.+))?$/);
	if(m.length > 2) {
		// make ^/path from /^path
		return [m[1], m[3] + m[2]+m[4]]; 
	}
	return [m[1]];
}

// globStringToRegex from: http://stackoverflow.com/a/13818704/403571
function preg_quote(str, delimiter) {
	// http://kevin.vanzonneveld.net
	// +   original by: booeyOH
	// +   improved by: Ates Goral (http://magnetiq.com)
	// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +   bugfixed by: Onno Marsman
	// +   improved by: Brett Zamir (http://brett-zamir.me)
	// *     example 1: preg_quote("$40");
	// *     returns 1: '\$40'
	// *     example 2: preg_quote("*RRRING* Hello?");
	// *     returns 2: '\*RRRING\* Hello\?'
	// *     example 3: preg_quote("\\.+*?[^]$(){}=!<>|:");
	// *     returns 3: '\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:'
	return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&');
}

function globStringToRegex(str, specialCh) {
	if(!specialCh)
		specialCh = '.';
	var inside = preg_quote(str);
	if(specialCh == '.') {
		inside = inside.replace(/^\\\*$/g, '(?:(?<host>.+))');
		inside = inside.replace(/^\\\*\\\./g, '(?:(.+)\\.)?');
	}
	else
		inside = inside.replace(/\/\\\*$/g, '(?:\/(?<rest>[^?#]+|)|)');
	inside = inside.replace(/\\\*/g, '([^'+specialCh+']+)').replace(/\\\?/g, '.');

	var regexp = new XRegExp("^" + inside + "$");
  return regexp;
}

function getRegexpIfNeeded(str, specialCh) {
	if (typeof str == 'string') {
		var m = str.match(/^\^(.*)\$?$/);
		if (m) {
			return new XRegExp("^" + m[1] + "$");
		} else if (str.match(/[*?]/)) {
			return globStringToRegex(str, specialCh);
		}
	}
	return undefined;
}

function postParseKey(entryKey, entry) {
	var withHost = false;
	var regexp = getRegexpIfNeeded(entryKey);
	if (regexp)
		entry.regexp = regexp;
	return entryKey;
}

function DispatchTable(params) {
	var parseEntry = params.entryParser;
	var config = params.config;
	var port = params.port;

	var self = this;
	this.requestHandler = params.requestHandler;
	this.upgradeHandler = params.upgradeHandler;
	this.table = {};
	this.regexpEntries = [];
	Object.keys(config).forEach(function(entryKey) {
		var entry = config[entryKey];

		// split entry 192.168.0.0/host to
		// ['192.168.0.0', '/']
		var entryKeyData = splitFirst(entryKey);
		entryKey = entryKeyData[0];
		var entryPath = entryKeyData[1];

		if (parseEntry) {
			var parsed = parseEntry(entryKey, entry);
			entryKey = parsed[0];
			entry = parsed[1];
		}
		entry = {
			target: entry,
		};
		if (entryPath) {
			entry.path = entryPath;
			var pathRegexp = getRegexpIfNeeded(entryPath, '\/');
			if (pathRegexp)
				entry.pathRegexp = pathRegexp;
		}
		entryKey = postParseKey(entryKey, entry);
		port = port || 80;

		if (entry.regexp) {
			self.regexpEntries.push(entry);
		} else {

			if (self.table[entryKey]) {
				if (self.table[entryKey] instanceof Array) {
					self.table[entryKey].push(entry);
					self.table[entryKey + ':' + port].push(entry);
				} else {
					var oldEntry = self.table[entryKey];
					self.table[entryKey] = [oldEntry, entry];
					self.table[entryKey + ':' + port] = [oldEntry, entry];
				}
			} else {
				self.table[entryKey + ':' + port] = entry;
				self.table[entryKey] = entry;
			}
		}
	});
}

DispatchTable.prototype.checkPathForReq = function(req, entry) {
	if(!entry.path)
		return true;
	var target;
	var m;

  var parsedUrl = req.parsedUrl;
  var pathname = parsedUrl.pathname || '';

	if(entry.pathRegexp) {
		m = pathname.match(entry.pathRegexp);
		if (m) {
			req.pathMatch = m;
			return true;
		} 
	}
	else if(pathname == entry.path) {
		return true;
	}
	return false;
}

DispatchTable.prototype.getTargetForReq = function(req) {
	var i, m;
	var host = req.headers.host;

	if (this.table[host]) {
		if (this.table[host].target) {
			if(this.checkPathForReq(req, this.table[host])) {
				return this.table[host].target;
			}
		}
		else { // multiple entries, check pathnames
			var targetEntries = this.table[host];
			for (i = 0; i < targetEntries.length; ++i) {
				if(this.checkPathForReq(req, targetEntries[i]))
					return targetEntries[i].target;
			}
		}
	}
	if (this.regexpEntries.length) {
		var regexpEntries = this.regexpEntries;
		for (i = 0; i < regexpEntries.length; ++i) {
			var entry = regexpEntries[i];
			m = host.match(entry.regexp);
			if (m) {
				req.hostMatch = m;
				if(this.checkPathForReq(req, entry))
					return entry.target;
			}
		}
	}
};

DispatchTable.prototype.dispatchUpgrade = function(req, socket, head) {
	var target = this.getTargetForReq(req);
	if(target && this.upgradeHandler) {
		this.upgradeHandler(req, socket, head, target);
		return true;
	}
	return false;
}

DispatchTable.prototype.handleUpgrade = DispatchTable.prototype.dispatchUpgrade;;

DispatchTable.prototype.dispatchRequest = function(req, res, next) {
	var target = this.getTargetForReq(req);
	if(target && this.requestHandler) {
		return this.requestHandler(req, res, next, target);
	}
	next();
};

DispatchTable.prototype.handleRequest = DispatchTable.prototype.dispatchRequest;

module.exports = DispatchTable;