'use strict';

// SOURCE: https://raw.githubusercontent.com/Daplie/letsencrypt-express/master/lib/sni-callback.js
// LICENSE: https://github.com/Daplie/letsencrypt-express/blob/master/LICENSE
// * replaced default tls.createSecureContext

var crypto = require('crypto');
var tls = {
  createSecureContext(opts) {
    return opts;
  }
};

module.exports.create = function (opts) {
  var ipc = {}; // in-process cache

  // function (/*err, hostname, certInfo*/) {}
  function handleRenewFailure(err, hostname, certInfo) {
    console.error("ERROR: Failed to renew domain '", hostname, "':");
    if (err) {
      console.error(err.stack || err);
    }
    if (certInfo) {
      console.error(certInfo);
    }
  }

  if (!opts) { throw new Error("requires opts to be an object"); }
  if (opts.debug) {
    console.debug("[LEX] creating sniCallback", JSON.stringify(opts, function(k,v){
      if(v instanceof Array)
         return JSON.stringify(v);
      return v;
    },'  '));
  }

  if (!opts.letsencrypt) { throw new Error("requires opts.letsencrypt to be a letsencrypt instance"); }

  if (!opts.lifetime) { opts.lifetime = 90 * 24 * 60 * 60 * 1000; }
  if (!opts.failedWait) { opts.failedWait = 5 * 60 * 1000; }
  if (!opts.renewWithin) { opts.renewWithin = 3 * 24 * 60 * 60 * 1000; }
  if (!opts.memorizeFor) { opts.memorizeFor = 1 * 24 * 60 * 60 * 1000; }

  if (!opts.approveRegistration) { opts.approveRegistration = function (hostname, cb) { cb(null, null); }; }
  //opts.approveRegistration = function (hostname, cb) { cb(null, null); };
  if (!opts.handleRenewFailure) { opts.handleRenewFailure = handleRenewFailure; }

  function assignBestByDates(now, certInfo) {
    certInfo = certInfo || { loadedAt: now, expiresAt: 0, issuedAt: 0, lifetime: 0 };

    var rnds = crypto.randomBytes(3);
    var rnd1 = ((rnds[0] + 1) / 257);
    var rnd2 = ((rnds[1] + 1) / 257);
    var rnd3 = ((rnds[2] + 1) / 257);

    // Stagger randomly by plus 0% to 25% to prevent all caches expiring at once
    var memorizeFor = Math.floor(opts.memorizeFor + ((opts.memorizeFor / 4) * rnd1));
    // Stagger randomly to renew between n and 2n days before renewal is due
    // this *greatly* reduces the risk of multiple cluster processes renewing the same domain at once
    var bestIfUsedBy = certInfo.expiresAt - (opts.renewWithin + Math.floor(opts.renewWithin * rnd2));
    // Stagger randomly by plus 0 to 5 min to reduce risk of multiple cluster processes
    // renewing at once on boot when the certs have expired
    var renewTimeout = Math.floor((5 * 60 * 1000) * rnd3);

    certInfo.loadedAt = now;
    certInfo.memorizeFor = memorizeFor;
    certInfo.bestIfUsedBy = bestIfUsedBy;
    certInfo.renewTimeout = renewTimeout;

    return certInfo;
  }

  function renewInBackground(now, hostname, certInfo) {
    if ((now - certInfo.loadedAt) < opts.failedWait) {
      // wait a few minutes
      return;
    }

    if (now > certInfo.bestIfUsedBy && !certInfo.timeout) {
      // EXPIRING
      if (now > certInfo.expiresAt) {
        // EXPIRED
        certInfo.renewTimeout = Math.floor(certInfo.renewTimeout / 2);
      }

      if (opts.debug) {
        console.debug("[LEX] skipping stagger '" + certInfo.renewTimeout + "' and renewing '" + hostname + "' now");
        certInfo.renewTimeout = 500;
      }

      certInfo.timeout = setTimeout(function () {
        var args = { domains: [ hostname ], duplicate: false };
        opts.letsencrypt.renew(args, function (err, certInfo) {
          if (err || !certInfo) {
            opts.handleRenewFailure(err, hostname, certInfo);
          }
          ipc[hostname] = assignBestByDates(now, certInfo);
        });
      }, certInfo.renewTimeout);
    }
  }

  function cacheResult(err, hostname, certInfo, sniCb) {
    if (certInfo && certInfo.fullchain && certInfo.privkey) {
      if (opts.debug) {
        console.debug('cert is looking good');
      }

      try {
        certInfo.tlsContext = tls.createSecureContext({
          key: certInfo.privkey || certInfo.key         // privkey.pem
        , cert: certInfo.fullchain || certInfo.cert     // fullchain.pem (cert.pem + '\n' + chain.pem)
        , ca: (opts.httpsOptions.ca ? opts.httpsOptions.ca + '\n' + certInfo.ca : certInfo.ca)
        , crl: opts.httpsOptions.crl
        , requestCert: opts.httpsOptions.requestCert
        , rejectUnauthorized: opts.httpsOptions.rejectUnauthorized
        });
      } catch(e) {
        console.warn("[Sanity Check Fail]: a weird object was passed back through le.fetch to lex.fetch");
        console.warn("(either missing or malformed certInfo.key and / or certInfo.fullchain)");
        err = e;
      }

      sniCb(err, certInfo.tlsContext);
    } else {
      if (opts.debug) {
        console.debug('cert is NOT looking good');
      }
      sniCb(err || new Error("couldn't get certInfo: unknown"), null);
    }

    var now = Date.now();
    certInfo = ipc[hostname] = assignBestByDates(now, certInfo);
    renewInBackground(now, hostname, certInfo);
  }

  function registerCert(hostname, sniCb) {
    if (opts.debug) {
      console.debug("[LEX] '" + hostname + "' is not registered, requesting approval");
    }

    if (!hostname) {
      sniCb(new Error('[registerCert] no hostname'));
      return;
    }

    opts.approveRegistration(hostname, function (err, args) {

      if (opts.debug) {
        console.debug("[LEX] '" + hostname + "' registration approved, attempting register");
      }

      if (err) {
        cacheResult(err, hostname, null, sniCb);
        return;
      }

      if (!(args && args.agreeTos && args.email && args.domains)) {
        cacheResult(new Error("not approved or approval is missing arguments - such as agreeTos, email, domains"), hostname, null, sniCb);
        return;
      }

      opts.letsencrypt.register(args, function (err, certInfo) {
        if (opts.debug) {
          console.debug("[LEX] '" + hostname + "' register completed", err && err.stack || null, certInfo);
          if ((!err || !err.stack) && !certInfo) {
            console.error((new Error("[LEX] SANITY FAIL: no error and yet no certs either")).stack);
          }
        }

        cacheResult(err, hostname, certInfo, sniCb);
      });
    });
  }

  function fetch(hostname, sniCb) {
    if (!hostname) {
      sniCb(new Error('[sniCallback] [fetch] no hostname'));
      return;
    }

    opts.letsencrypt.fetch({ domains: [hostname] }, function (err, certInfo) {
      if (opts.debug) {
        console.debug("[LEX] fetch from disk result '" + hostname + "':");
        console.debug(certInfo && Object.keys(certInfo));
        if (err) {
          console.error(err.stack || err);
        }
      }

      if (err) {
        sniCb(err, null);
        return;
      }

      if (certInfo) {
        cacheResult(err, hostname, certInfo, sniCb);
        return;
      }

      registerCert(hostname, sniCb);
    });
  }

  return function sniCallback(hostname, cb) {
    var now = Date.now();
    var certInfo = ipc[hostname];

    if (!hostname) {
      cb(new Error('[sniCallback] no hostname'));
      return;
    }

    //
    // No cert is available in cache.
    // try to fetch it from disk quickly
    // and return to the browser
    //
    if (!certInfo) {
      if (opts.debug) {
        console.debug("[LEX] no certs loaded for '" + hostname + "'");
      }
      fetch(hostname, cb);
      return;
    }



    //
    // A cert is available
    // See if it's old enough that
    // we should refresh it from disk
    // (in the background)
    //
    // TODO once ECDSA is available, wait for cert renewal if its due (maybe?)
    if (certInfo.tlsContext) {
      cb(null, certInfo.tlsContext);

      if ((now - certInfo.loadedAt) < (certInfo.memorizeFor)) {
        // these aren't stale, so don't fall through
        if (opts.debug) {
          console.debug("[LEX] certs for '" + hostname + "' are fresh from disk");
        }
        return;
      }
    }
    else if ((now - certInfo.loadedAt) < opts.failedWait) {
      if (opts.debug) {
        console.debug("[LEX] certs for '" + hostname + "' recently failed and are still in cool down");
      }
      // this was just fetched and failed, wait a few minutes
      cb(null, null);
      return;
    }

    if (opts.debug) {
      console.debug("[LEX] certs for '" + hostname + "' are stale on disk and should be will be fetched again");
      console.debug({
        age: now - certInfo.loadedAt
      , loadedAt: certInfo.loadedAt
      , issuedAt: certInfo.issuedAt
      , expiresAt: certInfo.expiresAt
      , privkey: !!certInfo.privkey
      , chain: !!certInfo.chain
      , fullchain: !!certInfo.fullchain
      , cert: !!certInfo.cert
      , memorizeFor: certInfo.memorizeFor
      , failedWait: opts.failedWait
      });
    }
    fetch(hostname, cb);
  };
};
