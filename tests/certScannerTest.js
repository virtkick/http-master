var should = require('should');
var mocha = require('mocha');
var assert = require('chai').assert;
var fs = require('fs');


describe('SSL directory scanner', function() {
  var SslScanner = require('../certScanner');
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
    Array.prototype.slice.call(arguments, 0).forEach(function(file) {
      var fromReal = fs.realpathSync('./tests/certs/' + file);
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

    // TODO: This assert depends on hash order. It shouldn't.
    assert.deepEqual(scanner.scan(), {
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
  }
  catch (ignored) {
    return;
  }

  files.forEach(function(fileName) {
    fs.unlinkSync(dirPath + '/' + fileName);
  });
}
