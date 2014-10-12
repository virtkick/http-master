var morgan = require('morgan');

module.exports = function LogMiddleware(logFileService) {
  return {
    requestHandler: function(req, res, next, middlewareInstance) {
      middlewareInstance(req, res, next);
    },
    entryParser: function(entry) {
      return morgan(entry.type || 'combined', {
        stream: logFileService(entry.file || entry)
      });
    }
  };
};