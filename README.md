http-master
===============

http-master is designed to run as a front end http service/reverse-proxy with easy setup of proxying logic.
Your average use case could be having several web applications running on different ports and Apache running on port 8080. http-master allows you to easily define rules which domain should target which server and if no rules match, everything else could go to the Apache server. This way you setup your SSL in one place, in http-master and even non-SSL compatible http server can be provided with HTTPS.

Some of the features:
* Allow for fast host-based matching and any regexp matching rules.
* Match by host-only, host and path or path-only. Allow for regexp path matching.
* Single instance can cover multiple IP/Port configurations each with different logic.
* Multi-core/cpu friendly. Runs multiple instances and each will compete to serve a new connection.
* Support reading SSL SNI configurations from file and CRT bundle files. This means handling multiple SSL certificates on the same domain is very easy.
* Watches for config changes and reloads the logic without any downtime. Simply start the deamon and add new rules while having the http-master online.
* Redirect and URL rewrite support.
* Asynchronous logging module. Logs either to stdout or to file.
* Link to custom config preprocessor so that you may devise your own config file format.
* Drops privileges to user/group once started.

Usage
===============

`http-master --config config.json`

Example config:

```
{
  "ports": {
    "80": {
        "proxy": {
            "code2flow.*": "127.0.0.1:8099",
            "*": "127.0.0.1:8080"
        }
    },
    "443": {
        "proxy": {
            "code2flow.*": "127.0.0.1:9991",
            "service.myapp.com/downloads/*": "127.0.0.1:10443",
            "service.myapp.com/uploads/*": "127.0.0.1:15000",
            "*": "127.0.0.1:4443"
        },
        "https": {
            "SNI": {
                ".*service.myapp.com": {
                    "key": "/etc/keys/myapp_com.key",
                    "cert": "/etc/keys/myapp_com.pem",
                    "ca": [
                        "/etc/keys/ca.pem",
                        "/etc/keys/sub.class1.server.ca.pem"
                    ]
                }
            },
            "key": "/etc/keys/star_code2flow_com.key",
            "cert": "/etc/keys/star_code2flow_com.pem",
            "ca": "/etc/keys/certum.crt"
        }
    }
  }
}
```

Each entry in the `ports` is the format that would be normally fed to `node-http-proxy`.


Watch config for changes
===============
Add `--watch` or add to config `"watchConfig": true`.

You may also trigger reload manually by sending USR1 signal to the master process. (only on *nix)

Use custom config loader
===============
See this repository for an example https://github.com/CodeCharmLtd/http-master-example-httploader

Redirect
===============
Put a configuration object under "redirect" in a specific port configuration. You may mix redirects and router options.
For documentation purpose, comments will be put to the JSON.
```
{
  "ports": {
      "80": {
        "redirect": {
          "test.pl/test" : "anothersite.pl" // redirect only when path /test matches
          "test2.pl/" : "anothersite.pl" // redirect only from main site
          "test3.pl" : "anothersite.pl/[path]" // redirect from all test3.pl paths and translate path to new host
          "test4.pl" : "https//test4.secure.pl/[path]" // redirect from test4.pl to https site
        },
        "router": {
          ...
        }
      }
  }
```

Logging
===============
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
```
{
  "logging": true,
  "ports": {
    ...
  }
}
```

Log to file:
```
{
  "logging": {
    "logFile": "/var/log/http-master.log"
  },
  "ports": {
    ...
  }
}
```

systemd unit file
=================
We provide an example systemd unit file for the proxy. The config file is set to /etc/http-proxy/config.json by default. Copy the `http-proxy.service` to /etc/systemd/system to use it.

* `systemctl start/stop/restart http-proxy`
* `systemctl enable http-proxy` - auto-start the proxy
* `systemctl reload http-proxy` - reload config with `kill -USR1`

