'use strict';
require('es6-shim');
var x509 = require('x509');
var fs = require('fs');
var async = require('async');
var path = require('path');

module.exports = function(sslDirectory) {
  var that = this;
  if(!sslDirectory)
    throw new Error("sslDirectory as first argument is mandatory");

  this.sslDirectory = sslDirectory;
  if (!sslDirectory.endsWith('/')) {
    this.sslDirectory += '/';
  }

  this.scan = function(cb) {
    var config = {};

    function processDirectory(dirName, cb) {
      fs.readdir(dirName, function(err, files) {
        if(err) return cb(err);

        async.each(files, function(certFile, cb) {
          var certPath = path.join(dirName, certFile);

          fs.stat(certPath, function(err, statData) {
            if(err) return cb(err);

            if(statData.isDirectory())
              return processDirectory(certPath, cb);

            that.getDomainsFrom(certPath, function(err, altNames) {
              if(err)  {
                if(err.toString().match(/Unable to parse certificate/))
                  return cb(null);
                return cb(err);
              }

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


          });
        }, function(err) {
          cb(err);
        });
      });
    }
    processDirectory(this.sslDirectory, function(err) {
      cb(err, config);
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

      var expectedIssuer;
      try {
        expectedIssuer = x509.parseCert(rawCert).issuer;
      } catch(err) {
        return cb(err);
      }

      var caResults = [];

      function processDirectory(dirName, cb) {
        fs.readdir(dirName, function(err, files) {

          if(err) return cb(err);

          async.filter(files, function(certFile, cb) {
            var certPath = path.join(dirName, certFile);

            fs.stat(certPath, function(err, statData) {

              if(statData.isDirectory()) {
                return processDirectory(certPath, cb);
              }

              that.getCaCertsFromFile(certPath, function(err, certs) {
                if(err) return cb(false);

                if (that.isDomainCert(certs)) {
                  return cb(false);
                }
                return cb(certs.some(function(cert) {
                  return that.issuerMatches(cert, expectedIssuer);
                }));
              });
            });
          }, function(ca) {
            caResults = ca.map(function(fileName) {
              return path.join(dirName, fileName);
            }).concat(caResults);

            cb(null);
          });
        });
      }
      processDirectory(that.sslDirectory, function(err) {
        if(err) return cb(err);

        if(caResults.length) {
          if(caResults.length === 1) {
            cb(null, caResults[0]);
          } else {
            cb(null, caResults);
          }
        }
        else {
          cb(null);
        }
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
