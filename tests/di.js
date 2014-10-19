var DI = require('../src/di');
var assert = require('chai').assert;
require('should');

describe('Dependency Injection', function() {

  var di;
  beforeEach(function() {
    di = new DI();
  });

  function checkAlreadyBound(method) {
    try {
      di[method]('foo', function() {});
      assert(false, 'exception should have been called');
    } catch(err) {
      err.message.should.equal('\'foo\' already bound');
    }    
  }

  it('should throw exception on missing dependency when resolving by function', function() {
    try {
      di.resolve(function(a, b, c) {
      });
      assert(false, 'Exception should have been called');
    }
    catch(thrs) {
      thrs.message.should.equal('No recipe to resolve \'a\'')
    }
  });

  it('should throw exception on missing dependency when resolving by string', function() {
    try {
      di.resolve('a');
      assert(false, 'Exception should have been called');
    }
    catch(thrs) {
      thrs.message.should.equal('No recipe to resolve \'a\'')
    }
  });

  it('should resolve bound type without dependencies', function() {
    function MyType( ) { // test also empty space in function parens
    }
    di.bindType('foo', MyType);
    
    var resolved = di.resolve('foo');
    resolved.should.be.instanceof(MyType),
    assert(di.resolve('foo') === resolved);

    checkAlreadyBound('bindType');
  });

  it('should resolve bound type without explicit name without dependencies', function() {
    function MyType() {
    }
    di.bindType(MyType);
    
    var resolved = di.resolve('myType');
    assert(resolved instanceof MyType);
    assert(di.resolve('myType') === resolved);
    di.resolve('MyType').should.equal(MyType);
  });

  it('should resolve bound type with dynamic dependencies', function() {
    function MyType(param) {
      this.foo = param;
    }
    di.bindType(MyType);
    var resolved = di.resolve('myType', {
      param: 'bar'
    });
    resolved.foo.should.equal('bar');
  });

  it('should create transient type without dependencies', function() {
    var cnt = 0;
    function MyType() {
      cnt++;
    }
    di.bindTransientType(MyType);
    var instance1 = di.resolve('myType');
    var instance2 = di.resolve('myType');
    assert(instance1 !== instance2, 'expecting separate instances');
    cnt.should.equal(2);
  });

  it('should fail with missing dependencies for dependencies', function() {
    function MyType1(param) {

    }
    function MyType2(myType) {

    }
    di.bindType('myType', MyType1);
    di.bindType(MyType2);
    try {
      di.resolve('myType2');
      assert(false, 'expecting exception');
    } catch(err) {
      err.message.should.equal('No recipe to resolve \'param\'');
    }
  });

  it('should apply dynamic dependencies for dependencies', function() {
    function MyType1(param) {
      this.foo = param;
    }
    function MyType2(myType) {
      myType.foo.should.equal('bar');
      this.myType = myType;
    }
    di.bindType('myType', MyType1);
    di.bindType(MyType2);
    var instance = di.resolve('myType2', {
      param: 'bar'
    })
    assert(instance instanceof MyType2);
    assert(instance.myType instanceof MyType1);
  });

  it('should bind and resolve instance', function() {
    var instance = {};
    di.bindInstance('foo', instance);

    assert(di.resolve('foo') === instance, 'resolve should return instance');
    checkAlreadyBound('bindInstance');
  });

  it('should bind and resolve from resolver function', function() {
    var instance = {};
    di.bindResolver('foo', function() {
      return instance;
    });
    assert(di.resolve('foo') === instance);

    checkAlreadyBound('bindResolver');
  });

  it('should clone di object', function() {

    var a = 'a', b1 = 'b1', b2 = 'b2';
    di.bindInstance('a', a);

    var clone = di.clone();
    di.bindInstance('b', b1);
    clone.bindInstance('b', b2);

    function tester(a, b) {
      this.a = a;
      this.b = b;
    }

    var resolvedOriginal = di.resolve(tester);
    var resolvedClone = clone.resolve(tester);
    resolvedOriginal.a.should.equal(a);
    resolvedOriginal.b.should.equal(b1);
    resolvedClone.a.should.equal(a);
    resolvedClone.b.should.equal(b2);
  });

  it('should make a behaving child object', function() {
    var a = 'a', b1 = 'b1', b2 = 'b2';

    di.bindInstance('a', a);
    var child = di.makeChild();
    child.resolve('a').should.equal(a);
    di.bindInstance('b', b1);
    child.resolve('b').should.equal(b1);
    child.bindInstance('a', 'a2');
    child.resolve('a').should.equal('a2');
  });

  it('should support working onMissing handler', function() {
    var instance = {};
    di.onMissing = function(name) {
      name.should.equal('test');
      return instance;
    }
    di.resolve('test').should.equal(instance);
  });

  it('should handle error when resolving with bad argument', function() {
    try {
      di.resolve({});
      assert(false, 'should have thrown exception');
    } catch(err) {
      err.message.should.equal('Unknown type to resolve');
    }
  });
  it('should handle error when binding constructor without a name', function() {
    try {
      var f = function() {};
      di.bindType(f);
      assert(false, 'should have thrown exception');
    } catch(err) {
      err.message.should.equal('Unable to resolve name from function'); 
    }
  });
  it('should handle constructor with a camelCase', function() {
    function camelType() {}
    di.bindType(camelType);
    di.resolve('camelType').should.be.instanceof(camelType);
  });
});