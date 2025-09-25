'use strict';
var expect = require('chai').expect;
require('should');
var url = require('url');

describe('HTTP Flow Debug Tests', function() {

  function createRealRequest(host, path) {
    return {
      headers: { host: host },
      unicodeHost: host,
      parsedUrl: url.parse(path),
      url: path,
      method: 'GET',
      match: []
    };
  }

  function createRealResponse() {
    var res = {
      headers: {},
      statusCode: 200,
      headersSent: false,
      setHeader: function(name, value) { 
        if (!this.headersSent) {
          this.headers[name] = value; 
        }
      },
      writeHead: function(code, headers) {
        this.statusCode = code;
        if (headers) {
          Object.assign(this.headers, headers);
        }
        this.headersSent = true;
      },
      write: function(data) { 
        if (!this.body) this.body = '';
        this.body += data; 
      },
      end: function(data) { 
        if (data) this.write(data);
        this.ended = true; 
      },
      pipe: function(stream) { 
        this.piped = stream; 
        return this; 
      }
    };
    return res;
  }

  it('should test complete HTTP flow without HTTP server', function() {
    // Test the complete flow: DispatchTable -> Router -> Static
    var DispatchTable = require('../src/DispatchTable');
    var RouterMiddleware = require('../modules/middleware/router');
    var StaticMiddleware = require('../modules/middleware/static');
    
    var mockDI = {
      resolve: function(name) {
        console.log('DI resolving:', name);
        if (name === 'staticMiddleware') {
          return StaticMiddleware();
        }
        if (name === 'redirectMiddleware') {
          return require('../modules/middleware/redirect')();
        }
        throw new Error('Unknown middleware: ' + name);
      }
    };
    
    var routerMiddleware = RouterMiddleware(mockDI, {}, 80);
    
    // Test configuration that matches the failing integration test
    var config = {
      'owncloud.nowaker.net': 'redirect -> https://owncloud.nowaker.net/[path]',
      'owncloud.nowaker.net/.well-known/acme-challenge/*': 'static -> ./tests/wildcard_test_data/webroot/[1]'
    };
    
    console.log('Step 1: Creating DispatchTable...');
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: routerMiddleware.entryParser,
      requestHandler: routerMiddleware.requestHandler
    });
    
    console.log('Step 2: Testing ACME challenge request...');
    var req = createRealRequest('owncloud.nowaker.net', '/.well-known/acme-challenge/test123');
    var res = createRealResponse();
    
    var nextCalled = false;
    var nextError = null;
    
    function mockNext(err) {
      nextCalled = true;
      nextError = err;
      console.log('Final mockNext called with error:', err);
    }
    
    try {
      console.log('Calling dispatchTable.dispatchRequest...');
      dispatchTable.dispatchRequest(req, res, mockNext);
      
      console.log('After full HTTP flow:');
      console.log('- nextCalled:', nextCalled);
      console.log('- nextError:', nextError);
      console.log('- res.ended:', res.ended);
      console.log('- res.statusCode:', res.statusCode);
      console.log('- res.body:', res.body);
      console.log('- res.piped:', !!res.piped);
      
    } catch (error) {
      console.error('ERROR in complete HTTP flow:', error);
      throw error;
    }
    
    expect(nextError).to.be.null;
  });

});