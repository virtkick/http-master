var should = require('should');
var mocha = require('mocha');
var assert = require('assert');

var processConfig = require('../friendlyConfig');

describe('domains config processor', function() {

  it('should generate \"ports\"" keys from list of ports', function() {
    assert.deepEqual(processConfig({
      http: [80, 8080],
      https: [443, 80443]
    }), {
      ports: {
        "80": {
        },
        "8080": {
        },
        "443": {
          ssl: {
          }
        },
        "80443": {
          ssl: {
          }
        }
      }
    });
  });

  it('should support ssl config per port', function() {
    assert.deepEqual(processConfig({
      https: [{
        port: 443,
        cipherList: ['CIPHER1', 'CIPHER2'],
        spdy: true
      }]
    }), {
      ports: {
        "443": {
          ssl: {
            cipherList: ['CIPHER1', 'CIPHER2'],
            spdy: true
          }
        }
      }
    });
  });

  it('should support simplified http entry', function() {
    assert.deepEqual(processConfig({
      http: true,
      https: true
    }), {
      ports: {
        "80": {},
        "443": {
          ssl: {}
        },
      }
    });
  });

  it('should support simple string keys with numerical target', function() {
    assert.deepEqual(processConfig({
      http: true,
      domains: {
        "code2flow.com:80": 4030
      }
    }), {
      ports: {
        "80": {
          proxy: {
            "code2flow.com": 4030
          }
        }
      }
    });

  });

  it('should support simple string keys with string target and path', function() {

    assert.deepEqual(processConfig({
      https: true,
      domains: {
        "code2flow.com:443/test": "redirect: https://sometarget"
      }
    }), {
      ports: {
        "443": {
          ssl: {
          },
          redirect: {
            "code2flow.com/test": "https://sometarget"
          }
        }
      }
    });

  });

});