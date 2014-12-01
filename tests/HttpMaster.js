'use strict';
var HttpMaster = require('../src/HttpMaster');
var assert = require('chai').assert;
require('should');

var testUtils = require('../src/testUtils');
var assurePortNotListening = testUtils.assurePortNotListening;
var assurePortIsListening = testUtils.assurePortIsListening;

describe('HttpMaster', function() {

  describe('with empty config and undefined workers', function() {

    var master;

    beforeEach(function(done) {
      master = new HttpMaster();
      master.on('error', done);
      master.init({
      }, function(err) {
        done(err);
      });
    });

    var port1, port2;
    before(function(cb) {
      testUtils.findPorts(2, function(err, ports) {
        port1 = ports[0];
        port2 = ports[1];
        cb(err);
      });
    });

    it('should not start any workers by default', function() {
      Object.keys(require('cluster').workers).length.should.equal(0);
    });

    it('should reload config to empty and send event', function(cb) {
      master.once('allWorkersReloaded', cb);
      master.reload({});
    });
    it('should reload config to multiple ports and send event', function(cb) {
      var ports = {};
      ports[port1] = {};
      ports[port2] = {};
      master.reload({
        ports: ports
      });
      master.once('allWorkersReloaded', function() {
        setTimeout(function() {
        assurePortIsListening(port1, function() {
          assurePortIsListening(port2, function() {
            master.reload({});
            cb();
          });
        });
        }, 10);
      });
    });
  });
});