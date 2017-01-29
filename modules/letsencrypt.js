'use strict';

module.exports = function LetsEncrypt(commService, master, worker, moduleConfig, config) {
  let comm = commService('letsencrypt');
  let Promise = require('bluebird');
  let tls = require('tls');

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
            domain: domain,
            certs: certs
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
          }).then(val => res.end(val || '_'))
          .catch(err => {
            res.statusCode = 500;
            res.end('Error')
          });
        }
      }
    });
    return;
  }
  
  let LEX = require('greenlock');
  var leChallenge = require('le-challenge-standalone').create({ debug: true });
  let lex = LEX.create({
    debug: !!process.env.LETSENCRYPT_DEBUG,
    server: process.env.LETSENCRYPT_STAGING ? 'staging' : LEX.productionServerUrl,
    configDir: moduleConfig.configDir,
    challenge: leChallenge,
    approveDomains(opts, certs, cb) { // leave `null` to disable automatic registration
      let hostname = opts.domain;
      // Note: this is the place to check your database to get the user associated with this domain
      let email = moduleConfig.email;
      if(moduleConfig.domains &&
        moduleConfig.domains[hostname] &&
        moduleConfig.domains[hostname].email) {
        email = moduleConfig.domains[hostname].email;
      }
      if (certs) {
        opts.domains = certs.altnames;
      }
      else {
        opts.email = email;
        opts.agreeTos = moduleConfig.agreeTos;
      }
      cb(null, {options: opts, certs: certs});
    }
  });
  lex = Promise.promisifyAll(lex);
  lex.challenge = Promise.promisifyAll(lex.challenge);
    
  comm.onRequest('acmeChallenge', (data) => {
    return lex.challenge.getAsync(lex, data.host, data.key);
  });
    
  let getCertificatesAsync = require('memoizee')(lex.getCertificatesAsync, {
    maxAge: 10000, // prevent DoS
    promise: 'then' // cache also errors
  });
  
  comm.onRequest('getCertificates', data => {
    return getCertificatesAsync(data.domain, data.certs);
  });
}
