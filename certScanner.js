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
        config[domain] = {};
        config[domain].cert = certPath;

        var ca = that.getCaFor(certPath);
        if (ca) {
          config[domain].ca = ca;
        }
      });
    });

    return config;
  };

  this.getDomainsFrom = function(certPath) {
    var rawCert = fs.readFileSync(certPath).toString();
    var cert = x509.parseCert(rawCert);
    return cert.altNames;
  };

  this.getCaFor = function(certPath) {
    var rawCert = fs.readFileSync(certPath).toString();
    var expectedIssuer = x509.parseCert(rawCert).issuer;

    var files = fs.readdirSync(this.sslDirectory);
    var ca = files.filter(function(certFile) {
      var certPath = that.sslDirectory + certFile;
      var cert = x509.parseCert(certPath);
      if (cert.altNames.length > 0) {
        return false;
      }
      var foundIssuer = cert.issuer;

//      console.log();
//      console.log(expectedIssuer);
//      console.log(foundIssuer);
//      console.log();

      return expectedIssuer.countryName == foundIssuer.countryName &&
          expectedIssuer.organizationName == foundIssuer.organizationName &&
          expectedIssuer.organizationalUnitName == foundIssuer.organizationalUnitName;
    });

    ca = ca.map(function(fileName) {
      return that.sslDirectory + fileName;
    });

    if (ca.length == 0) {
      return null;
    } else if (ca.length == 1) {
      return ca[0];
    } else {
      return ca;
    }
  };
};
