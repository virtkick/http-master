'use strict';
var assert = require('chai').assert;
var fs = require('fs.extra');
var path = require('path');

//TODO: test to find out if bad files are properly ignored
//TODO: test to find out how errors are handled

describe('SSL directory scanner', function() {
  var SslScanner = require('../src/certScanner');
  var realSslDir = path.join(__dirname, '../tests/certs/');
  var sslDir = path.join(__dirname, '../tests/.work/');
  var scanner = null;

  beforeEach(function() {
    cleanDir(sslDir);
    scanner = new SslScanner(sslDir, {
      acceptInvalidDates: true
    });
  });

  afterEach(function() {
    cleanDir(sslDir);
  });

  var useFiles = function() {
    var files = null;
    if (arguments[0] === '*') {
      files = fs.readdirSync(realSslDir);
    } else {
      files = Array.prototype.slice.call(arguments, 0);
    }

    files.forEach(function(file) {
      var parts = file.split(/:/);
      file = parts[0];
      var subdir = (parts.length > 1) ? parts[1] : '';

      var fromReal = fs.realpathSync(path.join(realSslDir, file));
      var toReal = path.join(fs.realpathSync(sslDir), subdir, file);
      fs.mkdirRecursiveSync(path.dirname(toReal));
      fs.symlinkSync(fromReal, toReal);
    });
  };

  it('finds all domains from certificate file', function(cb) {
    useFiles('unizeto-jira-e-instruments.com.pem');
    scanner.getCertOrPem(sslDir + 'unizeto-jira-e-instruments.com.pem', function(err, cert) {
      assert.sameMembers(cert.altNames, ['www.jira-e-instruments.com', 'jira-e-instruments.com']);
      cb(err);
    });
  });

  it('finds all certificates', function(cb) {
    useFiles('startssl-wildcard.pacmanvps.com.pem',
        'unizeto-jira-e-instruments.com.pem',
        'unizeto-wildcard.softwaremill.com.pem');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        'pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem'
        },
        '*.pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem'
        },
        'jira-e-instruments.com': {
          'cert': sslDir + 'unizeto-jira-e-instruments.com.pem'
        },
        'www.jira-e-instruments.com': {
          'cert': sslDir + 'unizeto-jira-e-instruments.com.pem'
        },
        'softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem'
        },
        '*.softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem'
        }
      });
      cb(err);
    });
  });

  it('finds all certificates and its CA', function(cb) {
    useFiles('startssl-wildcard.pacmanvps.com.pem', 'startssl.pem',
        'unizeto-jira-e-instruments.com.pem', 'unizeto-wildcard.softwaremill.com.pem', 'unizeto.pem');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        'pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
          'ca': sslDir + 'startssl.pem'
        },
        '*.pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
          'ca': sslDir + 'startssl.pem'
        },
        'jira-e-instruments.com': {
          'cert': sslDir + 'unizeto-jira-e-instruments.com.pem',
          'ca': sslDir + 'unizeto.pem'
        },
        'www.jira-e-instruments.com': {
          'cert': sslDir + 'unizeto-jira-e-instruments.com.pem',
          'ca': sslDir + 'unizeto.pem'
        },
        'softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem',
          'ca': sslDir + 'unizeto.pem'
        },
        '*.softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem',
          'ca': sslDir + 'unizeto.pem'
        }
      });
      cb(err);
    });
  });

  it('finds certificate and its CA when organization name and organizational unit name match', function(cb) {
    useFiles('startssl-wildcard.pacmanvps.com.pem', 'startssl.pem');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        '*.pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
          'ca': sslDir + 'startssl.pem'
        },
        'pacmanvps.com': {
          'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
          'ca': sslDir + 'startssl.pem'
        }
      });
      cb(err);
    });
  });

  it('find certificate and its CA when CA file contains many certificates', function(cb) {
    useFiles('unizeto-wildcard.softwaremill.com.pem', 'unizeto.pem');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        '*.softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem',
          'ca': sslDir + 'unizeto.pem'
        },
        'softwaremill.com': {
          'cert': sslDir + 'unizeto-wildcard.softwaremill.com.pem',
          'ca': sslDir + 'unizeto.pem'
        }
      });
      cb(err);
    });
  });

  it('reads all certificates from single CA file', function(cb) {
    useFiles('startssl.pem');

    scanner.getCaCertsFromFile(sslDir + 'startssl.pem', function(err, certs) {
      assert.equal(certs.length, 4);
      cb(err);
    });
  });

  it('reads all certificates from single CA file with some content between END and BEGIN', function(cb) {
    useFiles('unizeto.pem');

    scanner.getCaCertsFromFile(sslDir + 'unizeto.pem', function(err, certs) {
      assert.equal(certs.length, 12);
      cb(err);
    });
  });

  it('finds all certificates in subdirectories', function(cb) {
    useFiles('startssl-wildcard.pacmanvps.com.pem:pacmanvps.com',
        'unizeto-jira-e-instruments.com.pem:jira-e-instruments.com',
        'unizeto-wildcard.softwaremill.com.pem:softwaremill.com');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        'pacmanvps.com': {
          'cert': path.normalize(sslDir + 'pacmanvps.com/startssl-wildcard.pacmanvps.com.pem')
        },
        '*.pacmanvps.com': {
          'cert': path.normalize(sslDir + 'pacmanvps.com/startssl-wildcard.pacmanvps.com.pem')
        },
        'jira-e-instruments.com': {
          'cert': path.normalize(sslDir + 'jira-e-instruments.com/unizeto-jira-e-instruments.com.pem')
        },
        'www.jira-e-instruments.com': {
          'cert': path.normalize(sslDir + 'jira-e-instruments.com/unizeto-jira-e-instruments.com.pem')
        },
        'softwaremill.com': {
          'cert': path.normalize(sslDir + 'softwaremill.com/unizeto-wildcard.softwaremill.com.pem')
        },
        '*.softwaremill.com': {
          'cert': path.normalize(sslDir + 'softwaremill.com/unizeto-wildcard.softwaremill.com.pem')
        }
      });
      cb(err);
    });
  });

  it('finds all certificates and its CA in subdirectories', function(cb) {
    useFiles('startssl-wildcard.pacmanvps.com.pem:pacmanvps.com', 'startssl.pem:ca/startssl',
        'unizeto-jira-e-instruments.com.pem:jira-e-instruments.com', 'unizeto-wildcard.softwaremill.com.pem:softwaremill.com', 'unizeto.pem:ca/unizeto');

    scanner.scan(function(err, scannedConfig) {
      assert.deepEqualIgnoreOrder(scannedConfig, {
        'pacmanvps.com': {
          'cert': path.normalize(sslDir + 'pacmanvps.com/startssl-wildcard.pacmanvps.com.pem'),
          'ca': path.normalize(sslDir + 'ca/startssl/startssl.pem')
        },
        '*.pacmanvps.com': {
          'cert': path.normalize(sslDir + 'pacmanvps.com/startssl-wildcard.pacmanvps.com.pem'),
          'ca': path.normalize(sslDir + 'ca/startssl/startssl.pem')
        },
        'jira-e-instruments.com': {
          'cert': path.normalize(sslDir + 'jira-e-instruments.com/unizeto-jira-e-instruments.com.pem'),
          'ca': path.normalize(sslDir + 'ca/unizeto/unizeto.pem')
        },
        'www.jira-e-instruments.com': {
          'cert': path.normalize(sslDir + 'jira-e-instruments.com/unizeto-jira-e-instruments.com.pem'),
          'ca': path.normalize(sslDir + 'ca/unizeto/unizeto.pem')
        },
        'softwaremill.com': {
          'cert': path.normalize(sslDir + 'softwaremill.com/unizeto-wildcard.softwaremill.com.pem'),
          'ca': path.normalize(sslDir + 'ca/unizeto/unizeto.pem')
        },
        '*.softwaremill.com': {
          'cert': path.normalize(sslDir + 'softwaremill.com/unizeto-wildcard.softwaremill.com.pem'),
          'ca': path.normalize(sslDir + 'ca/unizeto/unizeto.pem')
        }
      });
      cb(err);
    });
  });


});

function cleanDir(dirPath) {
  try {
    fs.mkdirSync(dirPath);
  } catch(e) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
  }

  var files = null;
  try {
    files = fs.readdirSync(dirPath);
  } catch (ignored) {
    return;
  }

  files.forEach(function(fileName) {
    //console.log(path.join(dirPath, fileName));
    fs.rmrfSync(path.join(dirPath, fileName));
  });
}

assert.deepEqualIgnoreOrder = function(actual, expected, message) {
  var sortObjectKeys = function(unsortedObject) {
    if (typeof unsortedObject !== 'object') {
      return unsortedObject;
    }
    var sortedObject = {};
    Object.keys(unsortedObject).sort().forEach(function(k) {
      sortedObject[k] = sortObjectKeys(unsortedObject[k]);
    });
    return sortedObject;
  };
  assert.deepEqual(sortObjectKeys(actual), sortObjectKeys(expected), message);
};

