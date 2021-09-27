'use strict';

module.exports = function LetsEncrypt(commService, master, worker, moduleConfig, config) {
  let comm = commService('letsencrypt');

  if(!moduleConfig.email) {
    throw new Error('letsencrypt.email needs to be set for the module to work');
  }
  if(!moduleConfig.agreeTos) {
    throw new Error('letsencrypt.agreeTos needs to be set for the module to work');
  }
  if(!master) {
    let whitelist = {};
        
    Object.keys(moduleConfig.domains || {})
      .forEach(domain => {
        whitelist[domain] = true;
        whitelist['www.' + domain] = true;
      });
    process.on('dispatchTable', table => {
      Object.keys(table).map(entry => entry = entry.split(/:/)[0])
        .forEach(domain => whitelist[domain] = true);
    });
    
    var leSni = require('le-sni-auto').create({
      renewWithin: 10 * 24 * 60 * 60 * 1000       // do not renew prior to 10 days before expiration
      , renewBy: 5 * 24 * 60 * 60 * 1000         // do not wait more than 5 days before expiration
      // key (privkey.pem) and cert (cert.pem + chain.pem) will be provided by letsencrypt
      , tlsOptions: { rejectUnauthorized: true, requestCert: false, ca: null, crl: null }
      , getCertificatesAsync: function (domain, certs) {
          return comm.request('getCertificates', {
            domain,
            certs,
          });
      }
    });
    worker.fallbackSniCallback = (hostname, cb, sslConfig) => {
      if(sslConfig.letsencrypt && whitelist[hostname]) {
        return leSni.sniCallback(hostname, cb);
      } else cb(null);
    };
    
    worker.middleware.push(function() {
      return {
        requestHandler(req, res, next) {
          var acmeChallengePrefix = '/.well-known/acme-challenge/';
          if(req.url.indexOf(acmeChallengePrefix) !== 0) {
            return next();
          }
          var key = req.url.slice(acmeChallengePrefix.length);
          comm.request('acmeChallenge', {
            key: key,
            host: req.headers.host
          }).then(val => {
            return res.end(val || '_');
          }).catch(err => {
            res.statusCode = 500;
            res.end('Error')
          });
        }
      }
    });
    return;
  }
  
  const ACME = require('@root/acme');
  const Keypairs = require('@root/keypairs');
  const packageAgent = 'http-master/1.3.0';
  const memoizee = require('memoizee');
  
  const { configDir } = moduleConfig;
  const { join } = require('path');
  const { writeFile, readFile } = require('fs').promises;
  const PRIVKEY_PATH = join(configDir, 'privkey.pem');
  const ACCOUNT_PATH = join(configDir, 'account.json');

  const subscriberEmail = moduleConfig.email;
  const directoryUrl = process.env.LETSENCRYPT_STAGING ?
    'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory';


  const notify = (ev, args) => {
    // console.log('Notify', ev, args);
  };
  
  const acme = ACME.create({ maintainerEmail: 'rush+letsencrypt@virtkick.com', packageAgent, notify})

  const acmeInitPromise = (async () => {
    await acme.init(directoryUrl);
    return await Promise.all([
      getOrCreateAccount(),
      getOrCreateServerKey(),
    ]);
  })();

  const challengeStore = {};

  async function getOrCreateServerKey() {
    try {
      return await readFile(PRIVKEY_PATH, 'ascii')
    } catch (err) {
      // You can generate it fresh
      const serverKeypair = await Keypairs.generate({ kty: 'RSA', format: 'jwk' });
      const serverKey = serverKeypair.private;
      const serverPem = await Keypairs.export({ jwk: serverKey });
      await writeFile(PRIVKEY_PATH, serverPem, 'ascii');
      return serverPem;
    }
  }

  async function getOrCreateAccount() {
    try {
      const { account, accountKey, directoryUrl: savedDirectoryUrl } = JSON.parse(await readFile(ACCOUNT_PATH));
      if (savedDirectoryUrl !== directoryUrl) {
        throw new Error('Directory URL does not match');
      }
      return { account, accountKey };
    } catch (err) {
      const accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
      const accountKey = accountKeypair.private;

      const agreeToTerms = moduleConfig.agreeTos;

      const account = await acme.accounts.create({
        subscriberEmail,
        agreeToTerms,
        accountKey,
      });

      writeFile(ACCOUNT_PATH, JSON.stringify({ account, accountKey, directoryUrl }));

      return { account, accountKey };
    }
  }

  async function generateCert(domain, certs) {
    const [ { account, accountKey }, serverPem ] = await acmeInitPromise;

    const serverKey = await Keypairs.import({ pem: serverPem });

    const CSR = require('@root/csr');
    const PEM = require('@root/pem');  
    const encoding = 'der';
    const typ = 'CERTIFICATE REQUEST';

    const domains = [ domain ];
    const csrDer = await CSR.csr({ jwk: serverKey, domains, encoding });
    const csr = PEM.packBlock({ type: typ, bytes: csrDer });

    const challenges = {
      'http-01': {
        init(opts) {
          return null;
        },
        async set(data) {
          const challenge = data.challenge;
          challengeStore[challenge.token] = challenge.keyAuthorization;
        },
        async get(data) {
          const challenge = data.challenge;
          return { keyAuthorization: challengeStore[challenge.key] };
        },
        async remove(data) {
          delete challengeStore[data.key];
        }
      },
    };

    const pems = await acme.certificates.create({
      account,
      accountKey,
      csr,
      domains,
      challenges
    });

    return {
      privkey: serverPem,
      cert: pems.cert,
      chain: pems.chain,
      expiresAt: (new Date(pems.expires)).getTime(),
      issuedAt: Date.now(),
      subject: domain,
      altnames: [],
    };
  }

  const generateAndCacheCert = memoizee(async (domain, certs) => {
    const certPath = join(configDir, `cert-${domain}.json`);
    const cert = await generateCert(domain, certs);
    await writeFile(certPath, JSON.stringify(cert));
    return cert;
  }, { maxAge: 120000, promise: true, primitive: true });

  const readCert = memoizee(async domain => {
    const certPath = join(configDir, `cert-${domain}.json`);
    return JSON.parse(await readFile(certPath));
  }, {promise: true, primitive: true })

  async function getCertificatesAsync(domain, certs) {
    try {
      const cert = await readCert(domain);
      if (cert.expiresAt > Date.now) {
        readCert.delete(domain);
        throw new Error(`Certificate for ${domain} has expired`);
      }
      return cert;
    } catch (err) {
      return generateAndCacheCert(domain, certs);
    }
  }

  comm.onRequest('acmeChallenge', async (data) => {
    const res = challengeStore[data.key];
    return res;
  });
  
  comm.onRequest('getCertificates', async data => {
    return getCertificatesAsync(data.domain, data.certs);
  });
}
