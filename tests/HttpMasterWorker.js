'use strict';
var net = require('net');
var http = require('http');
var async = require('async');
var HttpMasterWorker = require('../HttpMasterWorker');
require('should');
var testUtils = require('../testUtils');

var assurePortNotListening = testUtils.assurePortNotListening;
var assurePortIsListening = testUtils.assurePortIsListening;

function randomString() {
  return Math.random().toString(36).substring(7);
}

var url = require('url');
var parseUrl = url.parse.bind(url);
var assert = require('assert');

function testPortConfig(portConfig, targetPort, handler) {
  var worker = new HttpMasterWorker();

  var listenPortNum = targetPort + 1000;

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
      httpServer.once('request', function(req, res) {
        if (reqValidator) {
          reqValidator(req);
        } else {
          req.headers.host.should.equal(parsedUrl.hostname);
          req.url.should.equal(parsedUrl.path);
        }
        res.statusCode = 404;
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
          requestFinish();
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


describe('HttpMasterWorker', function() {

  describe('basic operation', function() {

    var worker = new HttpMasterWorker();

    function testOpenAndCloseConfig(finished) {
      assurePortNotListening(50880, function() {
        worker.loadConfig({
          ports: {
            50880: {}
          }
        }, function(err) {
          if (err) finished(err);
          assurePortIsListening(50880, function() {
            worker.loadConfig({}, function(err) {
              if (err) finished(err);
              assurePortNotListening(50880, function() {
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
        router: {
          '*': 50881
        }
      }, 50881);

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

    it('should handle router/proxy errors', function(finished) {
      var tester = testPortConfig({
        router: {
          '*': 50882
        }
      }, 50883);
      var rejectingServer = net.createServer();
      rejectingServer.listen(50882);
      rejectingServer.on('connection', function(conn) {
        console.log("CONNECTION");
        conn.end();
      });
      tester.request('http://test.com', function(err) {
        console.log("DONE", err);
      }, function(res) {
        res.statusCode.should.equal(500);
      }, null, function(data) {
        data.should.equal('500 Internal Server Error');
        rejectingServer.close();
        finished();
      });
    });

    it('should support unicode domains', function(finished) {
      var tester = testPortConfig({
        router: {
          'źdźbło.pl': 50884
        }
      }, 50884);
      tester.request('http://źdźbło.pl', function(err) {
        finished(err);
        tester.finish();
      });
    });

    it('should support http entities in requests', function(finished) {
      var tester = testPortConfig({
        router: {
          'test.pl/test%20kota/ d': 50885
        }
      }, 50885);
      tester.request('http://test.pl/test%20kota/ d', function(err) {
        finished(err);
        tester.finish();
      });

    });


    it('should redirect multiple requests', function(finished) {
      var tester = testPortConfig({
        router: {
          '*': 'redirect -> http://[1]:50886/[path]'
        }
      }, 50886);

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