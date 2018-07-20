
let log = App.log.child( { module: 'helper_tb.multimedia-files' } );

let mongoose  = require('mongoose');


// field hiding from toJSON
function xformFields(doc, ret, options) {
  
}

/// Hooks

// pre validate
function preValidateHook(doc) {
  return new Promise( (resolve, reject) => {
    resolve();
  });
}

// pre save
function preSaveHook(doc) {
  return new Promise( (resolve, reject) => {
    resolve( );
  });
}

// pre remove
function preRemoveHook(doc) {
  return new Promise( (resolve, reject) => {
    removeFiles(doc)
      .then(resolve)
      .catch(reject);
  });
}

// post save
function postSaveHook(doc) {
   return new Promise( (resolve, reject) => {
    resolve();
  });
}


function removeFiles(doc){
  return new Promise( (resolve, reject) => {
    var paths = [];
    
    //Se añade el path del archivo original
    if(doc.path) paths.push(doc.path);
    //Se añaden los paths de los distintos tamaños
    if(doc.sizes){
      for(var i=0; i<doc.sizes.lenth; i++){
        var mediaFile = doc["s_"+doc.sizes[i]];
        if(mediaFile) paths.push[mediaFile.path];
      }
    }

    var Storage = new App.Storage(doc.service);

    //Se crea una promesa por cada path
    var prom = paths.map(path => { 
      return Storage.deleteFile({container: doc.container, path: path}).catch(err => Promise.resolve())
    });

    Promise.all(prom)
      .then(resolve)
      .catch(reject);

  });
}


module.exports = {
  xformFields: xformFields,
  // hooks
  preValidateHook: preValidateHook,
  preSaveHook: preSaveHook,
  postSaveHook: postSaveHook,
  preRemoveHook: preRemoveHook
};
