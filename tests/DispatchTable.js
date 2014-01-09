// todo - add tests for url rewriting

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
    parsedUrl: require('url').parse(path)
	};
}

describe('DispatchTable internal structure', function() {

	describe('Simple host based', function() {

		var config = {
			'host1': {
				key1: '1'
			},
			'host2.com': 'stringTarget',
			'host3.subdomain.net': 400
		};

		var dispatchTable = new DispatchTable({
			config: config
		});
		it('should have proper key for each host', function() {
			//console.log(dispatchTable.table);
			assert.deepEqual(dispatchTable.table['host1'], {
				target: {
					key1: '1'
				}
			});
			assert.deepEqual(dispatchTable.table['host2.com'], {
				target: 'stringTarget'
			});

			assert.deepEqual(dispatchTable.table['host3.subdomain.net'], {
				target: 400
			});

		});
		it('should have empty regexp table', function() {
			dispatchTable.regexpEntries.should.be.empty;
		});

	});

	describe('Wildcards', function() {

		var config = {
			'host2.???': {
				key1: '1'
			},
			'*.host2.com': 'stringTarget',
			'host3.*.net': 400
		};

		var dispatchTable = new DispatchTable({
			config: config
		});

		it('should have proper regexp entries', function() {
			dispatchTable.regexpEntries.should.not.be.empty;

			var entry = dispatchTable.regexpEntries[0];
			assert.deepEqual(entry.target, {
				key1: '1'
			})
			assert(entry.regexp, "has regexp");

			entry = dispatchTable.regexpEntries[1];
			assert.deepEqual(entry.target, 'stringTarget');
			assert(entry.regexp, "has regexp");

			entry = dispatchTable.regexpEntries[2];
			assert.deepEqual(entry.target, 400);
			assert(entry.regexp, "has regexp");
		});

		it('should have wildcards compiled to proper working regexps', function() {

			var entry;
			entry = dispatchTable.regexpEntries[0];
			assert('host2.com'.match(entry.regexp))
			assert('host2.net'.match(entry.regexp))
			assert('host2.org'.match(entry.regexp))
			assert(!'host2.co.uk'.match(entry.regexp))
			assert(!'host2.pl'.match(entry.regexp))
			assert(!'.host2.com'.match(entry.regexp))
			assert(!'www.host2.com'.match(entry.regexp))
			entry = dispatchTable.regexpEntries[1];

			assert('host2.com'.match(entry.regexp))
			assert(!'hhost2.com'.match(entry.regexp))
			assert(!'.host2.com'.match(entry.regexp))
			assert('www.host2.com'.match(entry.regexp))
			assert('www.test.host2.com'.match(entry.regexp))

			entry = dispatchTable.regexpEntries[2];
			assert('host3.ddd.net'.match(entry.regexp))
			assert(!'host3..net'.match(entry.regexp))
			assert('host3.test.net'.match(entry.regexp))
			assert(!'host3.test.test2.net'.match(entry.regexp))
			assert(!'host3.net'.match(entry.regexp))

		});

	});

	describe('Regexps', function() {

		var config = {
			'^.+': {
				key1: '1'
			},
			'^(ala|ola)\\.ma\\.kota\\.pl': 'stringTarget',
			'^host3.*\\.net': 400
		};

		var dispatchTable = new DispatchTable({
			config: config
		});

		it('should have proper regexp entries', function() {
			dispatchTable.regexpEntries.should.not.be.empty;

			var entry = dispatchTable.regexpEntries[0];
			assert.deepEqual(entry.target, {
				key1: '1'
			})
			assert(entry.regexp, "has regexp");

			entry = dispatchTable.regexpEntries[1];
			assert.deepEqual(entry.target, 'stringTarget');
			assert(entry.regexp, "has regexp");
			assert(entry.regexp, "has regexp");

			entry = dispatchTable.regexpEntries[2];
			assert.deepEqual(entry.target, 400);
			assert(entry.regexp, "has regexp");

		});

		it('should have wildcards compiled to proper working regexps', function() {

			var entry;
			entry = dispatchTable.regexpEntries[0];
			assert(!''.match(entry.regexp))
			assert('test'.match(entry.regexp))
			assert('...'.match(entry.regexp))
			entry = dispatchTable.regexpEntries[1];
			assert('ala.ma.kota.pl'.match(entry.regexp))
			assert('ola.ma.kota.pl'.match(entry.regexp))
			assert(!'mola.ma.kota.pl'.match(entry.regexp))
			assert(!'aga.ma.kota.pl'.match(entry.regexp))
			assert(!'ola.ma.kota_pl'.match(entry.regexp))
			assert(!'ola.ma.kota.pl_'.match(entry.regexp))
			entry = dispatchTable.regexpEntries[2];
			assert('host3.net'.match(entry.regexp))
			assert('host3.code2flow.net'.match(entry.regexp))
		});
	});

	describe('Multiple paths for entry', function() {
		var config = {
			'code2flow.com/^get/(?<letter>[a-f])/?': 5070,
			'code2flow.com/admin2': 5060,
			'code2flow.com/admin/*': 5061,
			'code2flow.com/test': 5050,
			'code2flow.com/*/test': 5040,
			'code2flow.com': 5030
		};
		var dispatchTable = new DispatchTable({
			config: config
		});
		it('should have proper entries', function() {

			Object.keys(dispatchTable.table).should.have.length(2);
			dispatchTable.table['code2flow.com'].should.have.length(6);

		});
		it('should yield proper targets for paths', function() {

			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/test')).should.equal(5050);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/get/a')).should.equal(5070);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/get/a/')).should.equal(5070);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2')).should.equal(5060);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2/')).should.equal(5030);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/dupa')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/dupa/')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/dupa/3')).should.equal(5061);
		});

		it('should install transformer regexp for path', function() {
			var req = makeReq('code2flow.com', '/get/a');
			dispatchTable.getTargetForReq(req);
			assert(req.pathMatch);
			req.pathMatch[1].should.equal('a');
			req.pathMatch.letter.should.equal('a');

		});
	});

	describe('explicit /* at end of path', function() {
		var config = {
			'code2flow.com/admin/*': 5061,
			'code2flow.com/admin2/*': 5062,
		};
		var dispatchTable = new DispatchTable({
			config: config
		});
		it('should not find any route', function() {
			assert(!dispatchTable.getTargetForReq(makeReq('code2flow.com', '/adminwhatever')), "is null");
			assert(!dispatchTable.getTargetForReq(makeReq('code2flow.com', '/adminw2hatever')), "is null");
		});
		it('should find proper routes', function() {

			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/whatever')).should.equal(5061);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin/whatever/')).should.equal(5061);

			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2')).should.equal(5062);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2/')).should.equal(5062);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2/whatever')).should.equal(5062);
			dispatchTable.getTargetForReq(makeReq('code2flow.com', '/admin2/whatever/')).should.equal(5062);
		});

	});

});

