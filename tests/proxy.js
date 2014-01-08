var should = require('should');
var mocha = require('mocha');
var DispatchTable = require('../DispatchTable');
var assert = require('assert');

function makeReq(host, path) {
	return {
		url: path,
		headers: {
			host: host
		},
		connection: {},
	};
}


var onTarget;

var httpProxy = require('http-proxy');
httpProxy.createProxyServer = function() {

	return {
		web: function(req, res, options) {
			if (onTarget)
				onTarget(options.target);
		},
		on: function() {}
	};
};


var proxy = require('../modules/proxy');

var middleware;

function makeTest(host, path, cb) {
	onTarget = cb;
	middleware.handleRequest(makeReq(host, path), {}, function(err) {
		onTarget({
			href: ''
		});
	});
}

var assertPath = function(host, path, mustEqual) {
	makeTest(host, path, function(target) {
		target.href.should.equal(mustEqual);
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
		assertPath('jira.atlashost.eu', '/test', 'http://localhost:0/');
	});
  it('should forward path with request parameters', function() {

    middleware = proxy.middleware({
      proxy: {
        "jira.atlashost.eu/code2flow/*": "jira:14900/code2flow/[1]?[params]"
      }
    });

    assertPath('jira.atlashost.eu', '/code2flow?params', 'http://jira:14900/code2flow/?params');
    assertPath('jira.atlashost.eu', '/code2flow/?params', 'http://jira:14900/code2flow/?params');
    assertPath('jira.atlashost.eu', '/code2flow//?params', 'http://jira:14900/code2flow//?params');
    assertPath('jira.atlashost.eu', '/code2flow/test?params', 'http://jira:14900/code2flow/test?params');
    assertPath('jira.atlashost.eu', '/code2flo', '');
  });
});