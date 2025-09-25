'use strict';
var expect = require('chai').expect;
require('should');
var send = require('send');
var fs = require('fs');
var path = require('path');

describe('Send Module Debug Tests', function() {

  before(function() {
    // Create test file structure like the failing wildcard test
    var testDir = './tests/wildcard_test_data';
    var webrootDir = path.join(testDir, 'webroot');
    var challengeFile = path.join(webrootDir, 'challenge123');
    
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    if (!fs.existsSync(webrootDir)) fs.mkdirSync(webrootDir);
    fs.writeFileSync(challengeFile, 'challenge-content');
  });

  it('should test send module with wildcard-resolved path', function(done) {
    // Simulate what my wildcard implementation does
    var regexpHelper = require('../src/regexpHelper');
    
    console.log('=== Testing wildcard path resolution ===');
    
    // This is what happens in my wildcard implementation
    var staticPath = './tests/wildcard_test_data/webroot/[1]';
    var reqMatch = ['challenge123'];
    var resolvedPath = regexpHelper(staticPath, reqMatch);
    
    console.log('Original pattern:', staticPath);
    console.log('Match array:', reqMatch);
    console.log('Resolved path:', resolvedPath);
    
    // Test if the resolved path exists
    console.log('File exists:', fs.existsSync(resolvedPath));
    
    // Create mock request and response like the failing test would have
    var mockReq = {
      url: '/.well-known/acme-challenge/challenge123',
      method: 'GET',
      headers: {},
      parsedUrl: require('url').parse('/.well-known/acme-challenge/challenge123')
    };
    
    var mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: function(name, value) { 
        console.log('Setting header:', name, '=', value);
        this.headers[name] = value; 
      },
      writeHead: function(code) { 
        console.log('WriteHead called with code:', code);
        this.statusCode = code; 
      },
      write: function(data) { 
        console.log('Write called with data length:', data ? data.length : 0);
        if (!this.body) this.body = '';
        this.body += data;
      },
      end: function(data) { 
        console.log('End called with data:', data);
        if (data) this.write(data);
        this.ended = true;
        
        console.log('Final response:');
        console.log('- statusCode:', this.statusCode);
        console.log('- headers:', this.headers);
        console.log('- body:', this.body);
        
        done();
      }
    };
    
    console.log('\n=== Testing send module directly ===');
    
    // Test the exact send call that my wildcard implementation makes
    var stream = send(mockReq, mockReq.parsedUrl.pathname, {root: resolvedPath});
    
    stream.on('error', function(err) {
      console.error('Send error:', err);
      if (err.status === 404) {
        mockRes.statusCode = 404;
        mockRes.end('Not found');
      } else {
        mockRes.statusCode = 500;
        mockRes.end('Internal error: ' + err.message);
      }
    });
    
    stream.on('directory', function() {
      console.log('Send: directory event');
    });
    
    stream.on('file', function() {
      console.log('Send: file event');
    });
    
    stream.pipe(mockRes);
  });

});