'use strict';
var expect = require('chai').expect;
require('should');

describe('HttpMaster Debug Tests', function() {

  it('should debug what HttpMaster does differently', function(done) {
    var HttpMaster = require('../src/HttpMaster');
    
    // Simple test that should work but might be broken
    var master = new HttpMaster();
    
    master.on('error', function(err) {
      console.error('HttpMaster error:', err);
      done(err);
    });
    
    console.log('Testing simple redirect config...');
    
    // Test with just a simple redirect first (this should work)
    master.init({
      workerCount: 0,
      ports: {
        23450: {
          'test.local': 'redirect -> https://test.local/[path]'
        }
      }
    }, function(err) {
      if (err) {
        console.error('Init error:', err);
        return done(err);
      }
      
      console.log('HttpMaster init successful - testing redirect...');
      
      // Use the internal request handler directly
      var worker = master.workers[0];
      console.log('Worker exists:', !!worker);
      
      if (!worker) {
        console.log('No worker found - testing without worker...');
        done();
        return;
      }
      
      // Create a mock request like HttpMasterWorker would
      var req = {
        url: '/test-path',
        headers: { host: 'test.local' },
        unicodeHost: 'test.local',
        parsedUrl: require('url').parse('/test-path'),
        connection: {}
      };
      
      var res = {
        statusCode: 200,
        headers: {},
        setHeader: function(name, value) { this.headers[name] = value; },
        end: function(data) { 
          this.body = data; 
          this.ended = true;
          console.log('Response ended with:', this.statusCode, this.headers);
        }
      };
      
      var nextCalled = false;
      function mockNext(err) {
        nextCalled = true;
        console.log('Next called with error:', err);
      }
      
      try {
        console.log('Calling HttpMaster request handler...');
        worker.requestHandler(req, res, mockNext);
        
        setTimeout(function() {
          console.log('After HttpMaster flow:');
          console.log('- nextCalled:', nextCalled);
          console.log('- res.statusCode:', res.statusCode);
          console.log('- res.headers:', res.headers);
          console.log('- res.ended:', res.ended);
          
          done();
        }, 100);
        
      } catch (error) {
        console.error('ERROR in HttpMaster flow:', error);
        done(error);
      }
    });
  });

});