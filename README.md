rush-http-proxy
===============

rush-http-proxy is based on node-http-proxy, the extra features are:
* Run multiple host/port configurations on a single instance.
* Run worker instances to parallelize workload. Number of workers defaults to CPU number
* Support reading SSL SNI configurations from file and CRT bundle files. This means handling multiple SSL certificates on the same domain.
* Watch for config changes and reloads the proxy logic without any downtime.
* Simple redirect. Redirect http to https or any simple direct directs. No regexp yet.
* Asynchronous logging module. Logs either to stdout or to file.

Future plans:
* Improve logging to format string to apache format.
* Logging per route.
* Systemd support.
* Regexps in redirect.

Usage
===============

`rush-http-proxy --config config.json`

Example config:

```
{
  "ports": {
    "80": {
        "router": {
            "code2flow.*": "127.0.0.1:8099",
            ".*": "127.0.0.1:8080"
        }
    },
    "443": {
        "router": {
            "code2flow.*": "127.0.0.1:9991",
            "service.myapp.com/downloads/.*": "127.0.0.1:10443",
            "service.myapp.com/uploads/.*": "127.0.0.1:15000",
            ".*": "127.0.0.1:4443"
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
Consult https://github.com/nodejitsu/node-http-proxy

Watch config for changes
===============
Add `--watch` or add to config `"watchConfig": true`.

You may also trigger reload manually by sending USR1 signal to the master process. (only on *nix)

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
    "logFile": "/var/log/rush-http-proxy.log"
  },
  "ports": {
    ...
  }
}
```
