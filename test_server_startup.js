var HttpMaster = require('./src/HttpMaster');

console.log('=== Testing HTTP server startup with wildcards ===');

var master = new HttpMaster();

master.on('error', function(err) {
  console.error('HttpMaster error:', err);
  process.exit(1);
});

// Test the exact configuration that's failing
console.log('Initializing HttpMaster with wildcard config...');
master.init({
  workerCount: 0,
  ports: {
    23445: {
      '*/.well-known/acme-challenge/*': 'static -> ./tests/wildcard_test_data/webroot/[1]'
    }
  }
}, function(err) {
  if (err) {
    console.error('INIT FAILED:', err);
    process.exit(1);
  }
  
  console.log('✅ HttpMaster init successful!');
  console.log('Server should be running on port 23445');
  
  // Test if server is actually listening
  setTimeout(function() {
    var http = require('http');
    var req = http.request({
      hostname: 'localhost',
      port: 23445,
      path: '/.well-known/acme-challenge/test123'
    }, function(res) {
      console.log('HTTP Response Status:', res.statusCode);
      console.log('✅ Server is responding!');
      process.exit(0);
    });
    
    req.on('error', function(err) {
      console.error('HTTP Request failed:', err.message);
      console.error('❌ Server is not responding');
      process.exit(1);
    });
    
    req.end();
  }, 100);
});