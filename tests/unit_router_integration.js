'use strict';
var expect = require('chai').expect;
require('should');

describe('Router Integration Debug Tests', function() {

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

  it('should test exact router->static flow that causes 500 errors', function() {
    var RouterMiddleware = require('../modules/middleware/router');
    var StaticMiddleware = require('../modules/middleware/static');
    
    // Create the exact DI structure used in http-master
    var mockDI = {
      resolve: function(name) {
        console.log('DI resolving:', name);
        if (name === 'staticMiddleware') {
          return StaticMiddleware();
        }
        throw new Error('Unknown middleware: ' + name);
      }
    };
    
    var routerMiddleware = RouterMiddleware(mockDI, {}, 80);
    
    console.log('Step 1: Router parsing wildcard static entry...');
    var entry = 'static -> ./tests/wildcard_test_data/webroot/[1]';
    var routerResult = routerMiddleware.entryParser(entry);
    
    console.log('Router result:', JSON.stringify(routerResult, function(key, value) {
      if (typeof value === 'function') return '[Function]';
      return value;
    }, 2));
    
    console.log('Step 2: Testing router requestHandler call...');
    var req = createMockRequest('test.com', '/.well-known/acme-challenge/test123');
    req.match = ['test123'];
    var res = createMockResponse();
    
    var nextCalled = false;
    var nextError = null;
    
    function mockNext(err) {
      nextCalled = true;
      nextError = err;
      console.log('Router mockNext called with error:', err);
    }
    
    try {
      // This is what actually gets called in the integration - the router's requestHandler
      console.log('Calling router requestHandler...');
      routerResult.middleware(req, res, mockNext, routerResult.dispatchTarget);
      
      console.log('After router requestHandler call:');
      console.log('- nextCalled:', nextCalled);
      console.log('- nextError:', nextError);
      console.log('- res.ended:', res.ended);
      console.log('- res.piped:', !!res.piped);
      
    } catch (error) {
      console.error('ERROR in router requestHandler:', error);
      throw error;
    }
    
    expect(nextError).to.be.null;
  });

});