'use strict';
var expect = require('chai').expect;
require('should');

describe('Worker Debug Tests', function() {

  it('should test with actual worker vs workerCount 0', function(done) {
    var HttpMaster = require('../src/HttpMaster');
    
    var master = new HttpMaster();
    
    master.on('error', function(err) {
      console.error('HttpMaster error:', err);
      done(err);
    });
    
    console.log('Testing with workerCount: 1 (actual worker)...');
    
    // Test with actual worker instead of workerCount: 0
    master.init({
      workerCount: 1,
      ports: {
        23451: {
          'test.local': 'redirect -> https://test.local/[path]'
        }
      }
    }, function(err) {
      if (err) {
        console.error('Init error with worker:', err);
        return done(err);
      }
      
      console.log('HttpMaster init successful with worker');
      console.log('Workers created:', master.workers ? master.workers.length : 0);
      
      // Give it a moment to start
      setTimeout(function() {
        // Try to make a real HTTP request
        var http = require('http');
        var req = http.request({
          hostname: 'localhost',
          port: 23451,
          path: '/test-path',
          headers: {
            'Host': 'test.local'
          }
        }, function(res) {
          console.log('HTTP Response Status:', res.statusCode);
          console.log('HTTP Response Headers:', res.headers);
          
          var data = '';
          res.on('data', function(chunk) {
            data += chunk;
          });
          res.on('end', function() {
            console.log('HTTP Response Body:', data);
            
            if (res.statusCode === 302) {
              console.log('SUCCESS: Redirect working with actual worker!');
            } else {
              console.log('FAILURE: Expected 302, got', res.statusCode);
            }
            
            // HttpMaster doesn't have close method - just finish test
            done();
          });
        });
        
        req.on('error', function(err) {
          console.error('HTTP Request error:', err);
          master.close(function() {
            done(err);
          });
        });
        
        req.end();
      }, 500);
    });
  });

});