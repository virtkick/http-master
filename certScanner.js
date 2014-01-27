require('es6-shim');
var pem = require('pem');
var x509 = require('x509');
var fs = require('fs');

module.exports = function(sslDirectory) {
  var that = this;
  this.sslDirectory = sslDirectory;
  if (!sslDirectory.endsWith('/')) {
    this.sslDirectory += '/';
  }

  this.scan = function() {
    var config = {};

    var files = fs.readdirSync(this.sslDirectory);
    files.forEach(function(certFile) {
      var certPath = that.sslDirectory + certFile;
      that.getDomainsFrom(certPath).forEach(function(domain) {
        config[domain] = {
          "cert": certPath
        };
      });
    });

    return config;
  };

  this.getDomainsFrom = function(certPath) {
    var rawCert = fs.readFileSync(certPath).toString();
    var cert = x509.parseCert(rawCert);
    return cert.altNames;
  };
};
