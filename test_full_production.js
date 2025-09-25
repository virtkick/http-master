var HttpMaster = require('./src/HttpMaster');
var fs = require('fs');

console.log('=== Testing FULL Production Configuration ===');

// Load the EXACT production config
var prodConfig = JSON.parse(fs.readFileSync('./production-config.json', 'utf8'));

// Modify for local testing - remove user/group/log settings
delete prodConfig.user;
delete prodConfig.group;
delete prodConfig.modules;
prodConfig.workerCount = 0;

// Modify for local testing - change paths to local
prodConfig.ports['23501'] = prodConfig.ports['80'];
delete prodConfig.ports['80'];
delete prodConfig.ports['443'];

// Update webroot paths to local
var router = prodConfig.ports['23501'].router;
Object.keys(router).forEach(function(key) {
  if (router[key].includes('/etc/http-proxy/lego-webroot')) {
    router[key] = router[key].replace('/etc/http-proxy/lego-webroot', './tests/production-webroot');
  }
});

console.log('Production config routes for ACME challenges:');
Object.keys(router).forEach(function(key) {
  if (key.includes('well-known') || key.includes('owncloud.nowaker.net')) {
    console.log('  ' + key + ' -> ' + router[key]);
  }
});

var master = new HttpMaster();

master.on('error', function(err) {
  console.error('HttpMaster error:', err);
  process.exit(1);
});

// Test with exact production config
console.log('\nInitializing with FULL production config...');
master.init(prodConfig, function(err) {
  if (err) {
    console.error('INIT FAILED:', err);
    process.exit(1);
  }
  
  console.log('✅ HttpMaster init successful with full production config!');
  
  // Test ACME challenge request
  setTimeout(function() {
    var http = require('http');
    var req = http.request({
      hostname: 'localhost',
      port: 23501,
      path: '/.well-known/acme-challenge/test123',
      headers: {
        'Host': 'owncloud.nowaker.net'
      }
    }, function(res) {
      console.log('\n=== FULL PRODUCTION TEST RESULTS ===');
      console.log('HTTP Response Status:', res.statusCode);
      console.log('HTTP Response Headers:', res.headers);
      
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        console.log('HTTP Response Body:', data);
        
        if (res.statusCode === 302) {
          console.error('\n❌ PRODUCTION BUG REPRODUCED LOCALLY');
          console.error('❌ ACME challenge returns 302 redirect instead of serving file');
          console.error('❌ This confirms certificate renewal will NOT work');
        } else if (res.statusCode === 200) {
          console.log('\n✅ SUCCESS: ACME challenge served correctly with full production config');
          console.log('✅ Certificate renewal should work');
        } else {
          console.log('\n? UNEXPECTED: Status code', res.statusCode);
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