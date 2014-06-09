var httpProxy = require('http-proxy');
var url = require('url');
var fs = require('fs');
var path = require('path');
var regexpHelper = require('../../regexpHelper');

function splitFirst(str, delim) {
  var index = str.indexOf(delim);
  if(index == -1)
    return [str];
  return [str.substr(0,index), str.substr(index)];
}

function parseEntry(entry) {
  var m;
  if(typeof entry == 'number')
    entry = entry.toString();

  var withPath = false;
  if(typeof entry == 'string') {
    withPath = !!entry.match(/(?:https?:\/\/)?.*\//);

    if((m = entry.match(/^\d+(?:|\/.*)$/))) {
      entry = '127.0.0.1:' + entry;
    }
    if(!entry.match(/https?:\/\//)) {
      entry = 'http://' + entry;
    }
  }
  entry = url.parse(entry, true, true)
  entry.withPath = withPath;
  return entry;
}


module.exports = function Proxy(portConfig) {
  
  var proxy = httpProxy.createProxyServer({xfwd: true, agent: false});
  var proxyFailErrorHandler;
  proxy.on('error', function(err, req, res) {
    if(proxyFailErrorHandler) {
      return proxyFailErrorHandler(err, req, res);
    }
    // forward to next route and save error for potential handler
    req.err = err;
    req.next();
  });

  if(portConfig.errorHtmlFile) {
    proxyFailErrorHandler = function(err, req, res) {
      res.writeHead(500, {
        'Content-Type': 'text/html'
      });
      res.write(content);
      res.end();
    };

    var content = fs.readFileSync(portConfig.errorHtmlFile).toString('utf8');
    content = content.replace(/src="(.+?)"/g, function(m, fileName) {
      var imagePath = path.join(path.dirname(portConfig.errorHtmlFile), fileName);
      return 'src="data:image/'+path.extname(fileName).substr(1)+';base64,' + fs.readFileSync(imagePath).toString('base64') + '"';
    });
  }

  var rewriteTargetAndPathIfNeeded = function(req, target) {
    if(!(req.pathMatch || req.hostMatch)) {
      return target;
    }

    var processed = regexpHelper(target.href, req.hostMatch, req.pathMatch);
          
    if(req.parsedUrl.search)
      processed += req.parsedUrl.search;

    var newTarget = url.parse(processed);
    if(target.withPath) {
      req.url = newTarget.path;
    }
    return newTarget;
  };

  return {
    requestHandler: function(req, res, next, dispatchTarget) {
      req.connection.proxy = proxy;
      req.next = next;
      // workaround for node-http-proxy/#591
      if(!req.headers.host) {
        req.headers.host = '';
      }
      var proxyTarget = rewriteTargetAndPathIfNeeded(req, dispatchTarget);

      req.headers.host = proxyTarget.host;
      proxy.web(req, res, {target: proxyTarget});
    },
    entryParser: function(entry) {
      return parseEntry(entry.target || entry);
    }
  };
}