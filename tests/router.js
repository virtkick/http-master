
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
			if(onTarget)
				onTarget(options.target);
		},
		on: function() {}
	};
};


var router = require('../modules/router');

describe('router module', function() {
	it('should rewrite URL with implicit ending / to explicit /', function() {


		var middleware = router.middleware({
			router: {
				"jira.atlashost.eu/code2flow/*": "jira:14900/code2flow/[1]"
			}
		});


		function makeTest(host, path, cb) {
			onTarget = cb;
			middleware.handleRequest(makeReq(host, path), {}, function(err) {
				onTarget({href: ''});
			});
		}
		
		var assertPath = function(host, path, mustEqual) {
			makeTest(host, path, function(target) {
				target.href.should.equal(mustEqual);
			});
		}


		assertPath('jira.atlashost.eu', '/code2flow', 'http://jira:14900/code2flow/');
		assertPath('jira.atlashost.eu', '/code2flow/', 'http://jira:14900/code2flow/');
		assertPath('jira.atlashost.eu', '/code2flow//', 'http://jira:14900/code2flow//');
		assertPath('jira.atlashost.eu', '/code2flo', '');

	});
});