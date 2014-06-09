'use strict';
require('should');
var url = require('url');


describe('proxy middleware', function() {

  describe('entryParser', function() {
    var proxyMiddleware;
    beforeEach(function() {
      proxyMiddleware = require('../modules/middleware/proxy')({});
    });

    it('should parse target entry by port number', function() {
      var parsed = proxyMiddleware.entryParser(4040);
      parsed.host.should.equal('127.0.0.1:4040');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(false);
    });
    it('should parse target entry by port string', function() {
      var parsed = proxyMiddleware.entryParser('4040');
      parsed.host.should.equal('127.0.0.1:4040');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(false);
    });
    it('should parse target entry by ipv4 and', function() {
      var parsed = proxyMiddleware.entryParser('127.0.0.1:4040');
      parsed.host.should.equal('127.0.0.1:4040');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(false);
    });
    it('should parse target entry by localhost', function() {
      var parsed = proxyMiddleware.entryParser('localhost:4040');
      parsed.host.should.equal('localhost:4040');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(false);
    });
    it('should parse target entry by host', function() {
      var parsed = proxyMiddleware.entryParser('code2flow.com:80');
      parsed.host.should.equal('code2flow.com:80');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(false);
    });
    it('should parse target entry by host and path', function() {
      var parsed = proxyMiddleware.entryParser('code2flow.com:80/');
      parsed.host.should.equal('code2flow.com:80');
      parsed.path.should.equal('/');
      parsed.withPath.should.equal(true);
    });
  });
  describe('requestHandler', function() {
    var http = require('http').createServer().listen(61390);

  });

});