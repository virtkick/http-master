var http = require('http');

module.exports = function Reject() {
  return {
    requestHandler: function(req, res, next, target) {
      res.statusCode = target;
      res.end((target || 403) + ' ' + (http.STATUS_CODES[target] || 'Forbidden') );
    },
    entryParser: function(entry) {
      var code;      
      if(typeof entry ==='string' || typeof entry === 'number') {
        code = parseInt(entry) || 403;
      }
      else {
        code = 403;
      }
      return code;
    }
  };
};


