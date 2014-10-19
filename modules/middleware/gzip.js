var compression = require('compression');

module.exports = function GzipMiddleware() {
  return {
    requestHandler: function(req, res, next, middlewareInstance) {
      middlewareInstance(req, res, next);
    },
    entryParser: function(entry) {
      return require('compression')({
        level: parseInt(entry)
      });
    }
  };
};