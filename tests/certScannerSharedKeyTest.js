'use strict';

const { expect } = require('chai');
const { execSync } = require('child_process');

describe('Certificate Scanner Shared RSA Key Bug', function() {
  const testDir = './tests/fixtures/shared-rsa-certs';

  it('should find 2 certificate matches with shared RSA modulus (CURRENTLY FAILS)', function() {
    // Count files - should have 2 .crt and 2 .key files
    const certFiles = execSync(`ls ${testDir}/*.crt`, { encoding: 'utf8' }).trim().split('\n');
    const keyFiles = execSync(`ls ${testDir}/*.key | grep -v shared.key`, { encoding: 'utf8' }).trim().split('\n');
    
    console.log(`Input: ${certFiles.length} certificates, ${keyFiles.length} keys`);
    expect(certFiles.length).to.equal(2, 'Should have 2 certificate files');
    expect(keyFiles.length).to.equal(2, 'Should have 2 key files');
    
    // Run cert-scan and extract JSON (avoiding debug output)
    const fullOutput = execSync(`./bin/cert-scan ${testDir} 2>/dev/null`, { encoding: 'utf8' });
    const jsonOutput = fullOutput.split('\n').filter(line => line.startsWith('{')).join('\n');
    
    console.log('cert-scan output JSON:', jsonOutput);
    const result = JSON.parse(jsonOutput || '{}');
    
    const domainCount = Object.keys(result).length;
    console.log(`ACTUAL RESULT: Found ${domainCount} matched certificate pairs`);
    console.log(`EXPECTED: Should find 2 matched pairs (one for each domain)`);
    
    // THE CRITICAL ASSERTION - this will FAIL and show the bug
    expect(domainCount).to.equal(2, 
      'BUG: Shared RSA modulus breaks certificate matching - should match both domains!');
      
    // When fixed, should find both domains
    expect(result).to.have.property('domain1.test');
    expect(result).to.have.property('domain2.test');
  });
});
