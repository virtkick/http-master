var should = require('should');
var mocha = require('mocha');
var assert = require('chai').assert;


describe('SSL directory scanner', function() {
  var SslScanner = require('../certScanner');
  var sslDir = './tests/certs/';
  var scanner = new SslScanner(sslDir);

  it('get all domains from certificate file', function() {
    domains = scanner.getDomainsFrom(sslDir + 'unizeto-jira-e-instruments.com.pem');
    assert.sameMembers(domains, ['www.jira-e-instruments.com', 'jira-e-instruments.com']);
  });

  it('scan and build SSL config', function() {
    // TODO: This assert depends on hash order. It shouldn't.
    assert.sameMembers(scanner.scan(), {
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