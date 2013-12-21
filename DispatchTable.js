var XRegExp = require('xregexp').XRegExp;

XRegExp.install({
	// Overrides native regex methods with fixed/extended versions that support named
	// backreferences and fix numerous cross-browser bugs
	natives: true,

	// Enables extensibility of XRegExp syntax and flags
	extensibility: true
});

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

function globStringToRegex(str) {
	var inside = preg_quote(str).replace(/^\\\*\\\./g, '(?:.+\\.)?').
	replace(/\\\*/g, '[^.]+').replace(/\\\?/g, '.');

	return new RegExp("^" + inside + "$", 'g');
}

function postParseKey(entryKey, entry) {
	var withHost = false;
	var regexp;
	if (typeof entryKey == 'string') {
		var m = entryKey.match(/^\/(.*)\/(h)?$/);
		if (m) {
			regexp = new XRegExp("^" + m[1] + "$");
			if (m[1])
				regexp.withHost = true;
			entry.regexp = regexp;
		} else if (entryKey.match(/[*?]/)) {
			regexp = globStringToRegex(entryKey);
			if (entryKey.match(/\//))
				regexp.withHost = true;
			entry.regexp = regexp;
		}
	}
	return entryKey;
}

function DispatchTable(config, runEntry, parseEntry) {
	var self = this;
	this.runEntry = runEntry
	this.table = {};
	this.regexpEntries = [];
	Object.keys(config).forEach(function(entryKey) {
		var entry = config[entryKey];
		if (parseEntry) {
			var parsed = parseEntry(entryKey, entry);
			entryKey = parsed[0];
			entry = parsed[1];
		}
		entry = {
			target: entry
		};
		entryKey = postParseKey(entryKey, entry);
		if (entry.regexp) {
			self.regexpEntries.push(entry);
		} else {
			self.table[entryKey + ':' + config.port] = entry;
			self.table[entryKey] = entry;
		}
	});

}

DispatchTable.prototype.dispatch = function(req, res, next) {
	var host = req.headers.host;

	req.next = next;
	if (this.table[host]) {
		console.log("Entry foun")
		return this.runEntry(req, res, this.table[host].target);
	} else if (this.regexpEntries.length) {
		console.log("Checking regexps");
		var i = 0;
		var regexpEntries = this.regexpEntries;
		for (i = 0; i < regexpEntries.length; ++i) {
			var entry = regexpEntries[i];
			var m = host.match(entry.regexp);
			if (m) {
				req.dispatcherMatch = m;
				console.log("Dispatch table", host);
				return this.runEntry(req, res, entry.target);
			}
		}
	}
	console.log("Nothing found ...");
	next();
};
module.exports = DispatchTable;