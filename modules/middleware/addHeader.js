module.exports = function AddHeader() {
  return {
    requestHandler: function(req, res, next, target) {
      req.headers[target[0]] = target[1];
      next();
    },
    entryParser: function(config) {
      if(!config.match(/\s*=\s*/)) {
        throw new Error('Bad format, should be key=value');
      }
      return config.split(/\s*=\s*/);
    }
  };
};