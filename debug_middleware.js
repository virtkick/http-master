var StaticMiddleware = require('./modules/middleware/static');
var regexpHelper = require('./src/regexpHelper');

console.log('=== Testing Static Middleware Directly ===');

// Create the middleware
var staticMiddleware = StaticMiddleware();

// Test wildcard entry parsing
var target = staticMiddleware.entryParser('./tests/wildcard_test_data/webroot/[1]');
console.log('Entry parser result:', target);

// Mock request similar to integration test
var mockReq = {
  url: '/.well-known/acme-challenge/test123',
  method: 'GET',
  headers: {},
  match: ['test123']
};

// Mock response with proper stream interface
var mockRes = {
  headers: {},
  statusCode: 200,
  getHeader: function(name) {
    return this.headers[name.toLowerCase()];
  },
  setHeader: function(name, value) {
    this.headers[name.toLowerCase()] = value;
    console.log('Set header:', name, '=', value);
  },
  write: function(data) {
    console.log('Response write:', data.length, 'bytes');
    if (!this.body) this.body = '';
    this.body += data;
    return true;
  },
  end: function(data) {
    if (data) this.write(data);
    this.ended = true;
    console.log('Response end - Status:', this.statusCode, 'Body length:', this.body ? this.body.length : 0);
  },
  on: function(event, callback) { return this; },
  once: function(event, callback) { return this; },
  removeListener: function(event, callback) { return this; },
  emit: function(event) { return this; },
  writable: true
};

var mockNext = function(err) {
  console.log('Next called with error:', err ? err.message : 'no error');
  if (err) {
    console.log('Error details:', err);
  }
};

console.log('\n=== Calling requestHandler ===');
console.log('Request URL:', mockReq.url);
console.log('Request match:', mockReq.match);
staticMiddleware.requestHandler(mockReq, mockRes, mockNext, target);

setTimeout(function() {
  console.log('\n=== Final result ===');
  console.log('Response ended:', mockRes.ended);
  console.log('Status code:', mockRes.statusCode);
  console.log('Body:', mockRes.body);
}, 100);