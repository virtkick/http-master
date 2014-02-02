![http-master](https://raw.github.com/CodeCharmLtd/http-master/master/assets/http-master.png)
===============

* [About](#about)
* [Installation and usage](#installandusage)
* [Usage as a module](#installandusage)
* [Watch config for changes](#watchconfig)
* [Use custom config loader](#configloader)
* Modules
  * [Redirect](#redirect)
  * [URL rewrite](#urlrewrite)
  * [Logging](#logging)
* [Systemd](#systemd)

<a name="about" />
## About

http-master is a front end http service/reverse-proxy with easy setup of proxying/redirecting/other-actions logic.
It can run as a module or as a standalone application. Your average use case could be having several web applications running on different ports and Apache running on port 8080. http-master allows you to easily define rules which domain should target which server and if no rules match, everything else could go to the Apache server. This way you setup your SSL in one place, in http-master and even non-SSL compatible http server can be provided with HTTPS.

Some of the features:
* Easy all in one place configuration for every listening port (eg. 80 and 443 together)
  * Setup reverse proxy with optional URL rewriting and optional regexp matching of host and/or path.
  * Setup redirect with optional regexp matching to construct final URL.
  * Setup basic static server for a given route.
* Multi-core/cpu friendly. Runs multiple instances/workers which will serve connections in a round-robin fashion. You of course choose to run in the same process without any workers if you use http-master as a module.
* Support SNI extension - multiple SSL certificates on the same IP.
* SSL tweaked to reasonable security level supporting TLS session resumption.
* Automatically watches for config changes and reloads the logic without any downtime (\*). Simply start the deamon and add new rules while having the http-master online.
* Asynchronous logging module. Logs either to stdout or to file.
* Possibility to load config from Redis/etcd or another remote resource. (\*\*)
* May drop privileges to user/group once started.

Ongoing development on:
* Easier and easier configuration format.
* Automatic loading of certificates from specific directory. Zero-effort HTTPS configuration.
* Automatic management of time expiration of certificates.
* Request/response filters. (including ability to add headers, modify data)


(\*) Zero downtime is possible, currently downtime may be few milliseconds.
(\*\*) Needs writing a custom config loader.


<a name="installandusage"/>
## Installation and usage
Refer to section [Usage as a module](#module) if you are interested in that use-case.

To install:
`npm install -g http-master` (may be needed to run as root depending on your setup)

To run: `http-master --config http-master.conf`

Config files may be written in either JSON or YAML. For the sake of documentation all examples will be written in YAML.

Simple example config (more advanced features are convered elsewhere):

```YAML
watchConfig: true # watch config file for changes
logging: false # See "Logging" section on details
ports: { # each port gets a separate configuration
  80 {
    proxy: {
      'code2flow.com' : 8099, # Proxy all traffic at domain code2flow.com to port 8099
      '*.services.com' : '192.168.10.6:8099', # Proxy all traffic for any subdomains of services.com to IP 192.168.10.6 and port 8099
      '*' : 8080 # Proxy remaning traffic to port 8080, for example Apache could run there
    },
    redirect: {
      'code2flow.net': 'http://code2flow.com/[path]' # redirect .net requests to .com
    },
    static: {
      'assets.code2flow.com': '/var/www/code2flow/assets' # Serve static files from specific directory
    }
  }
  443: {
    proxy: {
      'code2flow.com': '127.0.0.1:9991',
      'service.myapp.com/downloads/*': 10443, # choose application depending on path
      'service.myapp.com/uploads/*': 15000, # choose application depending on path
      "*": "127.0.0.1:4443" # all remaining https traffic goes to port 4443
    },
    redirect: {
      'code2flow.net': 'https://code2flow.com/[path]' # redirect .net requests to .com
    },
    ssl: {
      SNI: { # SNI entries providing set of keys for each domain
        '*.service.myapp.com': {
          key: "/etc/keys/myapp_com.key",
          cert: "/etc/keys/myapp_com.pem",
          ca: [ # this may be an array or a path to bundle file
            "/etc/keys/startssl/ca.pem",
            "/etc/keys/startssl/sub.class1.server.ca.pem"
          ]
        }
      },
      key: "/etc/keys/star_code2flow_com.key",
      cert: "/etc/keys/star_code2flow_com.pem",
      ca: "/etc/keys/certum.crt" # bundle file
    }
  }
}
```

Each entry in the `ports` is the format that would be normally fed to `node-http-proxy`.

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
});;
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

<a name="redirect"/>
## Redirect
TODO (open an issue if you need info now)

<a name="urlrewrite"/>
## URL rewrite
TODO (open an issue if you need info now)

<a name="logging"/>
## Logging
Sample logging entry:
```
{"timestamp":1379159076291,"method":"GET","httpVersion":"1.0","headers":{"host":"test.pl:8081","user-agent":"ApacheBench/2.3","accept":"*/*","x-forwarded-for":"127.0.0.1","x-forwarded-port":33439,"x-forwarded-proto":"http"},"url":"/de629fb8-ff7f-4920-ab29-6a0f2f4176bf","statusCode":200,"responseTime":23}
```
Contains:
* timestamp - time when request started
* method - HTTP method
* httpVersion - protocol version
* url - URL from the request
* headers - all HTTP headers
* statusCode - code that application sent
* responseTime - time taken to finish the response

Log to stdout:
```YAML
logging: true,
ports: {
  # port configuration goes here
}

```

Log all requests to file:
```YAML
logging: {
  accessLog": "/var/log/http-master-access.log"
},
ports: {
  # port configuration goes here
}
```

Log to file and move existing standard output to separate file:
```YAML
logging: {
  accessLog": "/var/log/http-master-access.log"
  appLog": "/var/log/http-master.log"
},
ports: {
  # port configuration goes here
}
```

If you wish to have a specific formatting of access log, please open an issue with your request.

<a name="systemd"/>
## Systemd

We provide an example systemd unit file. The config file is set to /etc/http-master/http-master.conf by default. Copy the `http-master.service` to /etc/systemd/system to use it.

* `systemctl start/stop/restart http-master`
* `systemctl enable http-master` - auto-start
* `systemctl reload http-master` - reload config with `kill -USR1`

<a name="license"/>
## License
Copyright (c) 2013-2014 Code Charm Ltd

Licensed under the MIT license, see `LICENSE` for details.
