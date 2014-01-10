var should = require('should');
var mocha = require('mocha');
var DispatchTable = require('../DispatchTable');
var assert = require('assert');
var url = require('url');

function makeReq(host, path) {
	return {
		url: path,
		headers: {
			host: host
		},
		connection: {},
    parsedUrl: url.parse(path)
	};
}


var onTarget;

var httpProxy = require('http-proxy');
httpProxy.createProxyServer = function() {

	return {
		web: function(req, res, options) {
			if (onTarget)
				onTarget(options.target, req);
		},
		on: function() {}
	};
};


var proxy = require('../modules/proxy');

var middleware;

function makeTest(host, path, cb) {
	onTarget = cb;
  var req = makeReq(host, path);
	middleware.handleRequest(req, {}, function(err) {
		onTarget({
			href: ''
		}, {});
	});
}

var assertPath = function(host, path, mustEqual) {
	makeTest(host, path, function(target, req) {
    if(target.query) {
      target.search = '?' + target.query;
    }


    if(target.withPath) {
      var formatted = url.format(target);

      //if(!(mustEqual == '' && formatted == '/')) // this is correct
      if(mustEqual.match(/^https?:\/\/[^/]+$/))
        formatted.should.equal(mustEqual + '/');
      else
        formatted.should.equal(mustEqual);
      if(target && target.path)
        req.url.should.equal(target.path);
    }
    else { // ignore path from target
      target.path = req.url;
      target.pathname = req.url;
      if(target.pathname) // remove query parameters
        target.pathname.replace(/\?.*/, '');
      var formatted = url.format(target);
      formatted.should.equal(mustEqual);
    }
	});
}


describe('proxy module', function() {
	it('should rewrite URL with implicit ending / to explicit /', function() {


		middleware = proxy.middleware({
			proxy: {
				"jira.atlashost.eu/code2flow/*": "jira:14900/code2flow/[1]"
			}
		});
		assertPath('jira.atlashost.eu', '/code2flow', 'http://jira:14900/code2flow/');
		assertPath('jira.atlashost.eu', '/code2flow/', 'http://jira:14900/code2flow/');
		assertPath('jira.atlashost.eu', '/code2flow//', 'http://jira:14900/code2flow//');
		assertPath('jira.atlashost.eu', '/code2flo', '');

	});
	it('should try to connect to fake route', function() {
		middleware = proxy.middleware({
			proxy: {
				"*": "localhost:0"
			}
		});
		assertPath('jira.atlashost.eu', '/test', 'http://localhost:0/test');
	});
  it('should forward path with request parameters', function() {

    middleware = proxy.middleware({
      proxy: {
        "jira.atlashost.eu/code2flow/*": "jira:14900/code2flow/[rest]"
      }
    });

    assertPath('jira.atlashost.eu', '/code2flow?params', 'http://jira:14900/code2flow/?params');
    assertPath('jira.atlashost.eu', '/code2flow/?params', 'http://jira:14900/code2flow/?params');
    assertPath('jira.atlashost.eu', '/code2flow//?params', 'http://jira:14900/code2flow//?params');
    assertPath('jira.atlashost.eu', '/code2flow/test?params', 'http://jira:14900/code2flow/test?params');
    assertPath('jira.atlashost.eu', '/code2flo', '');
  });

  it('should handle simple url rewrite', function() {
    middleware = proxy.middleware({
      proxy: {
        "jira.atlashost.eu/waysgo/*": "jira:14900/waysgo/[1]",
        "dragon.rushbase.net/rush/*": "127.0.0.1:8080/~rush/[1]"
      }
    });

    assertPath('jira.atlashost.eu', '/waysgo/secure/MyJiraHome.jspa', 'http://jira:14900/waysgo/secure/MyJiraHome.jspa');
    assertPath('dragon.rushbase.net', '/rush/test.js', 'http://127.0.0.1:8080/~rush/test.js');

  });
});