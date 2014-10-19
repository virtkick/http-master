'use strict';
require('should');
var assert = require('chai').assert;

var path = require('path');

function makeReq(user, pass, hostMatch, pathMatch) {
  var host = '';
  var path = '';

  var headers = {
    host: host
  };
  if(user && pass) {
    headers.authorization = 'Basic ' + (new Buffer(user + ':' + pass).toString('base64'));
  }

  return {
    url: path,
    headers: headers,
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
  var realm;
  function makeTest(target, user, pass, cb, hostMatch, pathMatch) {
    onTarget = cb;

    authMiddleware.requestHandler(makeReq(user, pass, hostMatch, pathMatch), {
      end: function(str) {
        cb(str, this);
      },
      setHeader: function(name, value) {
        assert((name === 'WWW-Authenticate' && value === 'Basic realm="'+(realm || "Enter password") +'"') || name === 'Content-Type');
      },
      writeHead: function(code) {
        code.should.equal(401);
      },
    }, function(err) {
      onTarget('OK');
    }, authMiddleware.entryParser(target));
  }

  ['md5', 'crypt', 'sha', 'bcrypt'].forEach(function(extension) {
    describe('with ' + extension+ ' passwd', function() {
      it('should not authorize without user and password', function() {
        makeTest(path.join(__dirname, 'passwd', extension + '.htpasswd'), null, null, function(str, res) {
          str.should.equal("401 Unauthorized");
        });
      });

      it('should not authorize with bad user and password', function() {
        makeTest(path.join(__dirname, 'passwd', extension +'.htpasswd'), 'dsfsd', 'wreiowreuoiwer', function(str, res) {
          str.should.equal("401 Unauthorized");
        });
      });

      it('should not authorize with correct user and bad password', function() {
        makeTest(path.join(__dirname, 'passwd', extension +'.htpasswd'), 'testuser', 'wreiowreuoiwer', function(str, res) {
          str.should.equal("401 Unauthorized");
        });
      });

      it('should authorize with correct credentials', function() {
        makeTest(path.join(__dirname, 'passwd', extension +'.htpasswd'), 'testuser', 'test', function(str, res) {
          str.should.equal("OK");
        });
      });
    });
  });

  it('should support custom realm', function() {
    realm = "Secret password required";
    makeTest({
      file: path.join(__dirname, 'passwd', 'md5.htpasswd'),
      realm: realm
    }, null, null, function(str, res) {
      str.should.equal("401 Unauthorized");
      realm = undefined;
    });
  });

  it('should default to Enter password realm', function() {
    makeTest({
      file: path.join(__dirname, 'passwd', 'md5.htpasswd')
    }, null, null, function(str, res) {
      str.should.equal("401 Unauthorized");
      realm = undefined;
    });
  });

});


