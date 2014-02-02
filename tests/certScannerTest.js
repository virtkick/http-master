var should = require('should');
var mocha = require('mocha');
var assert = require('chai').assert;
var fs = require('fs');


describe('SSL directory scanner', function() {
  var SslScanner = require('../certScanner');
  var realSslDir = './tests/certs/';
  var sslDir = './tests/.work/';
  var scanner = null;

  beforeEach(function() {
    cleanDir(sslDir);
    scanner = new SslScanner(sslDir);
  });

  afterEach(function() {
    cleanDir(sslDir);
  });

  var useFiles = function() {
    var files = null;
    if (arguments[0] == '*') {
      files = fs.readdirSync(realSslDir);
      console.log(files)
    } else {
      files = Array.prototype.slice.call(arguments, 0);
    }

    files.forEach(function(file) {
      var fromReal = fs.realpathSync(realSslDir + file);
      var toReal = fs.realpathSync(sslDir) + '/' + file;
      fs.symlinkSync(fromReal, toReal);
    });
  };

  it('get all domains from certificate file', function() {
    useFiles('unizeto-jira-e-instruments.com.pem');
    domains = scanner.getDomainsFrom(sslDir + 'unizeto-jira-e-instruments.com.pem');
    assert.sameMembers(domains, ['www.jira-e-instruments.com', 'jira-e-instruments.com']);
  });

  it('find all certificates', function() {
    useFiles('startssl-wildcard.pacmanvps.com.pem',
        'unizeto-jira-e-instruments.com.pem',
        'unizeto-wildcard.softwaremill.com.pem');

    assert.deepEqualIgnoreOrder(scanner.scan(), {
      '*.pacmanvps.com': {
        'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem'
      },
      'pacmanvps.com': {
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
  });

  it('find certificate and its CA when organization name and organizational unit name match', function() {
    useFiles('startssl-wildcard.pacmanvps.com.pem', 'startssl.pem');

    assert.deepEqualIgnoreOrder(scanner.scan(), {
      '*.pacmanvps.com': {
        'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
        'ca': sslDir + 'startssl.pem'
      },
      'pacmanvps.com': {
        'cert': sslDir + 'startssl-wildcard.pacmanvps.com.pem',
        'ca': sslDir + 'startssl.pem'
      }
    });
  });
});

function cleanDir(dirPath) {
  try {
    fs.mkdirSync(dirPath);
  } catch(e) {
    if (e.code != 'EEXIST') {
      throw e;
    }
  }

  try {
    var files = fs.readdirSync(dirPath);
  } catch (ignored) {
    return;
  }

  files.forEach(function(fileName) {
    fs.unlinkSync(dirPath + '/' + fileName);
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

