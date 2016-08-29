'use strict';
var XRegExp = require('xregexp');
var assert = require('assert');

// globStringToRegex from: http://stackoverflow.com/a/13818704/403571
function regexpQuote(str, delimiter) {
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

function splitFirst(str) {
  var m = str.match(/^(\^?[^\/]*)\$?(?:(\/)(\^?)(.*))?$/);
  if(m.length > 2) {
    // make ^/path from /^path
    return [m[1], m[3] + m[2]+m[4]]; 
  }
  return [m[1]];
}

function globStringToRegex(str, specialCh, optionalEnding) {
  if(!specialCh)
    specialCh = '.';
  var inside = regexpQuote(str);
  if(specialCh == '.') {
    inside = inside.replace(/^\\\*$/g, '(?:(?<host>.*))');
    inside = inside.replace(/^\\\*\\\?\\\./g, '(?:(.+)\\.)?');
    inside = inside.replace(/^\\\*\\\./g, '(?:(.+)\\.)');
    inside = inside.replace(/\\\.\\\*\\\?/g, '(?:\\.([^'+specialCh+']+))?');    
  }
  else
    inside = inside.replace(/\/\\\*$/g, '(?:\/(?<rest>.*|)|)');
  inside = inside.replace(/\\\*/g, '([^'+specialCh+']+)');

  var regexp = new XRegExp('^' + inside + (optionalEnding?('(?:'+optionalEnding+')?'):'') +  '$');
  return regexp;
}

function getRegexpIfNeeded(str, specialCh, optionalEnding) {
  if (typeof str == 'string') {
    var m = str.match(/^\^(.*)\$?$/);
    if (m) {
      return new XRegExp('^' + m[1] + (optionalEnding?('(?:'+optionalEnding+')?'):'') +  '$');
    } else if (str.match(/[*?]/)) {
      return globStringToRegex(str, specialCh, optionalEnding);
    }
  }
  return undefined;
}

function postParseKey(entryKey, entry) {
  var regexp = getRegexpIfNeeded(entryKey, '.', ':' + entry.port);
  if (regexp)
    entry.regexp = regexp;
  return entryKey;
}

function DispatchTable(port, params) {
  var parseEntry = params.entryParser;
  var config = params.config;

  var self = this;
  this.requestHandler = params.requestHandler;
  this.upgradeHandler = params.upgradeHandler;
  this.table = {};
  this.regexpEntries = [];
  this.failedEntries = {};
  Object.keys(config || {}).forEach(function(entryKey) {
    var entry = config[entryKey];


    // split entry 192.168.0.0/host to
    // ['192.168.0.0', '/']
    var entryKeyData = splitFirst(entryKey);
    entryKey = entryKeyData[0];
    var entryPath = entryKeyData[1];

    if(entryPath) {
      entryPath = decodeURIComponent(entryPath);
    }
    if (parseEntry) {
      var parsedEntry = parseEntry(entry);
      assert(typeof parsedEntry !== 'undefined', 'entryParser should have returned something');
      entry = parsedEntry;
    }
    entry = {
      target: entry,
      port: port
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
  var m;

  var parsedUrl = req.parsedUrl;
  var pathname = parsedUrl.pathname || '';

  try {
    pathname = decodeURIComponent(pathname);
  } catch(err) {}

  if(entry.pathRegexp) {
    m = pathname.match(entry.pathRegexp);
    if (m) {
      if(!req.match)
        req.match = [];
      for(var i = 1;i < m.length;++i) {
        req.match.push(m[i]);
      }
      return true;
    } 
  }
  else if(pathname == entry.path) {
    return true;
  }
  return false;
};

DispatchTable.prototype.getTargetForReq = function(req) {
  var i, m;
  var host = req.unicodeHost || req.headers.host || ''; // host can be undefined

  var self = this;
  var target;

  // look for specific host match first
  // and generic path-only match then
  [host, ''].some(function(host) {
    var entry = self.table[host];
    if (entry) {
      if (entry.target) {
        if(self.checkPathForReq(req, entry)) {
          target = entry.target
          return true;
        }
      }
      else { // multiple entries, check pathnames
        var targetEntries = entry;
        for (i = 0; i < targetEntries.length; ++i) {
          if(self.checkPathForReq(req, targetEntries[i])) {
            target = targetEntries[i].target;
            return true;
          }
        }
      }
    }
  });
  if(target) {
    return target;
  }
  // if host-only matches failed, look for path matches
  if (this.regexpEntries.length) {
    var regexpEntries = this.regexpEntries;
    for (i = 0; i < regexpEntries.length; ++i) {
      var entry = regexpEntries[i];
      if(!entry.regexp) {
        // TODO: research this
        continue;
      }
      m = host.match(entry.regexp);
      if (m) {
        if(!req.match)
          req.match = [];
        for(var i = 1;i < m.length;++i)
          req.match.push(m[i]);
        if(this.checkPathForReq(req, entry)) {
          return entry.target;
        }
      }
    }
  }
};

DispatchTable.prototype.dispatchRequest = function(req, res, next) {
  var target = this.getTargetForReq(req);
  if(target && this.requestHandler) {
    return this.requestHandler(req, res, next, target);
  }
  next();
};

DispatchTable.prototype.handleRequest = DispatchTable.prototype.dispatchRequest;

module.exports = DispatchTable;

module.exports.regexpQuote = regexpQuote;