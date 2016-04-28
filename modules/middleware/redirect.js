
var regexpHelper = require('../../src/regexpHelper');

module.exports = function RedirectMiddleware() {
  return {
    requestHandler: function(req, res, next, target) {
      // skip for websockets
      if(req.upgrade) { return next(); }
      
      if (req.match)
        target = regexpHelper(target, req.match);

      target = target.replace("[path]", req.url.substring(1));
      if(req.unicodeHost) {
        target = target.replace("[host]", req.unicodeHost.split(':')[0]);
      }
      res.statusCode = 302;
      res.setHeader("Location", target);
      return res.end();
    }
  };
}
