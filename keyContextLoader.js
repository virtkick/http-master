var async = require('async');
var fs = require('fs');

function normalizeCert(cert) {
  cert = cert.toString('utf8');
  if (!cert.match(/\n$/g)) {
    return cert + "\n";
  }
  return cert;
}

function loadForCaBundle(context, callback) {
  var chain = normalizeCert(fs.readFileSync(context.ca, 'utf8'));
  chain = chain.split("\n");
  context.ca = [];
  var cert = [];
  chain.forEach(function(line) {
    if (line.length == 0)
      return;
    cert.push(line);
    if (line.match(/-END CERTIFICATE-/)) {
      context.ca.push(cert.join("\n") + "\n");
      cert = [];
    }
  });
  callback();
}

function loadForCaArray(context, callback) {
  var caArray = context.ca;

  if(context.ca.length) {
    async.parallel(context.ca.map(function(elem, i) {
      return function(cb) {
        fs.readFile(caArray[i], 'utf8', function(err, data) {
          context.ca[i] = normalizeCert(data);
          cb(err);
        });
      }
    }), callback);
  }
  else {
    callback();
  }
}

function loadKeysForContext(context, callback) {

  async.each(Object.keys(context), function(key, keyFinished) {
    // If CA certs are specified, load those too.
    if (key === "ca") {
      if (typeof context.ca === 'object') {
        loadForCaArray(context, keyFinished);
      } else {
        loadForCaBundle(context, keyFinished);
      }
    } else if (key == "cert" || key == "key") {

      fs.readFile(context[key], function(err, data) {
        if(err) return keyFinished(err);
        context[key] = normalizeCert(data.toString('utf8'));
        keyFinished();
      });
    } else
      keyFinished();
  }, function(err) {
    callback(err);
  });
}

module.exports = loadKeysForContext;