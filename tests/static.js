'use strict';
var HttpMaster = require('../src/HttpMaster');
var expect = require('chai').expect;
require('should');

var testUtils = require('../src/testUtils');
var rp = require('request-promise');

describe('static middleware', function() {

  var master;
  before(function(done) {
    master = new HttpMaster();
    master.on('error', done);
    master.init({
      workerCount: 0,
      ports: {
        23441: 'static -> ./tests/static_data'
      }
    }, function(err) {
      done(err);
    });
  });

  it('should serve uncompressed test.txt', function(cb) {
    rp('http://localhost:23441/test.txt').then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });

  it('should work with gzip capable client even if no .gz variant of a file exists', function(cb) {
    rp('http://localhost:23441/test.txt', {gzip: true}).then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });
  
  it('should serve pre-compressed test2.txt to gzip capable client', function(cb) {
    rp('http://localhost:23441/test2.txt', {gzip: true}).then(function(data) {
      expect(data).to.equal('foo bar');
    }).nodeify(cb);
  });
  
  it('should 404 while sending file that is only gzipped and if client is not gzip capable', function(cb) {
    rp('http://localhost:23441/test2.txt').then(function(data) {
      expect(data).to.equal('not found');
    }).nodeify(cb);
  });
});