describe('DispatchTable various routes', function() {
		var config = {
			'local.code2flow.com/^get/(?<code>[a-f]{6})': 5070,
			'*.code2flow.com/^(\\d+)/(?<code>[a-f]{6})': "[2]"
		};
		var dispatchTable = new DispatchTable({
			config: config
		});
		it('should yield proper targets', function() {
			dispatchTable.getTargetForReq(makeReq('local.code2flow.com', '/get/abcdef')).should.equal(5070);
			dispatchTable.getTargetForReq(makeReq('test.code2flow.com', '/5080/abcdef')).should.equal('[2]');
		});
		it('should install proper transformer', function() {
			var req = makeReq('test.code2flow.com', '/5080/abcdef');
			var target = dispatchTable.getTargetForReq(req);
			assert(target, 'target should be found');
			target.should.equal('[2]');			
			req.hostMatch[1].should.equal('test');
			req.pathMatch[1].should.equal('5080');
			req.pathMatch[2].should.equal('abcdef');

			var regexpHelper = require('../regexpHelper');
			var out = regexpHelper(target, req.hostMatch, req.pathMatch);
			out.should.equal('5080');
		});
});


describe('DispatchTable dispatcher', function() {
	var config = {
		'code2flow.com': 5040,
		'*.atlashost.eu': 'https://atlashost.eu',
		'^(www|test|indigo)\\.testowo\\.pl': 'localhost:5040'
	};

	it('should run first entry', function(finish) {
		var dispatchTable = new DispatchTable({
			config: config,
			requestHandler: function(req, res, next, target) {
				target.should.equal(5040);
				finish();
			}
		});
		dispatchTable.dispatchRequest({
			headers: {
				host: 'code2flow.com'
			}
		}, {}, function(err) {
			finish(false);
		});
	});


	it('should not run any entry', function(finish) {
		var dispatchTable = new DispatchTable({
			config: config,
			requestHandler: function(req, res, next, target) {
				finish(false);
			}
		});
		dispatchTable.dispatchRequest({
			headers: {
				host: 'table.code2flow.com'
			}
		}, {}, function(err) {
			finish();
		});
	});

	it('should run second entry', function(finish) {
		var dispatchTable = new DispatchTable({
			config: config,
			requestHandler: function(req, res, next, target) {
				target.should.equal('https://atlashost.eu');
				finish();
			}
		});
		dispatchTable.dispatchRequest({
			headers: {
				host: 'test.atlashost.eu'
			}
		}, {}, function(err) {
			finish(false);
		});
	});

	it('should run third entry', function(finish) {
		var dispatchTable = new DispatchTable({
			config: config,
			requestHandler: function(req, res, next, target) {
				target.should.equal('localhost:5040');
				finish();
			}
		});
		dispatchTable.dispatchRequest({
			headers: {
				host: 'www.testowo.pl'
			}
		}, {}, function(err) {
			finish(false);
		});
	});

	it('should transform target entry', function(finish) {

		var dispatchTable = new DispatchTable({
			config: config,
			requestHandler: function(req, res, next, target) {
				target.should.equal('^(www|test|indigo)\\.testowo\\.pl|localhost:5040');
				finish();
			},
			entryParser: function(key, value) {
				return [key, key + '|' + value];
			}
		});
		dispatchTable.dispatchRequest({
			headers: {
				host: 'www.testowo.pl'
			}
		}, {}, function(err) {
			finish(false);
		});


	});
});