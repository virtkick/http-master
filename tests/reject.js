'use strict';
require('should');

function makeReq(host, path, hostMatch, pathMatch) {
  return {
    url: path,
    headers: {
      host: host
    },
    parsedUrl: require('url').parse(path),
    connection: {},
    hostMatch: hostMatch,
    pathMatch: pathMatch
  };
}

var onTarget;1

describe('reject middleware', function() {
  var rejectMiddleware;
  beforeEach(function() {
    rejectMiddleware = require('../modules/middleware/reject')({});
  });
  function makeTest(target, host, path, cb, hostMatch, pathMatch) {
    onTarget = cb;
    rejectMiddleware.requestHandler(makeReq(host, path, hostMatch, pathMatch), {
      end: function(str) {
        cb(str, this);
      }
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
  });


});


