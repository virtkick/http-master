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
  it('should set header containing =', function() {
    var addHeader = require('../modules/middleware/addHeader')();

    var parsed = addHeader.entryParser("Strict-Transport-Security=max-age=15768000");
    var headers = {};
    addHeader.requestHandler({headers: headers}, {}, function() {
      headers['Strict-Transport-Security'].should.equal('max-age=15768000');
    }, parsed);
  });
});