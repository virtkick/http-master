'use strict';

var httpProxy = require('http-proxy');
var url = require('url');
var fs = require('fs');
var path = require('path');
var regexpHelper = require('../../src/regexpHelper');
var assert = require('assert');

function parseEntry(entry) {
  var m;
  if(typeof entry == 'number')
    entry = entry.toString();

  assert(typeof entry === 'string');

  var withPath = false;
  withPath = !!entry.replace(/https?:\/\//, '').match(/.*\//);

  if((m = entry.match(/^\d+(?:|\/.*)$/))) {
    entry = '127.0.0.1:' + entry;
  }
  if(!entry.match(/https?:\/\//)) {
    entry = 'http://' + entry;
  }
  entry = url.parse(entry, true, true)
  entry.withPath = withPath;
  return entry;
}


module.exports = function ProxyMiddleware(portConfig, di) {
  
  var proxy = httpProxy.createProxyServer({xfwd: true, agent: false});
  proxy.on('error', function(err, req, res) {
    req.err = err;
    req.next(err);
  });

  var rewriteTargetAndPathIfNeeded = function(req, target) {
    if(!(req.pathMatch || req.hostMatch)) {
      return target;
    }

    var processed = regexpHelper(target.href, req.hostMatch, req.pathMatch);
          
    if(req.parsedUrl.search)
      processed += req.parsedUrl.search;

    var newTarget = url.parse(processed);
    if(target.withPath) {
      req.url = newTarget.path;
    }
    return newTarget;
  };

  return {
    requestHandler: function(req, res, next, dispatchTarget) {
      req.connection.proxy = proxy;
      req.next = next;
      // workaround for node-http-proxy/#591
      if(!req.headers.host) {
        req.headers.host = '';
      }
      var proxyTarget = rewriteTargetAndPathIfNeeded(req, dispatchTarget);
      var m = req.headers.host.match(/^(.+):\d+$/);
      if(m) {
        req.headers.host = m[1] + ':' + proxyTarget.port;
      }

      // work around weirdness of new http-proxy url handling
      // for the purpose of passing the tests
      if(proxyTarget.pathname !== '/') {
        req.url = '';
      }
      else {
        proxyTarget.path = '';
      }

      var options = {
        target: proxyTarget,
        proxyTimeout: portConfig.proxyTargetTimeout,
        timeout: portConfig.proxyTimeout
      };

      if(req.upgrade) {
        return proxy.ws(req, req.upgrade.socket, req.upgrade.head, options);
      }
      proxy.web(req, res, options);
    },
    entryParser: function(entry) {
      return parseEntry(entry.target || entry);
    }
  };
}