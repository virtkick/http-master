'use strict';
var HttpMaster = require('../src/HttpMaster');
var expect = require('chai').expect;
require('should');
var rp = require('request-promise');

describe('ACME Challenge Routing Priority', function() {

  var master;
  
  before(function(done) {
    // Setup test directory structure for ACME challenge
    var fs = require('fs');
    var path = require('path');
    var testDir = './tests/acme-priority-test';
    var webrootDir = path.join(testDir, '.well-known', 'acme-challenge');
    
    // Create directories
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(path.join(testDir, '.well-known'))) fs.mkdirSync(path.join(testDir, '.well-known'));
    if (!fs.existsSync(webrootDir)) fs.mkdirSync(webrootDir);
    
    // Create test challenge file
    fs.writeFileSync(path.join(webrootDir, 'test-challenge'), 'challenge-token-content');
    
    master = new HttpMaster();
    master.on('error', done);
    
    // Configuration reproducing the exact production routing conflict
    master.init({
      workerCount: 0,
      ports: {
        23503: {
          router: {
            "*/.well-known/acme-challenge/*": "static -> ./tests/acme-priority-test/[2]",
            "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]"
          }
        }
      }
    }, function(err) {
      done(err);
    });
  });

  after(function() {
    // Cleanup test files
    var fs = require('fs');
    var path = require('path');
    var testDir = './tests/acme-priority-test';
    if (fs.existsSync(testDir)) {
      if (fs.existsSync(path.join(testDir, '.well-known', 'acme-challenge', 'test-challenge'))) {
        fs.unlinkSync(path.join(testDir, '.well-known', 'acme-challenge', 'test-challenge'));
      }
      if (fs.existsSync(path.join(testDir, '.well-known', 'acme-challenge'))) {
        fs.rmdirSync(path.join(testDir, '.well-known', 'acme-challenge'));
      }
      if (fs.existsSync(path.join(testDir, '.well-known'))) {
        fs.rmdirSync(path.join(testDir, '.well-known'));
      }
      fs.rmdirSync(testDir);
    }
  });

  it('should prioritize ACME challenge wildcards over exact domain redirects', function(cb) {
    // This test demonstrates the routing priority issue
    // ACME challenge requests should be served by static middleware
    // NOT redirected by general domain rules
    
    rp('http://localhost:23503/.well-known/acme-challenge/test-challenge', {
      headers: { 'Host': 'owncloud.nowaker.net' }
    }).then(function(data) {
      // If we get here, status was 200 (success)
      expect(data).to.equal('challenge-token-content');
      console.log('✅ SUCCESS: ACME challenge served correctly, not redirected');
    }).nodeify(cb);
  });

  it('should redirect non-ACME requests to HTTPS as normal', function(cb) {
    // This test verifies that normal requests still get redirected
    // Only ACME challenges should bypass the redirect
    
    rp({
      uri: 'http://localhost:23503/normal-path',
      headers: { 'Host': 'owncloud.nowaker.net' },
      simple: false,
      resolveWithFullResponse: true
    }).then(function(response) {
      expect(response.statusCode).to.equal(302);
      expect(response.headers.location).to.include('https://owncloud.nowaker.net/normal-path');
      console.log('✅ SUCCESS: Normal requests still redirected to HTTPS');
    }).nodeify(cb);
  });

});