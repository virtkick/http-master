function processMatch(target, m, offset) {
	var keyWithOffset;
	if (m && m.length > 1) {
		for(var key in m) {
			if(offset && !isNaN(key)) {
				key = parseInt(key);
				keyWithOffset = (key + offset);
			}
			else
				keyWithOffset = key;
			target = target.replace("[" + keyWithOffset + "]", m[key]);
		}
	}
	return target;
}

module.exports = function(href, hostMatch, pathMatch) {
	var pathMatchOffset = 0;
	if(hostMatch) {
		pathMatchOffset = hostMatch.length - 1;
	}
	href = processMatch(href, hostMatch);

	href = processMatch(href, pathMatch, pathMatchOffset);
	return href;
}