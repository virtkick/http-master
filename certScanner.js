'use strict';
require('es6-shim');
var x509 = require('x509');
var fs = require('fs');
var async = require('async');

module.exports = function(sslDirectory) {
  var that = this;
  this.sslDirectory = sslDirectory;
  if (!sslDirectory.endsWith('/')) {
    this.sslDirectory += '/';
  }

  this.scan = function(cb) {
    var config = {};

    fs.readdir(this.sslDirectory, function(err, files) {
      if(err) return cb(err);
      
      async.each(files, function(certFile, cb) {
        var certPath = that.sslDirectory + certFile;

        that.getDomainsFrom(certPath, function(err, altNames) {
          if(err) return cb(err);

          async.each(altNames, function(domain, cb) {
            config[domain] = {};
            config[domain].cert = certPath;

            that.getCaFor(certPath, function(err, ca) {
              if (ca) {
                config[domain].ca = ca;
              }
              cb(err);
            });
          }, cb);

        });
      }, function(err) {
        cb(err, config);
      });
    });
  };

  this.getDomainsFrom = function(certPath, cb) {
    fs.readFile(certPath, 'utf8', function(err, rawCert) {
      if(err) return cb(err);
      try {
        var cert = x509.parseCert(rawCert);
        cb(null, cert.altNames);
      } catch(err) {
        cb(err);
      }
    });
  };

  this.getCaFor = function(certPath, cb) {
    fs.readFile(certPath, 'utf8', function(err, rawCert) {
      if(err) return cb(err);

      var expectedIssuer = x509.parseCert(rawCert).issuer;

      fs.readdir(that.sslDirectory, function(err, files) {
        if(err) return cb(err);

        async.filter(files, function(certFile, cb) {
          var certPath = that.sslDirectory + certFile;
          that.getCaCertsFromFile(certPath, function(err, certs) {
            if (that.isDomainCert(certs)) {
              return cb(false);
            }
            return cb(certs.some(function(cert) {
              return that.issuerMatches(cert, expectedIssuer);
            }));
          });
        }, function(ca) {
          ca = ca.map(function(fileName) {
            return that.sslDirectory + fileName;
          });

          if (ca.length === 0) {
            cb(null, null);
          } else if (ca.length === 1) {
            cb(null, ca[0]);
          } else {
            cb(null, ca);
          }
        });
      });
    });
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
  this.getCaCertsFromFile = function(certPath, cb) {
    // TODO: This can possibly be replaced with some regexp.
    fs.readFile(certPath, 'utf8', function(err, certFileContent) {
      if(err) return cb(err);

      var possibleCerts = certFileContent.split(beginCertToken);
      var certs = [];
      possibleCerts.forEach(function(cert) {
        var endTokenIndex = cert.indexOf(endCertToken);
        if (endTokenIndex === -1) {
          return null;
        }
        var rawCert = cert.substring(0, endTokenIndex);
        var parsedCert = beginCertToken + rawCert + endCertToken;
        try {
          certs.push(x509.parseCert(parsedCert));
        } catch(err) {

        }
      });
      cb(null, certs);
    });
  };
};
