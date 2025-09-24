'use strict';
var HttpMaster = require('../src/HttpMaster');
var expect = require('chai').expect;
require('should');
var fs = require('fs');
var path = require('path');

var testUtils = require('../src/testUtils');
var rp = require('request-promise');

describe('static middleware', function() {

  var master;
  before(function(done) {
    master = new HttpMaster();
    master.on('error', done);
    master.init({
      workerCount: 0,
      ports: {
        23441: 'static -> ./tests/static_data'
      }
    }, function(err) {
      done(err);
    });
  });

  it('should serve uncompressed test.txt', function(cb) {
    rp('http://localhost:23441/test.txt').then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });

  it('should work with gzip capable client even if no .gz variant of a file exists', function(cb) {
    rp('http://localhost:23441/test.txt', {gzip: true}).then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });
  
  it('should serve pre-compressed test2.txt to gzip capable client', function(cb) {
    rp('http://localhost:23441/test2.txt', {gzip: true}).then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });
  
  it('should 404 while sending file that is only gzipped and if client is not gzip capable', function(cb) {
    rp('http://localhost:23441/test2.txt').then(function(data) {
      expect(data).to.equal('not found');
    }).nodeify(cb);
  });
});

describe('static middleware with wildcards', function() {
  
  var wildcardMaster;
  
  before(function(done) {
    // Setup test directory structure for wildcard tests
    var testDir = './tests/wildcard_test_data';
    var webrootDir = path.join(testDir, 'webroot');
    var challengeFile = path.join(webrootDir, 'challenge123');
    
    // Create directories
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(webrootDir)) fs.mkdirSync(webrootDir);
    
    // Create test file
    fs.writeFileSync(challengeFile, 'challenge-content');
    
    wildcardMaster = new HttpMaster();
    wildcardMaster.on('error', done);
    wildcardMaster.init({
      workerCount: 0,
      ports: {
        23442: {
          '*/.well-known/acme-challenge/*': 'static -> ./tests/wildcard_test_data/webroot/[1]'
        }
      }
    }, function(err) {
      done(err);
    });
  });

  after(function() {
    // Cleanup test files
    var testDir = './tests/wildcard_test_data';
    if (fs.existsSync(testDir)) {
      if (fs.existsSync(path.join(testDir, 'webroot', 'challenge123'))) {
        fs.unlinkSync(path.join(testDir, 'webroot', 'challenge123'));
      }
      if (fs.existsSync(path.join(testDir, 'webroot'))) {
        fs.rmdirSync(path.join(testDir, 'webroot'));
      }
      fs.rmdirSync(testDir);
    }
  });

  it('should serve files through wildcard path substitution', function(cb) {
    rp('http://localhost:23442/.well-known/acme-challenge/challenge123').then(function(data) {
      expect(data).to.equal('challenge-content');
    }).nodeify(cb);
  });

  it('should return 404 for non-existent wildcard files', function(cb) {
    rp({
      uri: 'http://localhost:23442/.well-known/acme-challenge/nonexistent',
      simple: false,
      resolveWithFullResponse: true
    }).then(function(response) {
      expect(response.statusCode).to.equal(404);
    }).nodeify(cb);
  });
});

describe('static middleware with multiple wildcards', function() {
  
  var multiWildcardMaster;
  
  before(function(done) {
    // Setup test directory structure for multiple wildcard tests
    var testDir = './tests/multi_wildcard_test_data';
    var subDir = path.join(testDir, 'api', 'v1');
    var testFile = path.join(subDir, 'data.json');
    
    // Create directories
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(path.join(testDir, 'api'))) fs.mkdirSync(path.join(testDir, 'api'));
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
    
    // Create test file
    fs.writeFileSync(testFile, '{"version":"v1","data":"test"}');
    
    multiWildcardMaster = new HttpMaster();
    multiWildcardMaster.on('error', done);
    multiWildcardMaster.init({
      workerCount: 0,
      ports: {
        23443: {
          '*/api/*/data.json': 'static -> ./tests/multi_wildcard_test_data/api/[1]/data.json'
        }
      }
    }, function(err) {
      done(err);
    });
  });

  after(function() {
    // Cleanup test files
    var testDir = './tests/multi_wildcard_test_data';
    if (fs.existsSync(testDir)) {
      var testFile = path.join(testDir, 'api', 'v1', 'data.json');
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      
      var subDir = path.join(testDir, 'api', 'v1');
      if (fs.existsSync(subDir)) fs.rmdirSync(subDir);
      
      var apiDir = path.join(testDir, 'api');
      if (fs.existsSync(apiDir)) fs.rmdirSync(apiDir);
      
      fs.rmdirSync(testDir);
    }
  });

  it('should handle multiple wildcards in path substitution', function(cb) {
    rp('http://localhost:23443/api/v1/data.json').then(function(data) {
      var jsonData = JSON.parse(data);
      expect(jsonData.version).to.equal('v1');
      expect(jsonData.data).to.equal('test');
    }).nodeify(cb);
  });
});
