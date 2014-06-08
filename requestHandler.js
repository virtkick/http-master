var http = require('http');
var url = require('url');

var punycode = require('punycode');

module.exports = function(handler) {
  return function(req, res) {
    req.parsedUrl = url.parse(req.url);
    if(req.headers.host) { // this legally can be undefined
      var hostSplit = req.headers.host.split(':');
      try {
        hostSplit[0] = punycode.toUnicode(hostSplit[0]);
        req.unicodeHost = hostSplit.join(":");
      } catch(err) {
        req.unicodeHost = req.headers.host;
      }
    }
    handler(req, res);
  };
};