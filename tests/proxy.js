'use strict';
require('should');
var url = require('url');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var net = require('net');
var assert = require('chai').assert;
var testUtils = require('../src/testUtils');

describe('proxy middleware', function() {

  describe('entryParser', function() {
    var proxyMiddleware;
    beforeEach(function() {
      proxyMiddleware = require('../modules/middleware/proxy')({}, {});
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
    var port1;
    var port2;
    var proxyMiddleware;
    var server1, server2;

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

    beforeEach(function(cb) {
      testUtils.findPorts(2, function(err, ports) {
        port1 = ports[0];
        port2 = ports[1];
        server1 = require('http').createServer().listen(port1);
        server2 = require('http').createServer().listen(port2);
        server2.on('listening', function() {
          proxyMiddleware = require('../modules/middleware/proxy')({}, {});
          handleFullRequests(server1);
          handleFullRequests(server2);
          cb();
        });
      });
    });

    afterEach(function() {
      server1.removeAllListeners('request');
      server2.removeAllListeners('request');
      server1.removeAllListeners('fullRequest');
      server2.removeAllListeners('fullRequest');
    });
    function http11Request(input, cb, customPath) {
      var preparedRequest = http.request({
        hostname: '127.0.0.1',
        port: port1,
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
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:' + port2);

      server1.once('request', function(req, res) {
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('fullRequest', function(req, res, gotData) {
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

    it('should allow to set proxy agent', function(endTest) {
      var agentSettings = {
        keepAlive: true,
        maxSockets: 10
      };
      var proxyMiddleware = require('../modules/middleware/proxy');
      var proxyWithNoAgent = proxyMiddleware({}, {});
      var proxyWithConfigAgent = proxyMiddleware({
        agentSettings: agentSettings
      }, {});
      var proxyWithPortConfigAgent = proxyMiddleware({}, {
        agentSettings: agentSettings
      });

      var parsedTarget = proxyWithConfigAgent.entryParser('127.0.0.1:61345');
      var server = net.createServer().listen(61345);

      server1.on('request', function(req, res) {
        proxyWithConfigAgent.requestHandler(req, res, function() {}, parsedTarget);
        req.__agent.maxSockets.should.equal(agentSettings.maxSockets);
        proxyWithNoAgent.requestHandler(req, res, function () {}, parsedTarget);
        req.__agent.should.equal(false);
        proxyWithPortConfigAgent.requestHandler(req, res, function () {}, parsedTarget);
        req.__agent.maxSockets.should.equal(agentSettings.maxSockets);
        res.end();
      });
      http11Request('hello', function(err, data) {
        server.close();
        endTest();
      });
    });

    it('should allow to set timeout which closes request socket', function(endTest) {
      proxyMiddleware = require('../modules/middleware/proxy')({}, {
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
        server.close();
        if(err) {
          err.code.should.equal('ECONNRESET');
          connCounter.should.equal(1);
          return endTest();
        }
        assert(false, "Err was expected");
      });
    });

    var listenPort;
    before(function(cb) {
      testUtils.findPort(function(err, num) {
        listenPort = num;
        cb();
      });
    });

    it('should allow to set timeout and call next(err) when times out', function(endTest) {
      proxyMiddleware = require('../modules/middleware/proxy')({}, {
        proxyTargetTimeout: 10
      });

      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+listenPort);
      var server = net.createServer().listen(listenPort);
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

    it('should handle requests with match', function(endTest) {
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+port2 + '/[1]/[2]');

      server1.once('request', function(req, res) {
        var hostMatch = 'foo'.match(/(foo)/);
        var pathMatch = 'bar'.match(/(bar)/);
        req.match = [].concat(hostMatch.slice(1)).concat(pathMatch.slice(1));
        req.parsedUrl = url.parse(req.url);
        proxyMiddleware.requestHandler(req, res, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });
      server2.once('request', function(req, res) {
        req.url.should.equal('/foo/bar');
        endTest();
      });
      http11Request('hello', function(err, data) {}, '/1/2');
    });

    it('should pass query parameters to target server', function(endTest) {
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+port2 + '');
      server1.once('request', function(req, res) {
        req.hostMatch = 'foo'.match(/(foo)/);
        req.pathMatch = 'bar'.match(/(bar)/);
        req.match = [req.hostMatch.slice(1), req.pathMatch.slice(1)];
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


    var wsPort;
    before(function(cb) {
      testUtils.findPort(function(err, num) {
        wsPort = num;
        cb();
      });
    });


    it('should proxy web sockets', function(endTest) {
      var WebSocketServer = require('ws').Server;
      var WebSocket = require('ws');
      var parsedTarget = proxyMiddleware.entryParser('127.0.0.1:'+wsPort);

      var ws;

      server1.on('upgrade', function(req, socket, head) {
        req.upgrade = {
          socket: socket,
          head: head
        };
        proxyMiddleware.requestHandler(req, {}, function(err) {
          assert(false, "next should not be called, error has occured");
        }, parsedTarget);
      });

      var wss = new WebSocketServer({port: wsPort});
      wss.on('connection', function(ws) {
          ws.on('message', function(message) {
              message.should.equal('else');
              endTest();
          });
          ws.send('something');
      });
      wss.on('listening', function() {
        ws = new WebSocket('ws://localhost:' + port1);

        ws.on('open',  function() {

        });
        ws.on('message', function(msg) {
          assert(msg === 'something');
          ws.send('else');
        });
      });
    });
  });
});
