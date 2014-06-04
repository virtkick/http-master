'use strict';
require('es6-shim');
var x509 = require('parse-x509');
var fs = require('fs');
var async = require('async');
var path = require('path');
var moment = require('moment');
var util = require('util');

var EventEmitter = require('events').EventEmitter;

module.exports = function(sslDirectory, options) {
  var that = this;
  options = options || {};

  if(!sslDirectory) {
    throw new Error('sslDirectory as first argument is mandatory');
  }

  this.sslDirectory = sslDirectory;
  if (!sslDirectory.endsWith('/')) {
    this.sslDirectory += '/';
  }

  this.scan = function(cb) {
    var outputConfig = {};

    var keys = {};
    var certs = {};

    function processDirectory(dirName, cb) {
      fs.readdir(dirName, function(err, files) {
        if(err) return cb(err);

        async.each(files, function(certFile, cb) {
          var certPath = path.join(dirName, certFile);

          fs.stat(certPath, function(err, statData) {
            if(err) return cb(err);

            if(statData.isDirectory())
              return processDirectory(certPath, cb);

            that.getCertOrPem(certPath, function(err, cert, pem, rawCert) {
              if(pem) {
                keys[pem.publicExponent] = options.read ? rawCert : certPath;
                return cb();
              }

              if(!options.acceptInvalidDates) {
                if(moment(cert.notBefore).diff(moment()) < 0) { // valid
                  if(moment(cert.notAfter).diff(moment()) > 0) { // valid
                    if(moment(cert.notAfter).diff(moment(), 'd') < 90)
                      that.emit('notice', path.join(dirName, certPath) + ': valid only for ' + moment(cert.notAfter).diff(moment(), 'd').toString() + ' days');
                  }
                  else { //expired
                    that.emit('notice', path.join(dirName, certPath) + ': expired ' + (-moment(cert.notAfter).diff(moment(), 'd')).toString() + ' days ago');
                    return cb();
                  }
                }
                else { // not yet valid
                  that.emit('notice', path.join(dirName, certPath) + ': not yet valid for ' + (moment(cert.notBefore).diff(moment(), 'd')).toString() + ' days');
                  return cb();
                }
              }

              

              var altNames = cert.altNames;

              var keyForCert = options.read ? rawCert : certPath;
              certs[keyForCert] = cert.publicExponent;

              if(err)  {
                if(err.toString().match(/Unable to parse certificate/))
                  return cb(null);
                return cb(err);
              }

              async.each(altNames, function(domain, cb) {
                outputConfig[domain] = {};
                outputConfig[domain].cert = options.read ? rawCert : certPath;

                that.getCaFor(certPath, function(err, ca, caRaw) {
                  if (ca) {
                    outputConfig[domain].ca = options.read ? caRaw : ca;
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

      Object.keys(outputConfig).forEach(function(domain) {
        var key = keys[certs[outputConfig[domain].cert]];


        // flatten CA reuslts array by removing duplicates
        var ca = outputConfig[domain].ca;
        if(ca && ca instanceof Array) {
          ca = ca.filter(function(elem, pos) {
            return ca.indexOf(elem) == pos;
          });
          if(ca.length === 1)
            outputConfig[domain].ca = ca[0];
          else
            outputConfig[domain].ca = ca;
        }


        if(key) {
          outputConfig[domain].key = key;
        }
        else if(options.onlyWithKey) {
          delete outputConfig[domain];
        }
      });

      cb(err, outputConfig);
    });
  };

  this.getCertOrPem = function(certPath, cb) {
    fs.readFile(certPath, 'utf8', function(err, rawCert) {
      if(err) return cb(err);
      try {
        var cert = x509.parseCert(rawCert);
        return cb(null, cert, null, rawCert);
        
      } catch(err) {

        try {
          var pem = x509.parsePem(rawCert);
          return cb(null, null, pem, rawCert);
        } catch(err2) {

        }
        cb(err);
      }
    });
  };

  this.getCaFor = function(certPath, cb) {
    fs.readFile(certPath, 'utf8', function(err, rawCert) {
      if(err) return cb(err);

      var parsedCert;
      try {
        parsedCert = x509.parseCert(rawCert);
      } catch(err) {
        return cb(err);
      }

      var caResults = [];
      var caRawResults = [];
      function processDirectory(dirName, cb) {
        fs.readdir(dirName, function(err, files) {

          if(err) return cb(err);

          async.filter(files, function(certFile, cb) {
            var certPath = path.join(dirName, certFile);

            fs.stat(certPath, function(err, statData) {

              if(statData.isDirectory()) {
                return processDirectory(certPath, cb);
              }

              that.getCaCertsFromFile(certPath, function(err, certs, rawCerts) {
                if(err) return cb(false);

                if (that.isDomainCert(certs)) {
                  return cb(false);
                }

                var matchingCa = certs.filter(function(cert, i) {
                  var res = that.caMatches(cert, parsedCert);
                  if(res) {
                    caRawResults.push(rawCerts[i]);
                  }
                  return res;
                });

                return cb(matchingCa.length);
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

        function noArrayIfOne(arr) {
          return (arr.length === 1) ? arr[0] : arr;
        }

        if(caResults.length) {
          cb(null, noArrayIfOne(caResults), noArrayIfOne(caRawResults));
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

  this.caMatches = function(caCert, issuedCertificatedbyCA) {
    var subject = caCert.subject;

    var expectedIssuer = issuedCertificatedbyCA.issuer;

    return expectedIssuer.countryName === subject.countryName &&
        expectedIssuer.organizationName === subject.organizationName &&
        expectedIssuer.organizationalUnitName === subject.organizationalUnitName &&
        expectedIssuer.commonName === subject.commonName &&
        caCert.publicModulus === issuedCertificatedbyCA.publicModulus;
  };

  var beginCertToken = '-----BEGIN CERTIFICATE-----';
  var endCertToken = '-----END CERTIFICATE-----';
  this.getCaCertsFromFile = function(certPath, cb) {
    // TODO: This can possibly be replaced with some regexp.
    fs.readFile(certPath, 'utf8', function(err, certFileContent) {
      if(err) return cb(err);

      var possibleCerts = certFileContent.split(beginCertToken);
      var certs = [];
      var rawCerts = [];
      possibleCerts.forEach(function(cert) {
        var endTokenIndex = cert.indexOf(endCertToken);
        if (endTokenIndex === -1) {
          return null;
        }
        var rawCert = cert.substring(0, endTokenIndex);
        var parsedCert = beginCertToken + rawCert + endCertToken + '\n';
        try {
          certs.push(x509.parseCert(parsedCert));
          rawCerts.push(parsedCert);
        } catch(err) {

        }
      });
      cb(null, certs, rawCerts);
    });
  };
};


util.inherits(module.exports, EventEmitter);