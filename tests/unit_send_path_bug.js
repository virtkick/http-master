'use strict';
var expect = require('chai').expect;
require('should');
var send = require('send');
var fs = require('fs');
var path = require('path');

describe('Send Path Construction Bug Tests', function() {

  before(function() {
    // Create test file structure
    var testDir = './tests/wildcard_test_data';
    var webrootDir = path.join(testDir, 'webroot');
    var challengeFile = path.join(webrootDir, 'challenge123');
    
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(webrootDir)) fs.mkdirSync(webrootDir);
    fs.writeFileSync(challengeFile, 'challenge-content');
  });

  it('should demonstrate WRONG send usage that causes 500 errors', function(done) {
    var regexpHelper = require('../src/regexpHelper');
    
    // Simulate my current (WRONG) implementation
    var pattern = './tests/wildcard_test_data/webroot/[1]';
    var match = ['challenge123'];
    var requestPath = '/.well-known/acme-challenge/challenge123';
    
    var resolvedPath = regexpHelper(pattern, match);
    console.log('Resolved path:', resolvedPath);
    
    // WRONG: Using resolved file path as root (what my implementation does)
    var wrongRoot = resolvedPath;
    var wrongRequestPath = requestPath;
    
    console.log('\n=== WRONG APPROACH (current implementation) ===');
    console.log('Root (WRONG):', wrongRoot);
    console.log('Request path:', wrongRequestPath);
    
    var mockReq = {
      url: requestPath,
      parsedUrl: require('url').parse(requestPath),
      method: 'GET',
      headers: {}
    };
    
    var mockRes = {
      headers: {},
      getHeader: function(name) {
        return this.headers[name.toLowerCase()];
      },
      setHeader: function(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end: function(data) {
        this.body = data;
        this.ended = true;
        
        console.log('Wrong approach result:', this.statusCode, this.body);
        
        // This should be 404 or error because path is invalid
        expect(this.statusCode).to.not.equal(200);
        console.log('✗ CONFIRMED: Wrong approach fails as expected');
        
        done();
      }
    };
    
    // This will try to access: resolvedPath + requestPath
    // = ./tests/wildcard_test_data/webroot/challenge123/.well-known/acme-challenge/challenge123
    var wrongStream = send(mockReq, wrongRequestPath, {root: wrongRoot});
    
    wrongStream.on('error', function(err) {
      console.log('Wrong approach error (expected):', err.message);
      mockRes.statusCode = err.status || 500;
      mockRes.end('Error: ' + err.message);
    });
    
    wrongStream.pipe(mockRes);
  });

  it('should demonstrate CORRECT send usage that should work', function() {
    var regexpHelper = require('../src/regexpHelper');
    
    // Simulate the CORRECT implementation
    var pattern = './tests/wildcard_test_data/webroot/[1]';
    var match = ['challenge123'];
    
    var resolvedPath = regexpHelper(pattern, match);
    console.log('Resolved path:', resolvedPath);
    
    // CORRECT: Use directory as root, filename as path
    var correctRoot = path.dirname(resolvedPath);
    var correctFileName = path.basename(resolvedPath);
    
    console.log('\n=== CORRECT APPROACH (should work) ===');
    console.log('Root (CORRECT):', correctRoot);
    console.log('Filename:', correctFileName);
    
    // Test that the file actually exists at the expected location
    var expectedFullPath = path.join(correctRoot, correctFileName);
    console.log('Step 3 - Send accesses:', expectedFullPath);
    
    // Verify file exists and can be read
    var fileExists = fs.existsSync(expectedFullPath);
    var fileContent = fileExists ? fs.readFileSync(expectedFullPath, 'utf8') : null;
    
    expect(fileExists).to.be.true;
    expect(fileContent).to.equal('challenge-content');
    console.log('✓ SUCCESS: File exists and has correct content');
  });

});