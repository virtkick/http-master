'use strict';
require('should');
var url = require('url');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var net = require('net');
var path = require('path');
var fs = require('fs');
var assert = require('chai').assert;


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
    it('should parse target entry by protocol and host', function() {
      var parsed = proxyMiddleware.entryParser('http://code2flow.com:80');
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


    var port1 = 61380;
    var port2 = 61390;
    var proxyMiddleware;
    var server1, server2;
    server1 = require('http').createServer().listen(port1);
    server2 = require('http').createServer().listen(port2);

    function handleFullRequests(server) {
      var gotData = '';
      server.on('request', function(req, res) {
        req.on('data', function(data) {
          gotData += data.toString('utf8');
        });
        req.on('end', function() {
          setTimeout(function() {
            res.statusCode = 200;
            if(EventEmitter.listenerCount(server, 'fullRequest')) {
              server.emit('fullRequest', req, res, gotData);
            }
          }, 0);
        });
      });
    }
    beforeEach(function() {
      proxyMiddleware = require('../modules/middleware/proxy')({});
      handleFullRequests(server1);
      handleFullRequests(server2);
    });
    afterEach(function() {
      server1.removeAllListeners('request');
      server2.removeAllListeners('request');
      server1.removeAllListeners('fullRequest');
      server2.removeAllListeners('fullRequest');
    });
    function http11Request(input, cb, customPath) {
      var targetPort = port1;
      var preparedRequest = http.request({
        hostname: '127.0.0.1',
        port: 61380,
        method: 'POST',
        path: customPath || '/upload'
      }, function(res) {
        var gotData = '';
        res.on('data', function(data) {
          gotData += data.toString('utf8');
        });
        res.on('end', function() {
          cb(null, gotData);
        });
      });
      preparedRequest.write(input);
      preparedRequest.end();      
      preparedRequest.on('error', function(err) {
        cb(err);
      });
    }

    function http10Request(input, cb) {
      var opts = {
        host: '127.0.0.1',
        port: port1
      };
      var socket = net.connect(opts, function() {
        socket.write('POST / HTTP/1.0\r\n' +
             'Content-Type: application/x-www-form-urlencoded\r\n' +
             'Content-Length: ' + input.length + '\r\n' +
              '\r\n' + input);
      });
      var gotData = '';
      socket.on('data', function(data) {
        gotData += data.toString('utf8');
      });
      socket.on('end', function() {
        gotData = gotData.replace(/^[^]+\n/, '');
        cb(null, gotData);
      });
    }

    function runTestRequest(requestFunction, endCb) {
      var testString = 'alksjdlkadjlkqwjlkewqjlksdajds';
      var testString2 = 'vckxjhkhoiewruweoiuroiuweoijccc';
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:61390');
      server1.once('request', function(req, res) {
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('fullRequest', function(req, res, gotData) {
        req.headers.host.should.equal('127.0.0.1:61390');
        gotData.should.equal(testString);
        res.write(testString2);
        res.end();
      });
      requestFunction(testString, function(err, data) {
        data.should.equal(testString2);
        endCb();
      });
    }


    it('should proxy simple HTTP/1.1 requests', function(endTest) {
      runTestRequest(http11Request, endTest);
    });

    it('should proxy simple HTTP/1.0 requests', function(endTest) {
      runTestRequest(http10Request, endTest);
    });

    it('should allow to set timeout which closes request socket', function(endTest) {
      proxyMiddleware = require('../modules/middleware/proxy')({
        proxyTimeout: 10
      });

      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:61396');
      var server = net.createServer().listen(61396);
      var connCounter = 0;
      server.on('connection', function(connection) {
        connCounter++;
      });

      server1.once('request', function(req, res) {
        proxyMiddleware.requestHandler(req, res, function(err) {
          
       }, parsedTarget);
      });
      http11Request('hello', function(err, data) {
        if(err) {
          err.code.should.equal('ECONNRESET');
          connCounter.should.equal(1);
          return endTest();
        }
        assert(false, "Err was expected");
      });
    });

    it('should allow to set timeout and call next(err) when times out', function(endTest) {
      proxyMiddleware = require('../modules/middleware/proxy')({
        proxyTargetTimeout: 10
      });

      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:61395');
      var server = net.createServer().listen(61395);
      var connCounter = 0;
      server.on('connection', function(connection) {
        connCounter++;
      });

      server1.once('request', function(req, res) {
        proxyMiddleware.requestHandler(req, res, function(err) {
          err.code.should.equal('ECONNRESET');
          res.end("Got timeout but we can report it!");
        }, parsedTarget);
      });
      http11Request('hello', function(err, data) {
        if(err) {
          return endTest(err);
        }
        data.should.equal('Got timeout but we can report it!');
        connCounter.should.equal(1);
        endTest();
      });
    });

    it('should handle requests with hostMatch and pathMatch', function(endTest) {
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+port2 + '/[1]/[2]');

      server1.once('request', function(req, res) {
        req.hostMatch = 'foo'.match(/(foo)/);
        req.pathMatch = 'bar'.match(/(bar)/);
        req.parsedUrl = url.parse(req.url);
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('request', function(req, res) {
        req.url.should.equal('/foo/bar');
        endTest();
      });
      http11Request('hello', function(err, data) {});
    });

    it('should handle requests with pathMatch and missing match', function(endTest) {
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+port2 + '/[1]/[2]');

      server1.once('request', function(req, res) {
        req.pathMatch = 'bar'.match(/(bar)/);
        req.parsedUrl = url.parse(req.url);
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('request', function(req, res) {
        req.url.should.equal('/bar/[2]');
        endTest();
      });
      http11Request('hello', function(err, data) {});
    });

    it('should pass query parameters to target server', function(endTest) {
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+port2 + '');

      server1.once('request', function(req, res) {
        req.hostMatch = 'foo'.match(/(foo)/);
        req.pathMatch = 'bar'.match(/(bar)/);
        req.parsedUrl = url.parse(req.url);
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('request', function(req, res) {
        req.url.should.equal('/upload?dupa');
        endTest();
      });
      http11Request('hello', function(err, data) {
      }, '/upload?dupa');
    });
    it('should proxy web sockets', function(endTest) {
      var WebSocketServer = require('ws').Server;
      var WebSocket = require('ws');
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:60000');

      var ws = new WebSocket('ws://localhost:' + port1);

      ws.on('open',  function() {

      });
      ws.on('message', function(msg) {
        assert(msg === 'something');
        ws.send('else');
      });

      server1.on('upgrade', function(req, socket, head) {
        req.upgrade = {
          socket: socket,
          head: head
        };
        proxyMiddleware.requestHandler(req, {}, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });

      var wss = new WebSocketServer({port: 60000});
      wss.on('connection', function(ws) {
          ws.on('message', function(message) {
              message.should.equal('else');
              endTest();
          });
          ws.send('something');
      });
    });
  });
});