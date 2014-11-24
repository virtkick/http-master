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

    it('should not start any workers by default', function() {
      Object.keys(require('cluster').workers).length.should.equal(0);
    });

    it('should reload config to empty and send event', function(cb) {
      master.once('allWorkersReloaded', cb);
      master.reload({});
    });
    it('should reload config to multiple ports and send event', function(cb) {
      master.reload({
        ports: {
          40400: {},
          40401: {},
        }
      });
      master.once('allWorkersReloaded', function() {
        setTimeout(function() {
        assurePortIsListening(40400, function() {
          assurePortIsListening(40401, function() {
            master.reload({});
            cb();
          });
        });
        }, 10);
      });
    });
  });
});