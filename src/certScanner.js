'use strict';

var x509 = require('x509.js');
var fs = require('fs');
var async = require('async');
var path = require('path');
var moment = require('moment');
var util = require('util');

var EventEmitter = require('eventemitter3');

module.exports = function(sslDirectory, options) {
  var that = this;
  options = options || {};

  if(!sslDirectory) {
    throw new Error('sslDirectory as first argument is mandatory');
  }

  this.sslDirectory = sslDirectory;
  if (!sslDirectory.match(/\/$/)) {
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
                keys[pem.publicModulus] = options.read ? rawCert : certPath;
                return cb();
              }
              if(err)  {
                if(err.toString().match(/Certificate data larger than/))
                  return cb(null);
                if(err.toString().match(/Unable to parse/))
                  return cb(null);
                if(err.toString().match(/Certificate argument provided, but left blank/))
                  return cb(null);
                return cb(err);
              }
              if(!err && !cert && !pem) {
                return cb();
              }


              if(!options.acceptInvalidDates) {
                var dateFormat = 'MMM DD HH:mm:ss YYYY';
                if(moment.parseZone(cert.notBefore, dateFormat).diff(moment()) < 0) { // valid
                  if(moment.parseZone(cert.notAfter, dateFormat).diff(moment()) > 0) { // valid
                    if(moment.parseZone(cert.notAfter, dateFormat).diff(moment(), 'd') < 90)
                      that.emit('notice', path.join(dirName, certPath) + ': valid only for ' + moment(new Date(cert.notAfter)).diff(moment(), 'd').toString() + ' days');
                  }
                  else { //expired
                    that.emit('notice', path.join(dirName, certPath) + ': expired ' + (-moment(new Date(cert.notAfter)).diff(moment(), 'd')).toString() + ' days ago');
                    return cb();
                  }
                }
                else { // not yet valid
                  that.emit('notice', path.join(dirName, certPath) + ': not yet valid for ' + (moment(new Date(cert.notBefore)).diff(moment(), 'd')).toString() + ' days');
                  return cb();
                }
              }

              

              var altNames = cert.altNames;

              var keyForCert = options.read ? rawCert : certPath;
              certs[keyForCert] = cert.publicModulus;

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

  var readPart = async.memoize(function(file, maxRead, cb) {
    fs.open(file, 'r', function(err, fd) {
      if(err) return cb(err);
      var buf = new Buffer(maxRead);
      fs.read(fd, buf, 0, maxRead, null, function(err, bytesRead, buffer) {
        fs.close(fd);
        if(bytesRead < maxRead)
          return cb(err, buffer.slice(0, bytesRead).toString('utf8'));
        return cb(err, buffer.toString('utf8'));
      });
    });
  });

  this.getCertOrPem = function(certPath, cb) {
    readPart(certPath, 65536, function(err, rawCert) {
      if(err) return cb(err);
      try {
        var cert = x509.parseCert(rawCert);
        return cb(null, cert, null, rawCert);
        
      } catch(err) {
        try {
          var pem = x509.parseKey(rawCert);

          return cb(null, null, pem, rawCert);
        } catch(err2) {

        }
        cb(err);
      }
    });
  }

  this.getCaFor = async.memoize(function(certPath, cb) {
    readPart(certPath, 65636, function(err, rawCert) {
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
                return processDirectory(certPath, function() {
                  cb(false); // is a directory
                });                
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
  });

  this.isDomainCert = function(certs) {
    return certs.some(function(cert) {
      return cert.altNames.length > 0;
    });
  };

  this.caMatches = function(caCert, issuedCertificatedbyCA) {
    var subject = caCert.subject;

    var expectedIssuer = issuedCertificatedbyCA.issuer;

    var status =
     expectedIssuer.countryName === subject.countryName
        && expectedIssuer.organizationName === subject.organizationName
        && expectedIssuer.organizationalUnitName === subject.organizationalUnitName
        && expectedIssuer.commonName === subject.commonName
       && caCert.publicModulo === issuedCertificatedbyCA.publicModulo
       && caCert.publicExponent === issuedCertificatedbyCA.publicExponent
        ;

        return status;
  };

  var beginCertToken = '-----BEGIN CERTIFICATE-----';
  var endCertToken = '-----END CERTIFICATE-----';
  this.getCaCertsFromFile = function(certPath, cb) {
    // TODO: This can possibly be replaced with some regexp.
    readPart(certPath, 4*65536, function(err, certFileContent) {
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