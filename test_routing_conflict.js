var HttpMaster = require('./src/HttpMaster');

console.log('=== Testing Routing Conflict: ACME vs Redirect ===');

var master = new HttpMaster();

master.on('error', function(err) {
  console.error('HttpMaster error:', err);
  process.exit(1);
});

// Minimal config reproducing the exact routing conflict
console.log('Testing routing conflict...');
master.init({
  workerCount: 0,
  ports: {
    23502: {
      router: {
        "*/.well-known/acme-challenge/*": "static -> ./tests/production-webroot/[2]",
        "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]"
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
      port: 23502,
      path: '/.well-known/acme-challenge/test123',
      headers: {
        'Host': 'owncloud.nowaker.net'
      }
    }, function(res) {
      console.log('\n=== ROUTING CONFLICT TEST RESULTS ===');
      console.log('HTTP Response Status:', res.statusCode);
      
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        console.log('HTTP Response Body:', data);
        
        if (res.statusCode === 302) {
          console.error('\n❌ ROUTING CONFLICT REPRODUCED LOCALLY');
          console.error('❌ General redirect overrides ACME challenge');
          console.error('❌ My routing priority fix is NOT working');
        } else if (res.statusCode === 200) {
          console.log('\n✅ SUCCESS: ACME challenge takes priority over redirect');
          console.log('✅ Routing priority fix works correctly');
        } else {
          console.log('\n? Status code:', res.statusCode);
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