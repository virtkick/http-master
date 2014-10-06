module.exports = function LogFileService(events, master, worker) {

  if(master) {
//    console.log("ON MASTER");
    master.once('reload', function() {
      console.log("Reload");
    });
  } else {
//    console.log("ON WORKER");
  }
};