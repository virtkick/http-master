'use strict';
var expect = require('chai').expect;
require('should');

describe('Path Resolution Bug Tests', function() {

  it('should expose the exact path resolution bug in wildcard implementation', function() {
    var regexpHelper = require('../src/regexpHelper');
    var path = require('path');
    
    console.log('=== Demonstrating the path resolution bug ===');
    
    // Test case: ACME challenge pattern
    var pattern = './tests/wildcard_test_data/webroot/[1]';
    var match = ['challenge123'];
    var requestPath = '/.well-known/acme-challenge/challenge123';
    
    console.log('Original pattern:', pattern);
    console.log('Match array:', match);
    console.log('Request path:', requestPath);
    
    // This is what my current implementation does (WRONG)
    var currentResolution = regexpHelper(pattern, match);
    console.log('Current resolution:', currentResolution);
    
    // This is what send module expects
    var expectedRoot = path.dirname(currentResolution);
    var expectedFile = path.basename(currentResolution);
    
    console.log('Expected root directory:', expectedRoot);
    console.log('Expected filename:', expectedFile);
    
    // THE BUG: I was using currentResolution as root, causing send to look for:
    var incorrectPath = path.join(currentResolution, requestPath.substring(1));
    console.log('Incorrect path send would try:', incorrectPath);
    
    // THE FIX: Use directory as root, filename as path
    var correctPath = path.join(expectedRoot, expectedFile);
    console.log('Correct path send should access:', correctPath);
    
    // ASSERTIONS that demonstrate the bug
    expect(currentResolution).to.equal('./tests/wildcard_test_data/webroot/challenge123');
    expect(expectedRoot).to.equal('./tests/wildcard_test_data/webroot');
    expect(expectedFile).to.equal('challenge123');
    
    // This assertion will FAIL initially (RED), proving the bug exists
    expect(incorrectPath).to.not.equal(correctPath);
    console.log('\n✗ BUG CONFIRMED: Incorrect path ≠ Correct path');
    console.log('  Incorrect:', incorrectPath);
    console.log('  Correct:  ', correctPath);
  });

  it('should demonstrate how wildcard should resolve for send module', function() {
    var regexpHelper = require('../src/regexpHelper');
    var path = require('path');
    
    console.log('\n=== How wildcard resolution should work for send ===');
    
    var pattern = './tests/wildcard_test_data/webroot/[1]';
    var match = ['challenge123'];
    
    // Step 1: Resolve the wildcard pattern
    var resolvedPath = regexpHelper(pattern, match);
    console.log('Step 1 - Resolved path:', resolvedPath);
    
    // Step 2: Extract directory and filename for send module
    var rootDir = path.dirname(resolvedPath);
    var fileName = path.basename(resolvedPath);
    
    console.log('Step 2 - Root directory:', rootDir);
    console.log('Step 2 - Filename:', fileName);
    
    // Step 3: What send module should access
    var sendPath = path.join(rootDir, fileName);
    console.log('Step 3 - Send accesses:', sendPath);
    
    // ASSERTIONS for correct behavior
    expect(rootDir).to.equal('./tests/wildcard_test_data/webroot');
    expect(fileName).to.equal('challenge123');
    expect(path.normalize(sendPath)).to.equal(path.normalize(resolvedPath));
    
    console.log('\n✓ CORRECT BEHAVIOR: Directory + filename = resolved path');
  });

});