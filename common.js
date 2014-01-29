var path = require('path');
var modules = require("fs").readdirSync(path.join(__dirname, "modules")).map(function(file) {
  return require('./modules/' + file);
}).sort(function(a, b) { // sort modules according to priority
  return (b.priority || 0) - (a.priority || 0);
});


function runModules(cb) {
  var args = Array.prototype.slice.call(arguments, 1);
  var results = [];

  var name;
  if (typeof cb === 'string') {
    name = cb;
  } else {
    name = args.shift();
  }
  
  modules.forEach(function(module) {
    if (module[name]) {

      var ret = module[name].apply(module[name], args);

      if (ret && typeof cb === 'function') {
        cb(name, ret);
      }
    }
  });
}

exports.runModules = runModules;