var should = require('should');
var mocha = require('mocha');
var DispatchTable = require('../DispatchTable');
var assert = require('assert');

describe('DispatchTable internal structure', function() {

	describe('Simple host based', function() {

		var config = {
			'host1': {
				key1: '1'
			},
			'host2.com': 'stringTarget',
			'host3.subdomain.net': 400
		};

		var dispatchTable = new DispatchTable(config);
		it('should have proper key for each host', function() {	
			console.log(dispatchTable.table);
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

		var dispatchTable = new DispatchTable(config);

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
			'/.+/': {
				key1: '1'
			},
			'/(ala|ola)\\.ma\\.kota\\.pl/': 'stringTarget',
			'/host3.*\\.net/': 400
		};

		var dispatchTable = new DispatchTable(config);

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


});


describe('DispatchTable dispatcher', function() {
	var config = {
		'code2flow.com': 5040,
		'*.atlashost.eu': 'https://atlashost.eu',
		'/(www|test|indigo)\.testowo\.pl/': 'localhost:5040'
	};
	
	it('should run first entry', function(finish) {
		var dispatchTable = new DispatchTable(config, function(req, res, target) {
			target.should.equal(5040);
			finish();
		});
		dispatchTable.dispatch({headers:{host: 'code2flow.com'}}, {}, function(err) {
			finish(false);
		});
	});


	it('should not run any entry', function(finish) {
		var dispatchTable = new DispatchTable(config, function(req, res, target) {
			finish(false);
		});
		dispatchTable.dispatch({headers:{host: 'table.code2flow.com'}}, {}, function(err) {
			finish();
		});
	});

	it('should run second entry', function(finish) {
		var dispatchTable = new DispatchTable(config, function(req, res, target) {
			target.should.equal('https://atlashost.eu');
			finish();
		});
		dispatchTable.dispatch({headers:{host: 'test.atlashost.eu'}}, {}, function(err) {
			finish(false);
		});
	});

	it('should run third entry', function(finish) {
		var dispatchTable = new DispatchTable(config, function(req, res, target) {
			target.should.equal('localhost:5040');
			finish();
		});
		dispatchTable.dispatch({headers:{host: 'www.testowo.pl'}}, {}, function(err) {
			finish(false);
		});
	});

	it('should transform target entry', function(finish) {

		var dispatchTable = new DispatchTable(config, function(req, res, target) {
			target.should.equal('/(www|test|indigo)\.testowo\.pl/|localhost:5040');
			finish();
		}, function(key, value) {
			return [key, key + '|' + value];
		});
		dispatchTable.dispatch({headers:{host: 'www.testowo.pl'}}, {}, function(err) {
			finish(false);
		});


	});

});