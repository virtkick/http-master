var HttpMaster = require('./src/HttpMaster');

console.log('=== Testing Production Routing Configuration ===');

var master = new HttpMaster();

master.on('error', function(err) {
  console.error('HttpMaster error:', err);
  process.exit(1);
});

// Exact production configuration that's failing
console.log('Initializing with production-like config...');
master.init({
  workerCount: 0,
  ports: {
    23500: {
      router: {
        "*/.well-known/acme-challenge/*": "static -> ./tests/production-webroot/[2]",
        "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]",
        "owncloud.nowaker.net/.well-known/acme-challenge/*": "static -> ./tests/production-webroot/.well-known/acme-challenge/[1]"
      }
    }
  }
}, function(err) {
  if (err) {
    console.error('INIT FAILED:', err);
    process.exit(1);
  }
  
  console.log('✅ HttpMaster init successful!');
  
  // Test ACME challenge request
  setTimeout(function() {
    var http = require('http');
    var req = http.request({
      hostname: 'localhost',
      port: 23500,
      path: '/.well-known/acme-challenge/test123',
      headers: {
        'Host': 'owncloud.nowaker.net'
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
          console.error('❌ PRODUCTION BUG REPRODUCED: Got 302 redirect instead of serving ACME challenge');
          console.error('❌ This proves the routing priority issue exists');
        } else if (res.statusCode === 200) {
          console.log('✅ SUCCESS: ACME challenge served correctly');
        } else {
          console.log('? UNEXPECTED: Status code', res.statusCode);
        }
        
        process.exit(res.statusCode === 302 ? 1 : 0);
      });
    });
    
    req.on('error', function(err) {
      console.error('HTTP Request failed:', err.message);
      process.exit(1);
    });
    
    req.end();
  }, 100);
});