'use strict';
var expect = require('chai').expect;
require('should');

describe('Integration Debug Unit Tests', function() {

  function createMockRequest(host, path) {
    return {
      headers: { host: host },
      unicodeHost: host,
      parsedUrl: require('url').parse(path),
      url: path,
      match: []
    };
  }

  function createMockResponse() {
    var res = {
      headers: {},
      statusCode: 200,
      setHeader: function(name, value) { this.headers[name] = value; },
      end: function(data) { this.body = data; this.ended = true; },
      pipe: function(stream) { this.piped = stream; return this; }
    };
    return res;
  }

  it('should test router->static middleware integration for wildcards', function() {
    // Test the full pipeline: router middleware -> static middleware
    var RouterMiddleware = require('../modules/middleware/router');
    var StaticMiddleware = require('../modules/middleware/static');
    
    // Create a mock DI that resolves staticMiddleware
    var mockDI = {
      resolve: function(name) {
        if (name === 'staticMiddleware') {
          return StaticMiddleware();
        }
        throw new Error('Unknown middleware: ' + name);
      }
    };
    
    var routerMiddleware = RouterMiddleware(mockDI, {}, 80);
    
    console.log('Testing router entryParser with wildcard static entry...');
    
    // Test what the router does with a wildcard static entry
    var entry = 'static -> ./tests/wildcard_test_data/webroot/[1]';
    var parsedEntry;
    
    try {
      parsedEntry = routerMiddleware.entryParser(entry);
      console.log('Router entryParser result:', JSON.stringify(parsedEntry, null, 2));
    } catch (error) {
      console.error('ERROR in router entryParser:', error);
      throw error;
    }
    
    // Now test what happens when we call the static middleware requestHandler
    var req = createMockRequest('test.com', '/.well-known/acme-challenge/test123');
    req.match = ['test123']; // Simulate what DispatchTable would set
    var res = createMockResponse();
    
    var nextCalled = false;
    var nextError = null;
    
    function mockNext(err) {
      nextCalled = true;
      nextError = err;
      console.log('mockNext called with error:', err);
    }
    
    console.log('Testing static middleware requestHandler with wildcard target...');
    console.log('Request:', req.url, 'Host:', req.headers.host, 'Match:', req.match);
    
    try {
      // This should be what actually gets called in the integration
      parsedEntry.middleware(req, res, mockNext, parsedEntry.dispatchTarget);
      
      console.log('After static middleware call:');
      console.log('- nextCalled:', nextCalled);
      console.log('- nextError:', nextError);
      console.log('- res.ended:', res.ended);
      console.log('- res.piped:', !!res.piped);
      
    } catch (error) {
      console.error('ERROR in static middleware requestHandler:', error);
      throw error;
    }
    
    expect(nextError).to.be.null;
  });

});