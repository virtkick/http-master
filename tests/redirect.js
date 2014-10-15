'use strict';
require('should');

function makeReq(host, path, match) {
	return {
		url: path,
		headers: {
			host: host
		},
    parsedUrl: require('url').parse(path),
		connection: {},
    match: match
	};
}


var onTarget;1

describe('redirect middleware', function() {
  var redirectMiddleware;
  beforeEach(function() {
    redirectMiddleware = require('../modules/middleware/redirect')({});
  });
  function makeTest(target, host, path, cb, match) {
    onTarget = cb;
    redirectMiddleware.requestHandler(makeReq(host, path, match), {
      setHeader: function(str, target) {
        if(str == 'Location')
          cb(target);
      },
      end: function(){}
    }, function(err) {
      onTarget('');
    }, target);
  }

  it('should handle basic redirects', function() {
   var assertPath = function(host, path, mustEqual) {
      makeTest('https://jira.atlashost.eu/[path]', host, path, function(target) {
        target.should.equal(mustEqual);
      });
    };
    assertPath('jira.atlashost.eu', '/test', 'https://jira.atlashost.eu/test');
    assertPath('jira.atlashost.eu', '/', 'https://jira.atlashost.eu/');
    assertPath('jira.atlashost.eu', '', 'https://jira.atlashost.eu/');
  });

  it('should handle matches', function() {
   var assertPath = function(host, path, mustEqual) {
      makeTest('https://jira.atlashost.eu/[1]/[path]', host, path, function(target) {
        target.should.equal(mustEqual);
      }, 'foo'.match(/(.*)/).slice(1));
    };
    assertPath('jira.atlashost.eu', '/test', 'https://jira.atlashost.eu/foo/test');
    assertPath('jira.atlashost.eu', '/', 'https://jira.atlashost.eu/foo/');
    assertPath('jira.atlashost.eu', '', 'https://jira.atlashost.eu/foo/');
  });

});


