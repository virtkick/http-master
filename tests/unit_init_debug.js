'use strict';
var expect = require('chai').expect;
require('should');

describe('Initialization Debug Tests', function() {

  it('should debug initialization difference between working and failing configs', function() {
    var HttpMaster = require('../src/HttpMaster');
    
    console.log('=== Testing working static config ===');
    var workingMaster = new HttpMaster();
    
    workingMaster.on('error', function(err) {
      console.error('Working master error:', err);
      throw err;
    });
    
    // This config works (original static test)
    workingMaster.init({
      workerCount: 0,
      ports: {
        23441: 'static -> ./tests/static_data'
      }
    }, function(err) {
      if (err) {
        console.error('Working init error:', err);
        throw err;
      }
      console.log('Working config initialized successfully');
    });
    
    console.log('\n=== Testing failing wildcard config ===');
    var failingMaster = new HttpMaster();
    
    failingMaster.on('error', function(err) {
      console.error('Failing master error:', err);
      throw err;
    });
    
    // This config fails (wildcard test)
    try {
      failingMaster.init({
        workerCount: 0,
        ports: {
          23442: {
            '*/.well-known/acme-challenge/*': 'static -> ./tests/wildcard_test_data/webroot/[1]'
          }
        }
      }, function(err) {
        if (err) {
          console.error('Failing init error:', err);
          throw err;
        }
        console.log('Failing config initialized successfully');
      });
    } catch (error) {
      console.error('Exception during failing init:', error);
      throw error;
    }
    
    console.log('\nBoth configurations initialized without errors');
  });

  it('should test what happens during HTTP request simulation', function() {
    console.log('=== Testing HTTP request flow simulation ===');
    
    // Test without actual HTTP server but simulate the request flow
    var mockReq = {
      url: '/.well-known/acme-challenge/test123',
      headers: { host: 'localhost' },
      parsedUrl: require('url').parse('/.well-known/acme-challenge/test123'),
      method: 'GET'
    };
    
    var mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: function(name, value) { this.headers[name] = value; },
      writeHead: function(code) { this.statusCode = code; },
      end: function(data) { this.body = data; this.ended = true; },
      pipe: function() { this.piped = true; }
    };
    
    console.log('Mock request URL:', mockReq.url);
    console.log('Mock request host:', mockReq.headers.host);
    
    // This should help identify where the 500 error comes from
    console.log('HTTP request simulation completed');
  });

});