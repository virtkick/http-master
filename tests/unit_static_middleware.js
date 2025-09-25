'use strict';
var StaticMiddleware = require('../modules/middleware/static');
var expect = require('chai').expect;
require('should');

describe('Static Middleware unit tests', function() {

  function createMockRequest(url, match) {
    return {
      url: url,
      parsedUrl: require('url').parse(url),
      match: match || []
    };
  }

  function createMockResponse() {
    var res = {
      headers: {},
      statusCode: 200,
      setHeader: function(name, value) { this.headers[name] = value; },
      end: function(data) { this.body = data; },
      pipe: function() { this.piped = true; }
    };
    return res;
  }

  it('should create normal middleware for non-wildcard paths', function() {
    var staticMiddleware = StaticMiddleware();
    var result = staticMiddleware.entryParser('./tests/static_data');
    
    console.log('Normal path result:', JSON.stringify(result, null, 2));
    
    expect(result).to.have.property('middleware');
    expect(result).to.have.property('entry', './tests/static_data');
    expect(result).to.not.have.property('isWildcard');
  });

  it('should create wildcard target for wildcard paths', function() {
    var staticMiddleware = StaticMiddleware();
    var result = staticMiddleware.entryParser('./webroot/[1]');
    
    console.log('Wildcard path result:', JSON.stringify(result, null, 2));
    
    expect(result).to.have.property('entry', './webroot/[1]');
    expect(result).to.have.property('isWildcard', true);
    expect(result).to.not.have.property('middleware');
  });

  it('should resolve wildcard paths correctly during request handling', function() {
    var staticMiddleware = StaticMiddleware();
    var target = { entry: './tests/simple_wildcard/[1]', isWildcard: true };
    var req = createMockRequest('/.well-known/acme-challenge/test123', ['test123']);
    var res = createMockResponse();
    
    var nextCalled = false;
    var nextError = null;
    
    function mockNext(err) {
      nextCalled = true;
      nextError = err;
    }
    
    console.log('Testing wildcard request handling...');
    console.log('Target:', JSON.stringify(target, null, 2));
    console.log('Request URL:', req.url);
    console.log('Request match:', req.match);
    
    // This should resolve the wildcard pattern
    staticMiddleware.requestHandler(req, res, mockNext, target);
    
    console.log('After requestHandler - nextCalled:', nextCalled, 'nextError:', nextError);
    
    // The wildcard path should be resolved
    expect(nextCalled).to.be.false; // Should not call next() if successful
    expect(nextError).to.be.null;
  });

});