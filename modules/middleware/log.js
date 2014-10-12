var morgan = require('morgan');

module.exports = function LogMiddleware(logFileService) {
  return {
    requestHandler: function(req, res, next, middlewareInstance) {
      console.log("ENTRY HANDLER");
      middlewareInstance(req, res, next);
    },
    entryParser: function(entry) {
      console.log("ENTRY", entry);
      return morgan(entry.type || 'combined', {
        stream: logFileService(entry.file || entry)
      });
    }
  };
};