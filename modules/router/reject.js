var DispatchTable = require('../DispatchTable');
var http = require('http');

module.exports = {
  priority: 10,
  middleware: function(config) {
    if (!config.reject) return;

    return new DispatchTable({
      config: config.reject,
      requestHandler: function(req, res, next, target) {
        res.statusCode = target;
        res.end((target || 403) + ' ' + (http.STATUS_CODES[target] || 'Forbidden') );
      },
      entryParser: function(entryKey, entry) {
        var code;      
        if(typeof entry ==='string' || typeof entry === 'number') {
          code = parseInt(entry) || 403;
        }
        else {
          code = 403;
        }
        return [entryKey,  code];
      },
      port: config.port
    });

  }
};