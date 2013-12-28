var should = require('should');
var mocha = require('mocha');
var assert = require('assert');

var processConfig = require('../friendlyConfig');

describe('domains config processor', function() {

  it('should generate \"ports\"" keys from list of ports', function() {
    var config = {
      http: [80, 8080],
      https: [443, 80443]
    };
    var config = processConfig(config);
    config.should.have.property("ports");
    config.ports.should.have.property("80");
    config.ports.should.have.property("8080");
    config.ports.should.have.property("443");
    config.ports.should.have.property("80443");
  });

  it('should support ssl config per port', function() {
    var config = {
      https: [{port: 443, cipherList: ['CIPHER1', 'CIPHER2'], spdy: true}]
    };
    var config = processConfig(config);
    config.should.have.property("ports");
    config.ports.should.have.property("443");
    config.ports[443].should.have.property('ssl');
    config.ports[443].ssl.should.have.property('cipherList');


  });

  it('should support simplified http entry', function() {
    var config = {
      http: true,
      https: true
    };
    var config = processConfig(config);
    config.should.have.property("ports");
    config.ports.should.have.property("80");
    config.ports.should.have.property("443");
  });

  it('should support simple string keys', function() {
    var config = {
      http: true,
      domains: {
        "code2flow.com:80": 4030
      }
    };
    var config = processConfig(config);
    config.ports.should.have.property("80");
    config.ports["80"].should.have.property("code2flow.com");
    config.ports["80"]["code2flow.com"].should.equal(4030);
  });

});

