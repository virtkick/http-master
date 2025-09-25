'use strict';
var DispatchTable = require('../src/DispatchTable');
var expect = require('chai').expect;
require('should');

describe('DispatchTable unit tests', function() {

  function createMockRequest(host, path) {
    return {
      headers: { host: host },
      unicodeHost: host,
      parsedUrl: require('url').parse(path),
      url: path,
      match: []
    };
  }

  function mockEntryParser(entry) {
    // Simple mock that just returns the entry as-is
    return { entry: entry, mockParsed: true };
  }

  it('should match exact domain paths correctly', function() {
    var config = {
      'owncloud.nowaker.net': 'redirect -> https://owncloud.nowaker.net/[path]',
      'owncloud.nowaker.net/.well-known/acme-challenge/*': 'static -> /webroot/[1]'
    };
    
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: mockEntryParser,
      requestHandler: function() {}
    });
    
    // Test ACME challenge path
    var req1 = createMockRequest('owncloud.nowaker.net', '/.well-known/acme-challenge/test123');
    var target1 = dispatchTable.getTargetForReq(req1);
    
    console.log('ACME challenge target:', JSON.stringify(target1, null, 2));
    console.log('req1.match after:', req1.match);
    
    // Test general path (should hit redirect)
    var req2 = createMockRequest('owncloud.nowaker.net', '/other-path');
    var target2 = dispatchTable.getTargetForReq(req2);
    
    console.log('General path target:', JSON.stringify(target2, null, 2));
    console.log('req2.match after:', req2.match);
    
    // Assertions
    expect(target1).to.exist;expect(target1.entry).to.equal('static -> /webroot/[1]');
    
    expect(req1.match).to.deep.equal(['test123']);
    
    expect(target2).to.exist;
    expect(target2.entry).to.equal('redirect -> https://owncloud.nowaker.net/[path]');
  });

  it('should match wildcard domain paths correctly', function() {
    var config = {
      '*/.well-known/acme-challenge/*': 'static -> /webroot/[1]'
    };
    
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: mockEntryParser,
      requestHandler: function() {}
    });
    
    // Test wildcard match
    var req = createMockRequest('any.domain.com', '/.well-known/acme-challenge/xyz456');
    var target = dispatchTable.getTargetForReq(req);
    
    console.log('Wildcard target:', JSON.stringify(target, null, 2));
    console.log('req.match after wildcard:', req.match);
    
    // Assertions
    expect(target).to.exist;
    expect(target.entry).to.equal('static -> /webroot/[1]');
    expect(req.match).to.include('xyz456');
  });

});