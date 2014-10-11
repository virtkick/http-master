
var regexpHelper = require('../../src/regexpHelper');

module.exports = function RedirectMiddleware() {
  return {
    requestHandler: function(req, res, next, target) {
      if (req.pathMatch || req.hostMatch)
        target = regexpHelper(target, req.hostMatch, req.pathMatch);

      target = target.replace("[path]", req.url.substring(1));
      res.statusCode = 302;
      res.setHeader("Location", target);
      return res.end();
    }
  };
}