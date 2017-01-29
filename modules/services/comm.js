'use strict';
module.exports = function CommService(events, master, worker) {
  let processListeners = [];
  let Promise = require('bluebird');
  let controller = master?master:worker;
  let uuid = require('uuid');

  if(master) {
    return function(namespace) {
      return {
        send(name, data) {
          master.workers.forEach(function(worker) {
            worker.sendMessage(namespace + ':' + name, data);
          });
        },
        onRequest(name, handler) {
          events.on('msg:' + namespace + ':request:' + name, (reqData, worker) => {
            Promise.resolve().then(() => handler(reqData.data, worker)).then(resData => {
              worker.sendMessage(reqData.uuid, resData);;
            }).catch(err => {
              worker.sendMessage(reqData.uuid, {
                error: err.message
              })
            });
          });
        },
        on(name, cb) {
          events.on('msg:' + namespace + ':' + name, cb);
        }
      }
    };
  } else if(worker) {
    let requestMap = {};
    
    process.on('msg', msg => {
      if(requestMap[msg.type]) {
        if(msg.data && msg.data.error) {
          requestMap[msg.type].error(msg.data.error);
        } else {
          requestMap[msg.type](msg.data);
        }
      }
    });
    
    return function(namespace) {
      let workerInterface = {
        request(name, data, cb) {
          return new Promise((resolve, reject) => {
            let __uuid = uuid.v4();
            requestMap[__uuid] = data => {
              delete requestMap[__uuid];
              resolve(data);
            };
            requestMap[__uuid].error = err => {
              delete requestMap[__uuid];
              if(!(err instanceof Error)) {
                err = new Error(err);
              }
              reject(err);
            };
            
            worker.sendMessage(namespace + ':request:' + name, {
              data: data,
              uuid: __uuid
            });
          }).timeout(10000).nodeify(cb);
        },
        send(name, data) {
          worker.sendMessage(namespace + ':' + name, data);
        },
        on(name, cb) {
          events.on('msg:' + namespace + ':' + name, cb);
        }
      };
      
      return workerInterface;
    }
  }
}
