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
    config.should.have.key("ports");
    config.ports.should.have.key("80");
    config.ports.should.have.key("8080");
    config.ports.should.have.key("443");
    config.ports.should.have.key("80443");


  });

  it('should support simple string keys', function() {




  });

});

