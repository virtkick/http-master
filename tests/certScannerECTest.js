const assert = require('assert');
const CertScanner = require('../src/certScanner');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('CertScanner EC Key Support', function() {
  const testDir = path.join(__dirname, 'fixtures', 'ec-certs');
  
  before(function() {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Generate EC private key
    execSync(`openssl ecparam -genkey -name prime256v1 -out ${testDir}/test-ec.key`);
    
    // Generate self-signed certificate with EC key
    execSync(`openssl req -new -x509 -key ${testDir}/test-ec.key -out ${testDir}/test-ec.crt -days 365 -subj "/CN=test.example.com" -addext "subjectAltName=DNS:test.example.com,DNS:*.test.example.com"`);
    
    console.log('Generated test EC certificate and key');
  });
  
  after(function() {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  it('should match EC certificates with their corresponding EC keys', function(done) {
    const scanner = new CertScanner(testDir, {});
    
    scanner.scan((err, result) => {
      if (err) return done(err);
      
      console.log('CertScanner result:', JSON.stringify(result, null, 2));
      
      // The certificate should be found
      assert(result['test.example.com'], 'Certificate for test.example.com should be found');
      
      // CRITICAL: The key should also be matched
      assert(result['test.example.com'].key, 'Key should be matched with EC certificate');
      assert(result['test.example.com'].cert, 'Certificate path should be present');
      
      // Verify paths exist
      assert(fs.existsSync(result['test.example.com'].cert), 'Certificate file should exist');
      assert(fs.existsSync(result['test.example.com'].key), 'Key file should exist');
      
      done();
    });
  });
  
  it('should also work for wildcard domains with EC certificates', function(done) {
    const scanner = new CertScanner(testDir, {});
    
    scanner.scan((err, result) => {
      if (err) return done(err);
      
      // Should find both test.example.com and *.test.example.com
      assert(result['*.test.example.com'], 'Wildcard domain should be found');
      assert(result['*.test.example.com'].key, 'Wildcard domain should have matched key');
      
      done();
    });
  });
});