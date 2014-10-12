module.exports = function CommService(events, master, worker) {
  var processListeners = [];

  var controller = master?master:worker;

  if(master) {
    return function(namespace) {
      return {
        send: function(name, data) {
          master.workers.forEach(function(worker) {
            worker.sendMessage(namespace + ':' + name, data);
          });
        },
        on : function(name, cb) {
          events.on('msg:' + namespace + ':' + name, cb);
        }
      }
    };
  } else if(worker) {
    return function(namespace) {
      return {
        send : function(name, data) {
          worker.sendMessage(namespace + ':' + name, data);
        },
        on : function(name, cb) {
          events.on('msg:' + namespace + ':' + name, cb);
        }
      }
    }
  }
}