'use strict';
var extend = require('extend');
var assert = require('assert');

var functionRegex = /function\s*([^()]*)\s*\(([^)]*)/;
// get function arguments as array
function functionParameters(f) {
  assert(typeof f === 'function');
  var matches = functionRegex.exec(f.toString());
  if(!matches || !matches[2].length) {
    return [];
  }
  return matches[2].split(/[,\s]+/).filter(function(str) {
    return str.length;
  });
}
function functionName(f) {
  assert(typeof f === 'function');
  var matches = functionRegex.exec(f.toString());
  if(!matches || !matches[1].length) {
    return null;
  }
  return matches[1];
}

// call new operator with array of arguments
function construct(constructor, args) {
  function F() {
    return constructor.apply(this, args);
  }
  F.prototype = constructor.prototype;
  return new F();
}

function DI() {
  this.mapping = {};
  this.parent = null;
  this.onMissing = function(name) {
  }
}

function stringToCamelCase(str) {
  return str.replace(/^\w/g, function(txt) {
    return txt.charAt(0).toLowerCase();
  });
}

function bindTypeGeneric(doCache, name, type) {
  // implicit name from function name
  if(typeof name === 'function') {
    type = name;
    var constructorName = functionName(type);
    if(!constructorName) {
      throw new Error('Unable to resolve name from function');
    }
    // implicitly bind function MyType {} to
    // MyType - type instance
    // myType - instance
    var instanceName = stringToCamelCase(constructorName);
    if(instanceName !== constructorName) {
      try {
        this.bindInstance(constructorName, type);
      } catch(err) {
        // ignore error since we are already doing this implicitly
      }
    }
    name = instanceName;
  }
  if(this.mapping[name]) {
    throw new Error('\'' + name + '\' already bound');
  }

  var self = this;
  var mapping = {
    // this.cache is saved in mapping
    // 'this' is mapping
    resolve: function(overrides) { 
      var result = this.cache;
      if(!result) {
        result = construct(type, functionParameters(type).map(function(paramName) {
          return self.resolve(paramName, overrides);
        }));
      }
      if(doCache) {
        this.cache = result;
      }
      return result;
    }
  };
  this.mapping[name] = mapping;
}

DI.prototype.bindInstance = function(name, instance) {
  if(this.mapping[name]) {
    throw new Error('\'' + name + '\' already bound');
  }
  this.mapping[name] = {
    resolve: function() {
      return instance;
    }
  };
};

DI.prototype.bindResolver = function(name, resolver) {
  if(this.mapping[name]) {
    throw new Error('\'' + name + '\' already bound');
  }
  this.mapping[name] = {
    resolve: resolver
  };
}

DI.prototype.bindType = function(name, type) {
  return bindTypeGeneric.call(this, true, name, type);
};

DI.prototype.bindTransientType = function(name, type) {
  return bindTypeGeneric.call(this, false, name, type);
};

DI.prototype.resolve = function(obj, overrides) {
  var dependencyMap = extend({}, this.mapping, overrides);
  var args;
  var resolved;

  if(typeof obj === 'function') {
    args = functionParameters(obj);
    resolved = construct(obj, args.map(this.resolve.bind(this)));
  } else if(typeof obj === 'string') {
    if(dependencyMap[obj]) {
      if(dependencyMap[obj].resolve) {
        resolved = dependencyMap[obj].resolve(overrides);
      } else {
        resolved = dependencyMap[obj];
      }
    }
  } else {
    throw new Error('Unknown type to resolve');
  }

  if(typeof resolved ==='undefined' && this.onMissing) {
    resolved = this.onMissing(obj);
  }

  if(typeof resolved === 'undefined' && this.parent) { // search in parent if not found
    resolved = this.parent.resolve(obj, overrides);
  }

  if(typeof resolved === 'undefined' && !dependencyMap[obj]) {
    throw new Error('No recipe to resolve \'' + obj + '\'');
  }

  return resolved;
}

DI.prototype.clone = function() {
  var cloned = new DI();
  cloned.mapping = extend({}, this.mapping);
  cloned.parent = this.parent;
  cloned.onMissing = this.onMissing;
  return cloned;
};

DI.prototype.makeChild = function() {
  var child = construct(DI, Array.prototype.slice.apply(arguments));
  child.parent = this;
  return child;
};

module.exports = DI;
