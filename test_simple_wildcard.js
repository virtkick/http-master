var HttpMaster = require('./src/HttpMaster');
var fs = require('fs');
var path = require('path');

// Create test directory and file
var testDir = './tests/simple_wildcard';
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
fs.writeFileSync(path.join(testDir, 'test123'), 'simple-wildcard-works');

var master = new HttpMaster();
master.on('error', function(err) {
  console.error('Error:', err);
  process.exit(1);
});

// Simple wildcard test without domain conflicts
master.init({
  workerCount: 0,
  ports: {
    23449: {
      'test.local/.well-known/acme-challenge/*': 'static -> ./tests/simple_wildcard/[1]'
    }
  }
}, function(err) {
  if (err) {
    console.error('Init error:', err);
    process.exit(1);
  }
  
  console.log('Master initialized successfully');
  
  var http = require('http');
  var req = http.request({
    hostname: 'localhost',
    port: 23449,
    path: '/.well-known/acme-challenge/test123',
    headers: {
      'Host': 'test.local'
    }
  }, function(res) {
    console.log('Status:', res.statusCode);
    var data = '';
    res.on('data', function(chunk) {
      data += chunk;
    });
    res.on('end', function() {
      console.log('Response:', data);
      
      // Cleanup
      fs.unlinkSync(path.join(testDir, 'test123'));
      fs.rmdirSync(testDir);
      
      if (data === 'simple-wildcard-works') {
        console.log('SUCCESS: Wildcard functionality is working!');
        process.exit(0);
      } else {
        console.log('FAILURE: Wildcard functionality not working');
        process.exit(1);
      }
    });
  });
  
  req.on('error', function(err) {
    console.error('Request error:', err);
    process.exit(1);
  });
  
  req.end();
});