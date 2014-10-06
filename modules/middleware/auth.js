var httpAuth = require('http-auth');

module.exports = function AuthMiddleware() {
  return {
    requestHandler: function(req, res, next, auth) {
      auth(req, res, function(err) {
        delete req.headers.authorization;
        next(err);
      });
    },
    entryParser: function(authConfig) {

      if(typeof authConfig === 'object') {
        authConfig.realm = authConfig.realm || 'Enter password';
      }
      if(typeof authConfig === 'string') {
        authConfig = {
          file: authConfig,
          realm: 'Enter password'
        }
      }
      return httpAuth.connect(httpAuth.basic(authConfig));
    }
  };
};