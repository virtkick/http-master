const assert = require('assert');
const CertScanner = require('../src/certScanner');
const path = require('path');

describe('CertScanner CA File Inclusion', () => {
  it('should include CA files in scan output when .ca files exist', (done) => {
    // RED PHASE: This test should FAIL because CA files aren't included
    const sslDir = path.resolve(__dirname, '../testdata/ssl-ca-test');
    const scanner = new CertScanner(sslDir, {});
    
    scanner.scan((err, config) => {
      if (err) return done(err);
      
      console.log('=== CA Test Results ===');
      console.log(JSON.stringify(config, null, 2));
      
      // Test that owncloud.nowaker.net has all three components
      assert(config['owncloud.nowaker.net'], 'Domain owncloud.nowaker.net should exist');
      assert(config['owncloud.nowaker.net'].cert, 'cert should be present');
      assert(config['owncloud.nowaker.net'].key, 'key should be present');
      
      // This assertion should FAIL in RED phase
      assert(config['owncloud.nowaker.net'].ca, 'CA should be present but is missing!');
      assert(config['owncloud.nowaker.net'].ca.includes('.ca'), 'CA should reference .ca file');
      
      done();
    });
  });
});