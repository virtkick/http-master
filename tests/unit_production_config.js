'use strict';
var DispatchTable = require('../src/DispatchTable');
var expect = require('chai').expect;
require('should');

describe('Production Config Unit Tests', function() {

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
    // Mock that mimics how router middleware parses entries
    var entryRegexp = /^\s*(?:(\w+)\s*(?:->|: )\s*)?(.*)/;
    var m = entry.toString().match(entryRegexp);
    var moduleName = m[1] || 'proxy';
    var entryKey = m[2];
    
    return { 
      entry: entry, 
      mockParsed: true,
      moduleName: moduleName,
      entryKey: entryKey
    };
  }

  it('should match production config exactly as deployed', function() {
    // EXACT production port 80 router configuration
    var config = {
      "*/.well-known/acme-challenge/*": "static -> /etc/http-proxy/lego-webroot",
      "x.virtkick.io": "static -> /home/virtkick-upload",
      "card.virtkick.com": "redirect -> https://card.virtkick.com",
      "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]",
      "owncloud.nowaker.net/.well-known/acme-challenge/*": "static -> /etc/http-proxy/lego-webroot/.well-known/acme-challenge/[1]"
    };
    
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: mockEntryParser,
      requestHandler: function() {}
    });
    
    console.log('\n=== Testing owncloud.nowaker.net ACME challenge ===');
    var req1 = createMockRequest('owncloud.nowaker.net', '/.well-known/acme-challenge/test123');
    var target1 = dispatchTable.getTargetForReq(req1);
    
    console.log('Target for owncloud.nowaker.net ACME:', JSON.stringify(target1, null, 2));
    console.log('Match captured:', req1.match);
    
    console.log('\n=== Testing owncloud.nowaker.net general path ===');
    var req2 = createMockRequest('owncloud.nowaker.net', '/other-path');
    var target2 = dispatchTable.getTargetForReq(req2);
    
    console.log('Target for owncloud.nowaker.net general:', JSON.stringify(target2, null, 2));
    
    console.log('\n=== Testing wildcard ACME fallback ===');
    var req3 = createMockRequest('other.domain.com', '/.well-known/acme-challenge/test456');
    var target3 = dispatchTable.getTargetForReq(req3);
    
    console.log('Target for wildcard ACME:', JSON.stringify(target3, null, 2));
    console.log('Match captured:', req3.match);
    
    // Assertions
    expect(target1).to.exist;
    expect(target1.entryKey).to.equal('/etc/http-proxy/lego-webroot/.well-known/acme-challenge/[1]');
    expect(req1.match).to.include('test123');
    
    expect(target2).to.exist; 
    expect(target2.entryKey).to.equal('https://owncloud.nowaker.net/[path]');
    
    expect(target3).to.exist;
    expect(target3.entryKey).to.equal('/etc/http-proxy/lego-webroot');
    expect(req3.match).to.include('test456');
  });

});