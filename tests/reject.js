'use strict';
require('should');

function makeReq(host, path, hostMatch, pathMatch, contentType) {
  return {
    url: path,
    headers: {
      host: host,
      accept: contentType
    },
    parsedUrl: require('url').parse(path),
    connection: {},
    hostMatch: hostMatch,
    pathMatch: pathMatch
  };
}

var onTarget;

describe('reject middleware', function() {
  var rejectMiddleware;
  beforeEach(function() {
    rejectMiddleware = require('../modules/middleware/reject')({}, {});
  });
  function makeTest(target, host, path, cb, hostMatch, pathMatch, contentType) {
    onTarget = cb;
    var written = '';
    rejectMiddleware.requestHandler(makeReq(host, path, hostMatch, pathMatch, contentType), {
      end: function(str) {
        cb(written + (str?str:''), this);
      },
      writeHead: function() {},
      write: function(str) {written += str;}
    }, function(err) {
      onTarget('');
    }, rejectMiddleware.entryParser(target));
  }

  it('should handle basic rejects', function() {
   var assertPath = function(entry, codeEqual, mustEqual) {
      makeTest(entry, '', '', function(str, res) {
        str.should.equal(mustEqual);
        res.statusCode.should.equal(codeEqual);
      });
    };
    assertPath(undefined, 403, '403 Forbidden');
    assertPath(403, 403, '403 Forbidden');
    assertPath('403', 403, '403 Forbidden');
    assertPath(null, 403, '403 Forbidden');
    assertPath(404, 404, '404 Not Found');
    assertPath(500, 500, '500 Internal Server Error');
    assertPath(99, 99, '99 Forbidden');
    assertPath(0, 403, '403 Forbidden');
    assertPath("dpoaias", 403, '403 Forbidden');
  });


  var errorHtmlFile;
  before(function() {
    var fs = require('fs');
    var path = require('path');
    errorHtmlFile = path.join(__dirname, '.work', 'error.html');
    fs.writeFileSync(errorHtmlFile, '<b>Hello, world!</b><img src="test.png" />');

    var fakeImageFile = path.join(__dirname, '.work', 'test.png');
    fs.writeFileSync(fakeImageFile, 'test');
  });

  it('should show htmlPage when specified', function(endTest) {

    makeTest({
        htmlFile: errorHtmlFile
      }, '', '', function(str, res) {
        str.should.equal('<b>Hello, world!</b><img src="data:image/png;base64,dGVzdA==" />');
        res.statusCode.should.equal(403);
        endTest();
    },  null, null, 'text/html');
  });


  it('should show default errorHtmlPage when site is offline', function(endTest) {

    rejectMiddleware = require('../modules/middleware/reject')({
      errorHtmlFile: errorHtmlFile
    }, {});

    makeTest({
      }, '', '', function(str, res) {
        str.should.equal('<b>Hello, world!</b><img src="data:image/png;base64,dGVzdA==" />');
        res.statusCode.should.equal(403);
        endTest();
    },  null, null, 'text/html');
  });

  it('should show default errorHtmlPage when site is offline (from portConfig)', function(endTest) {

    rejectMiddleware = require('../modules/middleware/reject')({
    }, {
      errorHtmlFile: errorHtmlFile
    });

    makeTest({
      }, '', '', function(str, res) {
        str.should.equal('<b>Hello, world!</b><img src="data:image/png;base64,dGVzdA==" />');
        res.statusCode.should.equal(403);
        endTest();
    }, null, null, 'text/html');
  });

  it('should not show htmlPage if requesting json', function(endTest) {

    makeTest({
        htmlFile: errorHtmlFile
      }, '', '', function(str, res) {
        str.should.equal("{\"error\":\"403 Forbidden\"}");
        res.statusCode.should.equal(403);
        endTest();
    },  null, null, 'application/json');
  });
});
