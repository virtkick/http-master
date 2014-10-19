var assert = require('chai').assert;

describe('addHeader middleware', function() {

  it('should throw on bad header definition', function() {
    var addHeader = require('../modules/middleware/addHeader')();

    try {
      addHeader.entryParser("dfdssfd");
      assert(false, "Failed parsing");
    } catch(err) {

    }
  });
  it('should set header', function() {
    var addHeader = require('../modules/middleware/addHeader')();

    var parsed = addHeader.entryParser("a = b");
    var headers = {};
    addHeader.requestHandler({headers: headers}, {}, function() {
      headers.a.should.equal('b');
    }, parsed);
  });
});