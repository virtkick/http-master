function processMatch(target, m) {
  var keyWithOffset;
  if (m) {
    for(var key in m) {
      var replaceFrom = key;
      if(!isNaN(key)) {
        replaceFrom = parseInt(key)+1;
      }
      var replaceValue = m[key];
      target = target.replace("[" + replaceFrom + "]", replaceValue?replaceValue:"");
    }
  }
  return target;
}

module.exports = function(href, match) {
  var pathMatchOffset = 0;
  return processMatch(href, match);
}