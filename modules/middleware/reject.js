var http = require('http');
var fs = require('fs');
var path = require('path');

function loadHtmlFile(errorHtmlFile) {
  var content = fs.readFileSync(errorHtmlFile).toString('utf8');
  content = content.replace(/src="(.+?)"/g, function(m, fileName) {
    var imagePath = path.join(path.dirname(errorHtmlFile), fileName);
    return 'src="data:image/'+path.extname(fileName).substr(1)+';base64,' + fs.readFileSync(imagePath).toString('base64') + '"';
  });
  return content;
}

module.exports = function RejectMiddleware(config, portConfig) {
  var content;
  var errorHtmlFile = portConfig.errorHtmlFile || config.errorHtmlFile;
  if(errorHtmlFile) {
    if(typeof errorHtmlFile === 'function') {
      content = errorHtmlFile();
    } else {
      content = loadHtmlFile(errorHtmlFile);
    }
  }

  return {
    requestHandler: function(req, res, next, target) {
      if(req.upgrade) return;
      res.statusCode = target.code;
      var head = {};

      content = target.html || content;

      var contentType = req.headers['accept'] || '';

      if(content && contentType.match(/text\/html/)) {
        head['Content-Type'] = 'text/html';
        res.writeHead(target.code, head);
        res.write(content);
        res.end();
      } else if(contentType.match(/application\/json/)) {
        head['Content-Type'] = 'application/json';
        res.writeHead(target.code, head);
        res.end(JSON.stringify({
          error: target.code + ' ' + (http.STATUS_CODES[target.code] || 'Forbidden')
        }));
      } else {
        head['Content-Type'] = 'text/plain';
        res.writeHead(target.code, head);
        res.end(target.code + ' ' + (http.STATUS_CODES[target.code] || 'Forbidden') );
      }

    },
    entryParser: function(entry) {
      var code;
      entry = entry || 403;
      if(typeof entry ==='string' || typeof entry === 'number') {
        code = parseInt(entry) || 403;
      }
      else {
        code = 403;
      }
      return {
        code: code,
        html: entry.htmlFile?loadHtmlFile(entry.htmlFile):undefined
      };
    }
  };
};
