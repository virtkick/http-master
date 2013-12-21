var http = require('http');
var url = require('url');

module.exports = function(config, middleware) {
	var length = middleware.length ;
	
	console.log("Handler!", length);

	return {
		request: function(req, res) {
			var i = 0;

			function runMiddleware() { 
				
				if(i < length) {
					console.log("Running middleware", i);
					middleware[i++](req, res, function(err) {

						if(err) {
							console.log("err occured", err);
							return;
						}
						runMiddleware();
					});
				}
			}
			runMiddleware();
		}
	};
};