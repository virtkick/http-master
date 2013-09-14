/* This is sample preprocessor, modify it for your needs */
module.exports = function(argv, data) {
	console.log("Preprocessing...");
	return JSON.parse(data);
}