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
var oldProxyServer = httpProxy.createProxyServer;

function patchProxyServer() {
  httpProxy.createProxyServer = function() {

    return {
      web: function(req, res, options) {
        if (onTarget)
          onTarget(options.target, req);
      },
      on: function() {}
    };
  };
}

function unpatchProxyServer() {
  httpProxy.createProxyServer = oldProxyServer;
}


patchProxyServer();
delete require.cache[require.resolve('../modules/proxy')];
var proxy = require('../modules/proxy');
delete require.cache[require.resolve('../modules/proxy')];
// clear the patched module from cache so that other tests can
// resolve unpatched module
unpatchProxyServer();

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
    var reqUrl = req.url || '';
    target.path = reqUrl;
     var m = reqUrl.match(/([?])(.*)/);

     if(m) {
       target.search = m[1] + m[2];
       target.query = m[2];
    }
    target.pathname = reqUrl.replace(/\?.*/, '');

    var formatted = url.format(target);
    formatted.should.equal(mustEqual);
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
  it('should forward path with query parameters', function() {

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
        "dragon.rushbase.net/rush/*": "127.0.0.1:8080/~rush/[1]",
        'test.net' : 1000
      }
    });

    assertPath('jira.atlashost.eu', '/waysgo/secure/MyJiraHome.jspa', 'http://jira:14900/waysgo/secure/MyJiraHome.jspa');
    assertPath('dragon.rushbase.net', '/rush/test.js', 'http://127.0.0.1:8080/~rush/test.js');

    assertPath('jira.atlashost.eu', '/waysgo/plugins/servlet/gadgets/ifr?container=atlassian&mid=0&country=US&lang=en&view=default&view-params=%7B%22writable%22%3A%22false%22%7D&st=atlassian%3AZXk4Vbj6JrQXyvhOBv0iyMrxSLRxI%2BDE1DLWB9x6GlICiJtW7i5jOjjvJjX6bTeQn4ONYISfvalhmLe0j%2Ffa18QJgwh9ksWhttnox%2B%2FvuN5daiMOVg7UcT7XzkwvEUiPgjOB2L5GJUyKerbGNh3BAQdlJOApQxk%2BlWcNWOza%2BhQDEwfko3qobsrVSSky1zuK4hOFyNN0Ds6zUx7flsC4LkOVBjO4f90uMIuG2I1DDU%2F%2FTVK0&up_isPublicMode=false&up_isElevatedSecurityCheckShown=false&up_loginFailedByPermissions=false&up_externalUserManagement=false&up_loginSucceeded=false&up_allowCookies=true&up_externalPasswordManagement=&up_captchaFailure=false&up_isAdminFormOn=true&url=https%3A%2F%2Fjira.atlashost.eu%2Fwaysgo%2Frest%2Fgadgets%2F1.0%2Fg%2Fcom.atlassian.jira.gadgets%2Fgadgets%2Flogin.xml&libs=auth-refresh#rpctoken=7574331', 'http://jira:14900/waysgo/plugins/servlet/gadgets/ifr?container=atlassian&mid=0&country=US&lang=en&view=default&view-params=%7B%22writable%22%3A%22false%22%7D&st=atlassian%3AZXk4Vbj6JrQXyvhOBv0iyMrxSLRxI%2BDE1DLWB9x6GlICiJtW7i5jOjjvJjX6bTeQn4ONYISfvalhmLe0j%2Ffa18QJgwh9ksWhttnox%2B%2FvuN5daiMOVg7UcT7XzkwvEUiPgjOB2L5GJUyKerbGNh3BAQdlJOApQxk%2BlWcNWOza%2BhQDEwfko3qobsrVSSky1zuK4hOFyNN0Ds6zUx7flsC4LkOVBjO4f90uMIuG2I1DDU%2F%2FTVK0&up_isPublicMode=false&up_isElevatedSecurityCheckShown=false&up_loginFailedByPermissions=false&up_externalUserManagement=false&up_loginSucceeded=false&up_allowCookies=true&up_externalPasswordManagement=&up_captchaFailure=false&up_isAdminFormOn=true&url=https%3A%2F%2Fjira.atlashost.eu%2Fwaysgo%2Frest%2Fgadgets%2F1.0%2Fg%2Fcom.atlassian.jira.gadgets%2Fgadgets%2Flogin.xml&libs=auth-refresh')

    assertPath('test.net', '/test/path?query', 'http://127.0.0.1:1000/test/path?query');

  });
  
});

