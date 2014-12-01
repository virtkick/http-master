'use strict';
var net = require('net');
var http = require('http');
var async = require('async');
var HttpMasterWorker = require('../src/HttpMasterWorker');
require('should');
var testUtils = require('../src/testUtils');

var assurePortNotListening = testUtils.assurePortNotListening;
var assurePortIsListening = testUtils.assurePortIsListening;

function randomString() {
  return Math.random().toString(36).substring(7);
}

var url = require('url');
var parseUrl = url.parse.bind(url);
var assert = require('assert');

var listenPortNum;

function testPortConfig(portConfig, targetPort, handler) {
  var worker = new HttpMasterWorker();

  var listenConfig = {};
  listenConfig[listenPortNum] = portConfig;
  

  worker.loadConfig({
    ports: listenConfig
  }, function(err) {
    assert(!err);
  });
  var httpServer = http.createServer();
  httpServer.listen(targetPort);

  return {
    server: httpServer,
    request: function(url, requestFinish, resValidator, reqValidator, dataValidator) {
      var parsedUrl = parseUrl(url);

      var options = {
        host: 'localhost',
        port: listenPortNum,
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          host: parsedUrl.host
        }
      };
      var string = randomString();
      var serverReq;
      httpServer.once('request', function(req, res) {
        if (reqValidator) {
          reqValidator(req);
        } else {
          req.headers.host.should.equal(parsedUrl.hostname);
          req.url.should.equal(parsedUrl.path);
        }
        res.statusCode = 404;
        serverReq = req;
        res.end(string);
      });

      var req = http.request(options, function(res) {
        if (resValidator)
          resValidator(res, req);
        else
          res.statusCode.should.equal(404);
        res.on('error', requestFinish);

        res.on('data', function(data) {
          if(!dataValidator)
            data.toString().should.equal(string);
          else
            dataValidator(data.toString('utf8'));
          requestFinish(null, serverReq, res);
        });
      });
      req.string = string;
      req.on('error', requestFinish);
      req.end();


    },
    finish: function() {
      worker.loadConfig({});
      httpServer.close();
    }
  };
}


var port;

describe('HttpMasterWorker', function() {

  beforeEach(function(cb) {
    testUtils.findPorts(2, function(err, ports) {
      port = ports[0];
      listenPortNum = ports[1];
      cb(err);
    });
  });

  describe('basic operation', function() {

    var worker = new HttpMasterWorker();

    function testOpenAndCloseConfig(finished) {
      var _ports = {};
      _ports[port] = {};
      assurePortNotListening(port, function() {
        worker.loadConfig({
          ports: _ports
        }, function(err) {
          if (err) finished(err);
          assurePortIsListening(port, function() {
            worker.loadConfig({}, function(err) {
              if (err) finished(err);
              assurePortNotListening(port, function() {
                finished();
              });
            });
          });

        });
      });
    }

    it('should listen and close port appropriately to loaded config', function(finished) {
      testOpenAndCloseConfig(finished);
    });

    it('should listen and close port appropriately to loaded config - repeated', function(finished) {
      testOpenAndCloseConfig(finished);
    });

    it('should proxy multiple requests', function(finished) {
      var tester = testPortConfig({
        router: port
      }, port);

      var urls = [];
      for (var i = 0; i < 20; ++i) {
        urls.push('http://' + randomString() + '/' + randomString());
      }

      async.eachSeries(urls, function(url, cb) {
        tester.request(url, cb);
      }, function(err) {
        tester.finish();
        finished(err);
      });

    });

    it('should proxy multiple request through second layer router', function(finished) {

      var tester = testPortConfig({
        router: {
          '*': {
            '*': port
          }
        }
      }, port);

      tester.request('http://alibaba/sdfsd', function(err) {
        finished(err);
      });

    });

    it('should proxy multiple request through second layer router and some middleware', function(finished) {
      var tester = testPortConfig({
        router: {
          '*': {
            '*': [
              'addHeader -> user-agent=x-test',
              'addHeader -> user-agent-2=x-test-2',
              port
            ]
          }
        }
      }, port);

      tester.request('http://alibaba/sdfsd', function(err, req, res) {
        
        assert(req.headers['user-agent'] === 'x-test');
        assert(req.headers['user-agent-2'] === 'x-test-2');
        finished(err);
      });
    });


    it('should error out not handled request', function(finished) {
      var tester = testPortConfig({
        router: {
        }
      }, port);

      tester.request('http://alibaba/sdfsd', function(err, req, res) {
        
      }, function(res) {
        res.statusCode.should.equal(500);
      }, null, function(data) {
        data.should.equal('500 Internal Server Error');
        finished();
      });
    });

    it('should error out not handled request #2', function(finished) {
      var tester = testPortConfig({
        router: [{
          '*': {
            '*': [
              'addHeader -> user-agent=x-test',
              'addHeader -> user-agent-2=x-test-2'
            ]
          }
        }]
      }, port);

      tester.request('http://alibaba/sdfsd', function(err, req, res) {
        
      }, function(res) {
        res.statusCode.should.equal(500);
      }, null, function(data) {
        data.should.equal('500 Internal Server Error');
        finished();
      });
    });

    it('should handle router/proxy errors', function(finished) {
      testUtils.findPort(function(err, port2) {
        var tester = testPortConfig({
          router: {
            '*': port2
          }
        }, port);
        var rejectingServer = net.createServer();
        rejectingServer.listen(port2);
        rejectingServer.on('connection', function(conn) {
          conn.end();
        });
        tester.request('http://test.com', function(err) {
        }, function(res) {
          res.statusCode.should.equal(500);
        }, null, function(data) {
          data.should.equal('500 Internal Server Error');
          rejectingServer.close();
          finished();
        });
      });
      
    });

    it('should support unicode domains', function(finished) {
      var tester = testPortConfig({
        router: {
          'źdźbło.pl': port
        }
      }, port);
      tester.request('http://źdźbło.pl', function(err) {
        finished(err);
        tester.finish();
      });
    });

    it('should support http entities in requests', function(finished) {
      var tester = testPortConfig({
        router: {
          'test.pl/test%20kota/ d': port
        }
      }, port);
      tester.request('http://test.pl/test%20kota/ d', function(err) {
        finished(err);
        tester.finish();
      });

    });


    it('should redirect multiple requests', function(finished) {
      var tester = testPortConfig({
        router: {
          '*': 'redirect -> http://[1]:'+port+'/[path]'
        }
      }, port);

      var urls = [];
      for (var i = 0; i < 20; ++i) {
        urls.push('http://' + randomString() + '/' + randomString());
      }

      async.eachSeries(urls, function(url, cb) {
        tester.request(url, cb, function(res, req) {
          res.statusCode.should.equal(302);

          var parsedUrl = parseUrl(res.headers.location);
          var req2 = http.request({
            host: 'localhost',
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
              host: parsedUrl.hostname
            }
          }, function(res2) {
            res2.on('data', function(data) {
              res.emit('data', data);
            });
          });
          req2.on('error', cb);
          req2.end(req.string);

        });
      }, function(err) {
        tester.finish();
        finished(err);
      });
    });
  });

  describe('HTTPS correctness', function() {



  });

});