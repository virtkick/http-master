'use strict';

var x509 = require('x509.js');
var fs = require('fs');
var async = require('async');
var path = require('path');
var moment = require('moment');
var util = require('util');

var EventEmitter = require('eventemitter3');

// TODO: rework into promises
class CertScanner extends EventEmitter {
  constructor(sslDirectory, options) {
    super();
    
    this.options = options;
    
    options = options || {};

    if(!sslDirectory) {
      throw new Error('sslDirectory as first argument is mandatory');
    }

    this.sslDirectory = sslDirectory;
    if (!sslDirectory.match(/\/$/)) {
      this.sslDirectory += '/';
    }

    this.readPart = async.memoize(function(file, maxRead, cb) {
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

    var beginCertToken = '-----BEGIN CERTIFICATE-----';
    var endCertToken = '-----END CERTIFICATE-----';
    this.getCaCertsFromFile = function(certPath, cb) {
      // TODO: This can possibly be replaced with some regexp.
      this.readPart(certPath, 4*65536, function(err, certFileContent) {
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
    
    this.getCaFor = async.memoize((certPath, cb) => {
      this.readPart(certPath, 65636, (err, rawCert) => {
        if(err) return cb(err);

        var parsedCert;
        try {
          parsedCert = x509.parseCert(rawCert);
        } catch(err) {
          return cb(err);
        }
        var caResults = [];
        var caRawResults = [];
        let processDirectory = (dirName, cb) => {
          fs.readdir(dirName, (err, files) => {

            if(err) return cb(err);

            async.filter(files, (certFile, cb) => {
              var certPath = path.join(dirName, certFile);

              fs.stat(certPath, (err, statData) => {
                if(statData.isDirectory()) {
                  return processDirectory(certPath, () => {
                    cb(false); // is a directory
                  });
                }

                this.getCaCertsFromFile(certPath, (err, certs, rawCerts) => {
                  if(err) return cb(false);

                  if (this.isDomainCert(certs)) {
                    return cb(false);
                  }
                  var matchingCa = certs.filter((cert, i) => {
                    var res = this.caMatches(cert, parsedCert);

                    if(res) {
                      caRawResults.push(rawCerts[i]);
                    }
                    return res;
                  });
                  return cb(matchingCa.length);
                });
              });
            }, function(ca) {
              caResults = ca.map(fileName => {
                return path.join(dirName, fileName);
              }).concat(caResults);

              cb(null);
            });
          });
        }
        processDirectory(this.sslDirectory, err => {
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
  }
  
  scan(cb) {
    var outputConfig = {};

    var keys = {};
    var certs = {};

    let options = this.options;

    let processDirectory = (dirName, cb) => {
      fs.readdir(dirName, (err, files) => {
        if(err) return cb(err);

        async.each(files, (certFile, cb) => {
          var certPath = path.join(dirName, certFile);

          fs.stat(certPath, (err, statData) => {
            if(err) return cb(err);

            if(statData.isDirectory())
              return processDirectory(certPath, err => {
                if(err && err.code === 'EACCES') {
                  this.emit('notice', path.join(dirName, certPath) + ': directory is not accessible');
                  return cb(null);
                }
                cb(err);
              });

            this.getCertOrPem(certPath, (err, cert, pem, rawCert) => {
              if(pem) {
                keys[pem.publicModulus] = options.read ? rawCert : certPath;
                return cb();
              }
              if(err)  {
                if(err.code === 'EACCES') {
                  this.emit('notice', path.join(dirName, certPath) + ': file is not readable');
                  return cb(null);
                }
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
                var notBeforeMoment = moment(new Date(cert.notBefore));
                var notAfterMoment = moment(new Date(cert.notAfter));
                var nowMoment = moment();
                if(notBeforeMoment.diff(nowMoment) < 0) { // valid
                  if(notAfterMoment.diff(nowMoment) > 0) { // valid
                    if(notAfterMoment.diff(nowMoment, 'd') < 90) {
                      var daysValid = notAfterMoment.diff(nowMoment, 'd').toString();
                      var hoursValid = notAfterMoment.diff(nowMoment, 'h') - daysValid*24;
                      this.emit('notice', path.join(dirName, certPath) + ': valid only for ' + daysValid + ' days ' + hoursValid + ' hours');
                    }
                  }
                  else { //expired
                    this.emit('notice', path.join(dirName, certPath) + ': expired ' + (-notAfterMoment.diff(nowMoment, 'd')).toString() + ' days ago');
                    return cb();
                  }
                }
                else { // not yet valid
                  this.emit('notice', path.join(dirName, certPath) + ': not yet valid for ' + (notBeforeMoment.diff(nowMoment, 'd')).toString() + ' days');
                  return cb();
                }
              }

              

              var altNames = cert.altNames;

              var keyForCert = options.read ? rawCert : certPath;
              certs[keyForCert] = cert.publicModulus;

              async.each(altNames, (domain, cb) => {
                outputConfig[domain] = {};
                outputConfig[domain].cert = options.read ? rawCert : certPath;

                this.getCaFor(certPath, (err, ca, caRaw) => {
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
  }
  
  getCertOrPem(certPath, cb) {
    this.readPart(certPath, 65536, function(err, rawCert) {
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

  isDomainCert(certs) {
    return certs.some(function(cert) {
      return cert.altNames.length > 0;
    });
  }

  caMatches(caCert, issuedCertificatedbyCA) {
    let subject = caCert.subject;
    let expectedIssuer = issuedCertificatedbyCA.issuer;
    let status =
     expectedIssuer.countryName === subject.countryName
        && expectedIssuer.organizationName === subject.organizationName
        && expectedIssuer.organizationalUnitName === subject.organizationalUnitName
        && expectedIssuer.commonName === subject.commonName
       && caCert.publicModulo === issuedCertificatedbyCA.publicModulo
       && caCert.publicExponent === issuedCertificatedbyCA.publicExponent
        ;

    return status;
  }
}

module.exports = CertScanner;
