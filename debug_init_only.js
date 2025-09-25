// Add comprehensive error handling
process.on('uncaughtException', function(err) {
  console.error('Uncaught Exception during init:', err);
  process.exit(1);
});

process.on('unhandledRejection', function(reason, promise) {
  console.error('Unhandled Rejection during init:', reason);
  process.exit(1);
});

console.log('Testing initialization only...');

var HttpMaster = require('./src/HttpMaster');

console.log('HttpMaster loaded');

var master = new HttpMaster();

console.log('HttpMaster instance created');

master.on('error', function(err) {
  console.error('HttpMaster error during init:', err);
  process.exit(1);
});

console.log('About to test initialization with wildcard config...');

// Test the exact failing configuration
master.init({
  workerCount: 0,
  ports: {
    23449: {
      'owncloud.nowaker.net': 'redirect -> https://owncloud.nowaker.net/[path]',
      'owncloud.nowaker.net/.well-known/acme-challenge/*': 'static -> ./tests/exact_server_test/.well-known/acme-challenge/[1]',
      '*/.well-known/acme-challenge/*': 'static -> ./tests/exact_server_test/.well-known/acme-challenge/[1]'
    }
  }
}, function(err) {
  if (err) {
    console.error('Init failed with error:', err);
    process.exit(1);
  }
  
  console.log('Init successful! No HTTP requests needed.');
  process.exit(0);
});

console.log('Init called, waiting for callback...');