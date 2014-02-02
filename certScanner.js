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
      var certs = that.getCaCertsFromFile(certPath);
      if (that.isDomainCert(certs)) {
        return false;
      }
      return certs.some(function(cert) {
        return that.issuerMatches(cert, expectedIssuer);
      });
    });

    ca = ca.map(function(fileName) {
      return that.sslDirectory + fileName;
    });

    if (ca.length === 0) {
      return null;
    } else if (ca.length === 1) {
      return ca[0];
    } else {
      return ca;
    }
  };

  this.isDomainCert = function(certs) {
    return certs.some(function(cert) {
      return cert.altNames.length > 0;
    });
  };

  this.issuerMatches = function(cert, expectedIssuer) {
    var foundIssuer = cert.issuer;

    return expectedIssuer.countryName === foundIssuer.countryName &&
        expectedIssuer.organizationName === foundIssuer.organizationName &&
        expectedIssuer.organizationalUnitName === foundIssuer.organizationalUnitName;
  };

  var beginCertToken = '-----BEGIN CERTIFICATE-----';
  var endCertToken = '-----END CERTIFICATE-----';
  this.getCaCertsFromFile = function(certPath) {
    // TODO: This can possibly be replaced with some regexp.
    var certFileContent = fs.readFileSync( certPath).toString();
    var possibleCerts = certFileContent.split(beginCertToken);
    var certs = [];
    possibleCerts.forEach(function(cert) {
      var endTokenIndex = cert.indexOf(endCertToken);
      if (endTokenIndex == -1) {
        return null;
      }
      var rawCert = cert.substring(0, endTokenIndex);
      var parsedCert = beginCertToken + rawCert + endCertToken;
      certs.push(x509.parseCert(parsedCert));
    });
    return certs;
  };
};
