var net = require('net');
var http = require('http');
var async = require('async');
var HttpMasterWorker = require('../workerLogic');
var url = require('url');
var parseUrl = url.parse.bind(url);
var should = require('should');
var assert = require('assert');


var startTester = function(portConfig, targetPort, handler) {
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

      httpServer.once('request', function(req, res) {
        if (reqValidator) {
          reqValidator(req);
        } else {
          req.headers.host.should.equal(parsedUrl.hostname);
          req.url.should.equal(parsedUrl.path);
        }
        res.statusCode = 404;
        res.end('Sorry');
      });

      var req = http.request(options, function(res) {
        if (resValidator) {
          resValidator(res, req);
        } else {
          res.statusCode.should.equal(404);
        }
        res.on('error', requestFinish);

        res.on('data', function(data) {
          data.toString().should.equal(string);
          requestFinish();
        });
      });

      req.string = 'Sorry';
      req.on('error', requestFinish);
      req.end();
    },
    finish: function() {
      worker.loadConfig({});
      httpServer.close();
    }
  };
};


describe('Bugsnag Test', function() {
  it('should redirect multiple requests', function(finished) {
    var tester = startTester({
      redirect: {
        "*": 'http://[1]:40881/[path]'
      }
    }, 40881);

    tester.request('http://example.com/path/?query_param=true', finished, function (res, req) {
      res.statusCode.should.equal(302);

      tester.finish();
      finished();
    });
  });
});
