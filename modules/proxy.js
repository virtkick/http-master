var httpProxy = require('http-proxy');
var DispatchTable = require('../DispatchTable');
var url = require('url');
var fs = require('fs');
var path = require('path');

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
    if(!entry.match(/https?\/\//)) {
      entry = 'http://' + entry;
    }
  }
  entry = url.parse(entry, true, true)
  entry.withPath = withPath;
  entry.ws = true;
  return entry;
}

var proxy = httpProxy.createProxyServer({agent: null, xfwd: true});
var regexpHelper = require('../regexpHelper');

var proxyFailErrorHandler;

proxy.on('error', function(err, req, res) {
  if(proxyFailErrorHandler) {
    return proxyFailErrorHandler(err, req, res);
  }
  // forward to next route and save error for potential handler
  req.err = err;
  req.next();
});

module.exports = {
  priority: 8,
  middleware: function(config) {
    if(!config.proxy) return;

    if(config.errorHtmlFile) {
      var content = fs.readFileSync(config.errorHtmlFile).toString('utf8');
      content = content.replace(/src="(.+?)"/g, function(m, fileName) {
        var imagePath = path.join(path.dirname(config.errorHtmlFile), fileName);
        return 'src="data:image/'+path.extname(fileName).substr(1)+';base64,' + fs.readFileSync(imagePath).toString('base64') + '"';
      });

      proxyFailErrorHandler = function(err, req, res) {
        res.writeHead(500, {
          'Content-Type': 'text/html'
        });
        res.write(content);
        res.end();
      };
    }

    var rewriteTargetAndPathIfNeeded = function(req, target) {
      if(!(req.pathMatch || req.hostMatch)) {
        return target;
      }

      var newTarget = url.parse(regexpHelper(target.href, req.hostMatch, req.pathMatch));
      if(target.withPath) {
        req.url = newTarget.path;
        newTarget.withPath = true;
      }
      return newTarget;
    };

    return new DispatchTable({
      config: config.proxy,
      requestHandler: function(req, res, next, target) {
        req.connection.proxy = proxy;
        req.next = next;
        target = rewriteTargetAndPathIfNeeded(req, target);
        target.query = req.parsedUrl.query;
        proxy.web(req, res, {target: target});
      },
      upgradeHandler: function(req, socket, head, target) {
        target = rewriteTargetAndPathIfNeeded(req, target);

        target.query = req.parsedUrl.query;
        proxy.ws(req, socket, head, {target: target});
      },
      entryParser: function(entryKey, entry) {
        return [entryKey,  parseEntry(entry)];
      },
      port: config.port
    });
  }
};