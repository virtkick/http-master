![http-master](https://raw.github.com/CodeCharmLtd/http-master/master/assets/http-master.png)
===============

[![Package version](https://img.shields.io/npm/v/http-master.svg)](https://www.npmjs.org/package/http-master)
[![Package version](https://img.shields.io/npm/dm/http-master.svg)](https://www.npmjs.org/package/http-master)
[![GPA](https://img.shields.io/codeclimate/github/encharm/http-master.svg)](https://codeclimate.com/github/encharm/http-master)
[![Code coverage](https://img.shields.io/codeclimate/coverage/github/encharm/http-master.svg)](https://codeclimate.com/github/encharm/http-master)
[![Build status](https://img.shields.io/travis/encharm/http-master.svg)](https://travis-ci.org/encharm/http-master)
[![Dependcies status](http://img.shields.io/gemnasium/encharm/http-master.svg)](https://gemnasium.com/encharm/http-master)


* [About](#about)
* [Installation and basic usage](#installandbasicusage)
* [Usage as a module](#module)
* [Watch config for changes](#watchconfig)
* [Use custom config loader](#configloader)
* Features
  * [Proxy](#proxy)
  * [URL rewrite](#urlrewrite)
  * [Redirect](#redirect)
  * [SSL](#ssl)
  * [Websockify](#websockify)
  * [Logging](#logging)
  * [HTTP authentication](#auth)
  * [Add header](#addheader)
  * [Compression / GZIP](#gzip)
  * [Regexp matching](#regexpmatching)
  * [Error handling](#reject)
  * [Serve static directory](#static)
  * [Advanced routing](#advancedrouting)
* [Upstart](#upstart)
* [Systemd](#systemd)
* [Contributors](#contributors)
* [Sponsors](#sponsors)
* [License](#license)

<a name="about" />
## About

http-master is a front end http service with with easy setup of reverse proxy/redirecting/other-actions logic. It means it was designed to run on your port 80 and 443 but can run on any. It can run as a module or as a standalone application. Your average use case could be having several web applications (node.js, rails, Java etc.) running on different internal ports and Apache running on port 8080. http-master allows you to easily define rules which domain should target which server and if no rules match, everything else could go to the Apache server. This way you setup your SSL in one place, in http-master and even non-SSL compatible http server can be provided with HTTPS. Many different flexible routing configurations are possible to set up.

Some of the features:
* Zero-effort HTTPS configuration. Provide only primary domain and configuration is loaded automatically from a given certificate directory.
* Support SNI extension - multiple SSL certificates on the same IP.
* Supports web sockets.
* Easy all in one place configuration for every listening port (eg. 80 and 443 together)
  * Setup reverse proxy with optional URL rewriting and optional regexp matching of host and path.
  * Setup redirect with optional regexp matching to construct final URL.
  * Setup basic static files server for a given route.
  * Setup Basic-AUTH for a given route (sponsored feature)
  * Create logs in apache format for any given point in routing setup.
  * Easily turn any local or remote TCP servers to web sockets. (websockify) Destination may be determined dynamically from a path.
  * Allows flexible definition of matching behaviour.
  * Enable compression on one, any or all of the routes.
  * Add headers to any defined route.
* Supports unicode domains out of the box.
* Multi-core/cpu friendly. Runs multiple instances/workers which will serve connections in a round-robin fashion. You can of course choose to run in a single process  without any workers, if you use http-master as a module or set worker count to 0.
* SSL tweaked to reasonable security level supporting TLS session resumption.
* Automatically watches for config changes and reloads the logic without any downtime. Simply start the deamon and add new rules while having the http-master online.
* Possibility to load config from Redis/etcd or another remote resource. (\*\*)
* May drop privileges to user/group once started.
* Forward secrecy support when running on Node >= 0.11.14

Ongoing development on:
* Easier and easier configuration format.
* Automatic management of time expiration of certificates.
* Request/response filters. (including to modify data)


(\*\*) Needs writing a custom config loader as a javascript file.


<a name="installandbasicusage"/>
## Installation and basic usage
Refer to section [Usage as a module](#module) if you are interested in that use-case.

To install, Node.JS is required to be installed and in your PATH:
`npm install -g http-master` (may be needed to run as root depending on your setup)

To run: `http-master --config http-master.conf`

Config files may be written in either JSON or YAML. For the sake of documentation (YAML allows comments) all examples will be written in YAML (but with JSON style).

Simple example config (more advanced features are convered elsewhere):

```YAML
watchConfig: true # watch config file for changes
ports: { # each port gets a separate configuration
  80: {
    router: {
      # redirect .net requests to .com
      'code2flow.net': 'redirect -> http://code2flow.com/[path]',
      # redirect http to https
      'secure.code2flow.com': 'redirect -> https://code2flow.com/[path]'
      # Proxy all traffic at domain code2flow.com to port 8099
      'code2flow.com' : 8099,
      # Proxy all traffic for any subdomains of services.com to IP 192.168.10.6 and port 8099
      '*.services.com' : '192.168.10.6:8099', 
      # Proxy remaning traffic to port 8080, for example Apache could run there
      '*' : 8080
    }
  }
  443: {
    router: {
      'code2flow.com': '127.0.0.1:9991',
       # choose application depending on path
      'service.myapp.com/downloads/*': 10443,
       # choose application depending on path
      'service.myapp.com/uploads/*': 15000,
      # all remaining https traffic goes to port 4443, for example apache
      "*": "127.0.0.1:4443"
    },
    ssl: {
      # needs to be provided for non-SNI browsers
      primaryDomain: "code2flow.com",
      # simply put certificates inside this dir, run with --debug=config to see what was read
      certDir: "/etc/http-master/certificates" 
    }
  },
  middleware: ['log -> /path/to/access.log' ], # Totally optional access.log, other middleware such as gzip could be added here
  modules: {
    appLog: '/path/to/app.log'
  },
  silent: false # if using above appLog, you can silence standard output
}
```

If for some reason automatic ssl setup is not working for you, you can debug the loaded certificates with the included `cert-scan` tool:
```
cert-scan /path/to/certificate-dir
```
and/or
```
http-master --config http-master.conf --show-rules
```

Alternatively you may setup ssl manually:
```YAML
# this part belongs to some port configuration
ssl : {
  key: "/path/to/crt/domain.key",
  cert: "/path/to/crt/domain.crt", # or .pem
 "ca": [ # may be one or many or a bundle (without array)
    "/path/to/ca/file/sub.class1.server.ca.pem"
  ],
  "SNI": {
    "*.codecharm.co.uk": {
      "key": "/path/to/crt/codecharm.co.uk.key",
      "crt": "/path/to/crt/codecharm.co.uk.crt",
      "ca" : "/path/to/cabundle/ca.pem" # may be an array if not bundle
    },
    "someotherdomain.com": {
      "key": "/path/to/crt/someotherdomain.com.key",
      "crt": "/path/to/crt/someotherdomain.com.crt",
      "ca": [
        "/path/to/ca/file/someca.pem"
      ]
    }
  }
}
```


<a name="module"/>
## Usage as a module

```
npm install --save http-master
```
```JavaScript
var HttpMaster = require('http-master');
var httpMaster = new HttpMaster();
httpMaster.init({
 // your config in here
}, function(err) {
 // listening
});
```
####Class: HttpMaster

####Event: 'allWorkersStarted'
`function()`
Emitted after succesful `.init()`

####Event: 'allWorkersReloaded'
`function()`
Emitted after succesful `.reload()`

####Event: 'logNotice'
`function(msg)`
Helpful logging information in case something got wrong.

####Event: 'logError'
`function(msg)`
Information about errors that could be logged.

####Event: 'error'
`function(err)`
Emitted on failure to listen on any sockets/routes or failure to use given configuration.

#### httpMaster.init(config, [callback])
Initialize http master with a given config. See the section about config to learn about acceptable input.
Callback if given will call `function(err)`. This function should be called only once.

#### httpMaster.reload(config, [callback])
Perform a zero-downtime reload of configuration. Should be very fast and ports will not stop listening.
Stopping httpMaster may be done using `httpMaster.reload({})`. Which should close all servers.

Note: Changing workerCount is the only thing that may not change.


<a name="watchconfig"/>
## Watch config for changes

Add `--watch` or add to config `"watchConfig": true`.

You may also trigger reload manually by sending USR1 signal to the master process. (only on *nix)

If you run via systemd then you may use the following `systemctl reload http-master.service`


<a name="configloader"/>
## Use custom config loader
 
See this repository for an example https://github.com/CodeCharmLtd/http-master-example-httploader

If you have an old 0.7.0 config, you can also load it with a provided config loader by:

`http-master --configloader /path/to/lib/node_modules/http-master/migrateV1Config.js --config oldconfig.json`

<a name="proxy"/>
## Proxy
Proxy is a default action what to do with a http request but in each place where a number or host are used, you could do a redirect as well.

### Proxy all requests from port 80 to port 4080
```YAML
# Short-hand syntax
ports: {
  80: 4080
}
```
```YAML
# A bit longer short-hand syntax (but could be used with ssl)
ports: {
  443: {
    router: 4080,
    ssl: {} # this needs setting up
  }
}
```
```YAML
# Normal syntax - baseline for extending
ports: {
  80: {
    router: {
      "*": 4080
    }
  }
}
```

### Proxy by domain name
```YAML
ports: {
  80: {
    router: {
      # two rules will match all domain1.com and www.domain1.com requsts
      "domain1.com": 3333,
      "www.domain1.com": 3334,
      # will match all domain2.com requsts (but not www.domain2.com)
      # and proxy it to a host with different ip in internal network
      "domain2.com": "192.168.1.1:80",
      # this will match every subdomain of domain4.com, but not domain4.com
      "*.domain4.com" : "5050",
      # this will match every subdomain of domain4.com, and domain4.com
      "*?.domain4.com": "some_machine_by_host:4020"
    }
  }
}
```

### Proxy by domain name and/or path
```YAML
ports: {
  80: {
    router: {
      # will match domain1.com/path1 or domain1/path/whatever or domain1/path/whatever/whatever
      # Last * in path match matches everything and makes last slash optional 
      "domain1.com/path1/*" : 5010,
      "domain1.com/path2/*" : 5011,
      # and rest goes to 5012 - this needs to be defined as patch matching
      # happens after domain matching
      "domain1.com/*" : 5012
    }
  }
}
```

### Proxy port settings
```YAML
ports: {
  80: {
    router: {
      "domain.com" : 5012
    },
    agentSettings: {
      keepAlive: true
    },
    proxyTargetTimeout: 1500,
    proxyTimeout: 1000
  }
}
```
In addition to `router`, following setting could be set per port:
* `agentSettings`, for full list of options check node documentation for [http.Agent](http://nodejs.org/api/http.html#http_class_http_agent). You can also set default agent settings at the root level in your config, using the same `agentSettings` name
* `proxyTargetTimeout` sets timeout for target connection
* `proxyTimeout` sets timeout for proxy connection

<a name="urlrewrite"/>
## URL rewrite
All proxy example can be adapted to also do URL rewriting. All matching rules can do either wildcard (implicit) regexp matching explicit regexp matching. Let's focus on implicit first.

```YAML
ports: {
  80: {
    router: {
      # * will match all subdomains
      # http://abc.domain.com will rewrite to -> /abc/
      # http://abc.domain.com/test will rewrite to -> /abc/test
      # http://xyz.abc.domain.com/test will rewrite to -> /xyz.abc/test
      "*.domain.com": "5050/[1]/[path]"
    }
  }
}
```
So what if you want to rewrite two levels of subdomains?
```YAML
ports: {
  80: {
    router: {
      "*.*.domain.com" : "5050/[1]/[2]/[path]"
    }
  }
}
```

You can also match paths and rewrite:
```YAML
ports: {
  80: {
    router: {
      "*.code2flow.com/test/*": "[1].somewhere.net/something/[2]"
    }
  }
}
```
Everything above and more you can also do with regexp matching which is described in [Regexp matching](#regexpmatching) section.

<a name="redirect"/>
## Redirect
Redirect is a feature implemented and invoked in a similiar way to proxy.
The different is that instead of proxy target, you should point rules to `"redirect -> http://target"`. The way target is constructed often is desired to be dynamic, for example that's how https to http redirect is usually used.

```YAML
ports: {
  80: {
    router: {
      # rewrite all http://atlashost.eu/* requests to https://atlashost/eu/*
      # [path] is a special macro that will be replaced with the request's pathname
      "atlashost.eu": "https://atlashost.eu/[path]",
      # for example proxy rest to apache's port
      '*' : 80443
    }
  },
  443: {
    router: {
      # proxy to actual application
      "atlashost.eu": 3333,
      # proxy rest to apache
      "*": 8080
    },
    ssl: {} # ssl should be configured here
  }
}
```

<a name="ssl"/>
## SSL
SSL can be configured for any port by simply providing "ssl" key to its entry, for example below is an auto-configuration example that also handles SNI:

```YAML
ports: {
  443: {
    router: {}, # your rules here
    ssl: {
      # Even SNI configuration requires at least one certificate that 
      # will be served to non-SNI browsers
      primaryDomain: "yourdomain.com",
      certDir: "/etc/http-master/certificates"
    }
  }
}
```

If for some reason auto-configuration does not work for you, it may be configured manually:
```YAML
ports: {
  443: {
    router: {}, # your rules here
    ssl: {
      key: "/path/to/key/domain.key",
      cert: "/path/to/key/domain.crt",
      ca: "/path/to/ca/bundle/ca.pem",
      # alternatively above could be written as
      # ca: ["/path/to/ca1.crt", "/path/to/ca2.crt"]
      SNI: {
        "*.codecharm.co.uk" : {
          key: "/path/to/key/codecharm.key",
          cert: "/path/to/key/codecharm.crt",
          ca: "/path/to/ca/bundle.pem"
        },
        "singledomain.net" : {
          key: "/path/to/key/singledomain.key",
          cert: "/path/to/key/singledomain.crt",
          ca: "/path/to/ca/bundle.pem"
        }
      }
    }
  }
}
```

<a name="websockify"/>
## Websockify
Websockify is a feature which can turn any TCP socket to a web socket.

```YAML
ports: {
  443: {
    router: {
      "myserver.net/services/ssh" : "websockify -> 22"
    },
    ssl: {} # ssl should be configured here
  }
}
```
The above makes it possible to access ssh server over https, for example from the browser. Simply connect to `wss://myserver.net/services/ssh`, it will initiate connection to ssh and proxy raw tcp data. Note: for it to be usable requires someone to implement openssh in asm.js.

To do something in reverse, for example access the above websocket via original ssh client on other machine, one could do the following:
```
npm install -g dewebsockify
dewebsockify wss://myserver.net/services/ssh 2222
ssh localhost -p 2222 # this will connect to the remote server over HTTPS!!
```

Another interesting use is running websockify to turn other services such as VNC to be usable by the browser. That's what [noVNC project]{http://kanaka.github.io/noVNC/} is already doing. In fact, http-master works out of the box with noVNC.

Interesting type of use would be to turn this into a general gateway to any TCP services (auth can be added for some security):

```YAML
ports: {
  443: {
    router: {
      # call to wss://myserver.net/tcpgate/otherserver.com/22 would connect
      # to remote server's SSH
      "myserver.net/tcpgate/*/*" : "websockify -> [1]:[2]"
    },
    ssl: {} # ssl should be configured here
  }
}
```
<a name="logging"/>
## Logging
To enable application log:
```YAML
ports: {}, # your port config here
modules: {
  appLog: "/path/to/app.log"
}
```

To enable general access log:
```YAML
middleware: ["log -> /path/to/access.log"],
ports: {} # your port config here
```

To enable logging per route (note, consult [Advanced routing](#advancedrouting) for more details)
```YAML
ports: {
  80: {
    router: {
      "myapp.net": ["log -> /path/to/myapp.log", 3333]
    }
  }
}
```
Rule of thumb is, wherever you had some target be it proxy or redirect, you can turn it to an array and place logging rule as first element.

Logging is in apache format.

Note: you may log to the same file from multiple routes, not a problem.

<a name="auth"/>
## HTTP authentication
```YAML
ports: {
  80: {
    router: {
      "myapp.net": ["auth -> file.passwd", 3333]
    }
  }
}
```
Basically you need to generate a passwd file and point http-master to it.
You can generate one with [node version of htpasswd]{https://www.npmjs.org/package/htpasswd}.

<a name="addheader"/>
## Add header
You can add one or more arbitrary requests to incoming headers/
```YAML
ports: {
  80: {
    router: {
      "myapp.net": ["addHeader -> X-Some-Header1=Value1", "addHeader -> X-Some-Header2=Value2", 3333]
    }
  }
}
```

<a name="gzip"/>
## Compression / GZIP

The single passed argument is compression level, from 1 to 9. 9 is most compression but slowest. To enable compression for all requests:

```YAML
middleware: ["gzip -> 9"],
ports: {
  router: {} #your rules here
}
```

To enable compression for a single route:
```YAML
ports: {
  router: {
    "domain.com" : ["gzip -> 9", 3333]
  }
}
```

<a name="regexpmatching"/>
## Regexp matching

Short-hand matching format with using `*` or `*?` can be replaced by using explicit regexp expression, such as this:

```YAML
ports: {
  80: {
    # [1] will contain app1 or app2, each number will reference regexp catch groups
    "^(app1|app2)\\.go\\.there\\.com": "5050/[1]"
  }
}
```
Only problem is the necessity to escape characters for string inclusion.
Named groups are also supported. Please open an issue to request more docs.

<a name="reject" />
## Error handling

HTTP master will report some errors in plain text, you can override this behaviour by providing a custom html error page:
```YAML
ports: {}, # your port config here
errorHtmlFile: "/path/to/error.html"
```
The html file may reference simple images which will be embedded to the response in form of base64. It cannot reference other files. Error html needs to be fast.

You can in fact trigger errors manually as well, for scheduled downtime for example:
```YAML
ports: {
  80: {
    # this will report error 503
    "domain.com" : "reject -> 503"
  }
}
```

<a name="static" />
## Serve static directory
You may also serve a static files , example:
```YAML
ports: {
  80: {
    "domain.com/*" : "static -> /home/domain/[1]"
  }
}
```
Please open an issue to request more docs.

<a name="advancedrouting"/>
## Advanced routing

Advanced routing refers to ability of nesting multiple layers of rules, such as:

```YAML
ports: {
  80 : {
    "*.domain.com" : ["log -> domain.log", {
      "*/path1" : 3333,
      "*/path2" : 3334,
      "*/*": 3335
    }]
  }
}
```
Please open an issue to request more docs.

<a name="systemd"/>
## Systemd

We provide an example systemd unit file. The config file is set to /etc/http-master/http-master.conf by default. Copy the `http-master.service` to /etc/systemd/system to use it.

* `systemctl start/stop/restart http-master`
* `systemctl enable http-master` - auto-start
* `systemctl reload http-master` - reload config with `kill -USR1`

<a name="upstart"/>
## Upstart

Also provided is `http-master-upstart.conf` which can be used with Upstart. As above, the config file is set to /etc/http-master/http-master.conf by default. Copy `http-master-upstart.conf` to `/etc/init/http-master.conf` to use it.

* `service http-master start`
* `service http-master stop`
* `service http-master restart`

<a name="contributors"/>
## Contributors

* Damian Kaczmarek <damian@codecharm.co.uk>
* Damian Nowak <nowaker@virtkick.com>
* Sergey Zarouski <sergey@webuniverse.io>

<a name="sponsors"/>
## Sponsors

[eeGeo](http://sdk.eegeo.com/) - basic HTTP authentication against htpasswd file [#32](https://github.com/CodeCharmLtd/http-master/issues/32)

Please open an issue if you would like a specific feature to be implemented and sponsored.

Example sponsored features could include:
* Automatically lazy-starting FastCGI apps such as PHP without overhead of running separate Apache and with better security handling.
* Home directory support
* Some form of .htaccess support
* Additional logging formats

<a name="license"/>
## License
Copyright (c) 2013-2015 [Virtkick, Inc.](https://www.virtkick.com/)

Licensed under the MIT license, see `LICENSE` for details.
