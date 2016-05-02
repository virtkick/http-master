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
    worker.fallbackSniCallback = (hostname, cb, sslConfig) => {
      if(sslConfig.letsencrypt) {
        comm.request('sniCallback', hostname).then(certData => {
          return tls.createSecureContext(certData);
        }).nodeify(cb);
      }
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
  
  let LEX = require('letsencrypt-express');//.testing();
  let lex = LEX.create({
    configDir: moduleConfig.configDir,
    approveRegistration(hostname, cb) { // leave `null` to disable automatic registration
      // Note: this is the place to check your database to get the user associated with this domain
      cb(null, {
        domains: [hostname],
        // TODO: allow per domain email change
        email: moduleConfig.email,
        agreeTos: moduleConfig.agreeTos
      });
    }
  });
  lex = Promise.promisifyAll(lex);
    
  comm.onRequest('acmeChallenge', (data) => {
    return lex.getChallengeAsync(lex, data.host, data.key);
  });
  
  let sniCallback = Promise.promisify(require('../lib/letsencryptSniCallback').create(lex));
  comm.onRequest('sniCallback', hostname => sniCallback(hostname));
}
