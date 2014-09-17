'use strict';
require('should');

var path = require('path');

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

var onTarget;

describe('auth middleware', function() {
  var authMiddleware;
  beforeEach(function() {
    authMiddleware = require('../modules/middleware/auth')({});
  });
  function makeTest(target, host, path, cb, hostMatch, pathMatch) {
    onTarget = cb;
    authMiddleware.requestHandler(makeReq(host, path, hostMatch, pathMatch), {
      end: function(str) {
        cb(str, this);
      },
      setHeader: function(name, value) {
        console.log("Set header", name, value);
      },
      writeHead: function(code) {
        code.should.equal(401);
      },
    }, function(err) {
      onTarget('');
    }, authMiddleware.entryParser(target));
  }

  describe('with MD5 passwd', function() {

    it('with MD5 passwd', function() {

      makeTest(path.join(__dirname, 'passwd', 'md5.htpasswd'), '', '', function(str, res) {
//        str.should.equal(mustEqual);
//        res.statusCode.should.equal(codeEqual);
      });

    });

  });


});


