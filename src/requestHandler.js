var http = require('http');
var parseurl = require('parseurl');

var punycode = require('punycode');

module.exports = function(handler, finalHandler) {
  return function(req, res) {
    req.parsedUrl = parseurl(req);

    if(req.headers.host) { // this legally can be undefined
      var hostSplit = req.headers.host.split(':');
      try {
        hostSplit[0] = punycode.toUnicode(hostSplit[0]);
        req.unicodeHost = hostSplit.join(":");
      } catch(err) {
        req.unicodeHost = req.headers.host;
      }
    }
    handler(req, res, function(err) {
      if(finalHandler) {
        finalHandler(err, req, res);
      }
    });
  };
};