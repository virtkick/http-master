'use strict';
var expect = require('chai').expect;
require('should');
var DispatchTable = require('../src/DispatchTable');

describe('DispatchTable ACME Routing Priority Unit Tests', function() {

  it('should route ACME challenges to static middleware BEFORE domain redirects', function() {
    // This test demonstrates the exact production routing bug
    // The current DispatchTable algorithm checks exact host matches FIRST
    // which causes owncloud.nowaker.net redirect to override ACME challenges
    
    var config = {
      "*/.well-known/acme-challenge/*": "static -> /webroot/[2]",
      "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]"
    };
    
    // Mock entry parser that returns parsed targets with module identification
    var entryParser = function(entry) {
      if (entry.includes('static')) {
        return {entry: entry, isWildcard: true, module: 'static'};
      }
      if (entry.includes('redirect')) {
        return {entry: entry, module: 'redirect'};
      }
      return {entry: entry};
    };
    
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: entryParser
    });
    
    // Mock ACME challenge request to domain that has a general redirect rule
    var acmeReq = {
      url: '/.well-known/acme-challenge/test123',
      headers: { host: 'owncloud.nowaker.net' },
      parsedUrl: { pathname: '/.well-known/acme-challenge/test123' }
    };
    
    var target = dispatchTable.getTargetForReq(acmeReq);
    
    console.log('Target found for ACME challenge:', target ? target.module : 'null');
    console.log('Request match array:', acmeReq.match);
    
    // CRITICAL TEST: ACME challenges should route to static, NOT redirect
    // If this fails, it proves the routing priority bug exists
    expect(target).to.not.be.null;
    expect(target.module).to.equal('static', 'ACME challenges must route to static middleware, not redirect');
    
    // Verify wildcard pattern matching works correctly
    expect(acmeReq.match).to.be.an('array');
    expect(acmeReq.match[0]).to.equal('owncloud.nowaker.net', 'Host should be captured in [1]');
    expect(acmeReq.match[1]).to.equal('test123', 'Challenge token should be captured in [2]');
  });

  it('should route normal requests to redirect middleware', function() {
    // Same configuration as above
    var config = {
      "*/.well-known/acme-challenge/*": "static -> /webroot/[2]",
      "owncloud.nowaker.net": "redirect -> https://owncloud.nowaker.net/[path]"
    };
    
    var entryParser = function(entry) {
      if (entry.includes('static')) {
        return {entry: entry, isWildcard: true, module: 'static'};
      }
      if (entry.includes('redirect')) {
        return {entry: entry, module: 'redirect'};
      }
      return {entry: entry};
    };
    
    var dispatchTable = new DispatchTable(80, {
      config: config,
      entryParser: entryParser
    });
    
    // Mock normal request (not ACME challenge)
    var normalReq = {
      url: '/normal-path',
      headers: { host: 'owncloud.nowaker.net' },
      parsedUrl: { pathname: '/normal-path' }
    };
    
    var target = dispatchTable.getTargetForReq(normalReq);
    
    console.log('Normal request target module:', target ? target.module : 'null');
    
    // Normal requests should still get redirected
    expect(target).to.not.be.null;
    expect(target.module).to.equal('redirect', 'Normal requests should still be redirected');
  });

});