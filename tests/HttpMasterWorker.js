'use strict';
var net = require('net');
var http = require('http');
var async = require('async');
var HttpMasterWorker = require('../HttpMasterWorker');

function assurePortNotListening(port, cb) {
  var client = net.connect({
      port: port
    },
    function() {
      throw new Error('Port ' + port + ' should have been not listening');
    });
  client.once('error', function(err) {
    cb();
  });
}

function assurePortIsListening(port, cb) {
  var client = net.connect({
      port: port
    },
    function() {
      cb();
    });
  client.once('error', function(err) {
    throw new Error('Port ' + port + ' should have been listening');
  });
}



function randomString() {
  return Math.random().toString(36).substring(7);
}


var url = require('url');
var parseUrl = url.parse.bind(url);
var assert = require('assert');

function testPortConfig(portConfig, targetPort, handler) {
  var worker = new HttpMasterWorker();
  worker.loadConfig({
    ports: {
      40880: portConfig
    }
  }, function(err) {
    assert(!err);
  });
  var httpServer = http.createServer();
  httpServer.listen(targetPort);

  return {
    server: httpServer,
    request: function(url, requestFinish, resValidator, reqValidator) {
      var parsedUrl = parseUrl(url);

      var options = {
        host: 'localhost',
        port: 40880,
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
          data.toString().should.equal(string);
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
      assurePortNotListening(40880, function() {
        worker.loadConfig({
          ports: {
            40880: {}
          }
        }, function(err) {
          if (err) finished(err);
          assurePortIsListening(40880, function() {
            worker.loadConfig({}, function(err) {
              if (err) finished(err);
              assurePortNotListening(40880, function() {
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
        proxy: {
          '*': 40881
        }
      }, 40881);

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

    it('should support unicode domains', function(finished) {
      var tester = testPortConfig({
        proxy: {
          'źdźbło.pl': 40881
        }
      }, 40881);
      tester.request('http://źdźbło.pl', function(err) {
        finished(err);
        tester.finish();
      });
    });

    it('should support http entities in requests', function(finished) {
      var tester = testPortConfig({
        proxy: {
          'test.pl/test%20kota/ d': 40881
        }
      }, 40881);
      tester.request('http://test.pl/test%20kota/ d', function(err) {
        finished(err);
        tester.finish();
      });

    });


    it('should redirect multiple requests', function(finished) {
      var tester = testPortConfig({
        redirect: {
          '*': 'http://[1]:40881/[path]'
        }
      }, 40881);

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