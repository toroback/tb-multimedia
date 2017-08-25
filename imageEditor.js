let fs  = require('fs-extra');
var gm = require('gm');
let path = require('path');


let app;      // reference to toroback
let log;      // logger (toroback's child)

let defaults = {
  localPath:       'fs/'
}

const sizesSpec = {
  t: {
    size: 160
  },

  s:{
    size: 240
  },

  m: {
    size: 640
  },

  l: {
    size: 1280
  },

  xl: {
    size: 1600
  }
}


class ImageEditor{

  constructor(_app, src){
    app = _app;      // reference to toroback
    log = _app.log.child({module:'multimedia-imageEditor'});  // logger (toroback's child)

    this.src = src;
  }

  edit(options, dest){
    return new Promise( (resolve, reject) => {
      if(!dest || !dest.service || !dest.container){
        reject(new Error("An output must be specified"));
      }else{
        let rootDir = defaults.localPath + Math.random().toString(36).slice(2);
        createWorkDir(rootDir)
          .then(rootDir =>  load(this.src, rootDir))
          .then(file => modifyImage(file, options))
          .then(files => save(files, dest))
          .then(resolve)
          .catch(reject)
          .then(res => fs.remove(rootDir));
      }
    });
  }
}


function createWorkDir(rootDir){
  return new Promise((resolve, reject) =>{
    fs.mkdirSync(rootDir);
    fs.mkdirSync(rootDir + "/tmp");
    resolve(rootDir);
  })
}

/**
 * Carga un archivo con la informacion del input
 * @param  {Object} input [description]
 * @param  {String} input.service Servicio del que cargar el archivo (gcloud, local, aws)
 * @param  {String} input.container Contedor del archivo
 * @param  {String} input.path Path del archivo
 * @return {[type]}       [description]
 */
function load(input, dir){
  return new Promise( (resolve, reject) => {
    // let imageId   = Math.random().toString(36).slice(2);
    // let dir = defaults.localPath + imageId;
    let imageName = "orig";
    let dest   = dir + "/" + imageName;
    
    // fs.mkdirSync(dir);
    // fs.mkdirSync(dir + "/tmp");

    let fileStream = fs.createWriteStream(
      dest,
      { defaultEncoding: 'binary' }
    );
    //TODO: cargar el archivo del servicio que sea necesario
    let storage  = new app.Storage(input.service);
    if (storage) {
      storage.downloadFile({ container: input.container, file: input.path, res: fileStream })
        .then( res =>  resolve({path: dest, dir: dir, name: imageName}))
        .catch( (err) => {
          fs.unlink(dest, (err) => { log.warn(err) });
          reject(err);
        });
    }else {
      reject(new Error('Input storage not configured: ' + input.service));
    }
  });
}

function save(files, output){
  return new Promise( (resolve, reject) => {
    if(files && files.length > 0){
      let promises = [];
      
      files.forEach( file=> {
        promises.push(uploadFile(file, output)
          .catch(err =>{
            console.log(err);
            return Promise.resolve(undefined);
        }));
      });

      Promise.all(promises)
        .then(res => {
            let images = res.filter(elem => elem != undefined);
            resolve({images: images});
        })
        .catch(reject);
    }else{
      resolve({images:[]});
    }
  });
}

function uploadFile(file, output){
 // console.log('==========================>>>> uploadAWSFile');
  log.trace('saveFile');
  return new Promise( (resolve, reject) => {
    let fileName = path.basename(file)
    let storage  = new app.Storage(output.service);
    if (storage) {
      let pathPrefix = output.pathPrefix || "";
      let arg = {
        public: (output.public ? true : false), 
        container: output.container,
        path: pathPrefix + fileName, // destination
        file: { path: file }   // local path to read file from
      };
      storage.uploadFile(arg)
        .then( resolve )
        .catch(reject);
    } else {
      reject(new Error('Transcoder storage not configured. This is a ToroBack internal missing configuration.'));
    }
  });
}

function modifyImage(image, edit){
  return new Promise( (resolve, reject) => {
    //TODO: modificar la imagen con la informacion de edit
    // let output = image.dir+"/edit.png";
    // let gmTask = gm(image.path);

    Promise.resolve(image.path)
      .then(imagePath =>{
        if(edit.rotate){
          return rotate(imagePath, image.dir, edit.rotate);
        }else{
          return Promise.resolve(imagePath);
        }
      })
      .then(imagePath => {     
        if(edit.crop){
           return crop(imagePath, image.dir, edit.crop)
        }else{
          return Promise.resolve(imagePath)
        }
      })
      // .then(imagePath => gmWrite(gm(imagePath), output))
      .then(editPath => {
        if(edit.resize){
          return performResize(editPath, image.dir, edit.resize);
        }else{
          return Promise.resolve([editPath]);
        }
      })
      .then(resolve)
      .catch(reject);
      //.then(res => fs.remove(image.dir+'/tmp'));

  });
}

function rotate(imagePath, destPath, rotation){
  return new Promise( (resolve, reject) => {
    gmWrite(gm(imagePath).rotate("none",rotation), destPath+"/tmp/rotate.png")
      .then(res => resolve(res))
      // .then(res => resolve(gm(res)))
      .catch(reject);
  });
}


function crop(imagePath, destPath, crop, bgColor = 'none'){
  return new Promise( (resolve, reject) => {
    let gmTask = gm(imagePath);
    gmTask.size((err, size) => {
      console.log("size err",err);
      console.log("size",size);
      let cutSize;
      let x = 0;
      let y = 0;
      if(size.width < size.height){
        cutSize = size.width;
        y = Math.floor((size.height - cutSize)/ 2);
      }else{
        cutSize = size.height;
        x = Math.floor((size.width - cutSize)/ 2);
      }

      gmTask.crop(cutSize, cutSize, x, y)
      if(crop == "rounded"){
        Promise.all([
          gmWrite(gmTask, destPath+"/tmp/crop.png"),
          createCircle(destPath+"/tmp/circle.png", cutSize, cutSize, cutSize/2, cutSize/2, cutSize/2, 0 ),
          createBackground(destPath+"/tmp/bg.png", cutSize, cutSize)
          ])
          .then(results =>{
            let compositeTask =  gm(results[2])
            compositeTask.composite(results[0], results[1]) 
            return gmWrite(compositeTask, destPath+"/tmp/round.png");
           
          })
          .then(resolve)
          .catch(reject);
      }else{
        gmWrite(gmTask, destPath+"/tmp/crop.png")
        .then(resolve)
        .catch(reject);
      }
    })
  });
}


function createCircle(output, width, height, x0, y0, x1, y1, color = 'none' ){
  return new Promise( (resolve, reject) => {
    let gmTask = gm(width, height, color).drawCircle(x0, y0, x1, y1);
    gmWrite(gmTask, output)  
      .then(resolve)
      .catch(reject);
  });
}

function createBackground(output, width, height, color = 'none' ){
  return new Promise( (resolve, reject) => {
    gmWrite(gm(width, height, color), output)
      .then(resolve)
      .catch(reject);
  });
}

function gmWrite(gmTask, path){
  return new Promise( (resolve, reject) => {
    gmTask.write(path, err => {
      if(err) reject(err)
      else resolve(path); 
    });
  });
}


function performResize(pathOrig, pathDest,sizes){
  return new Promise(function(resolve, reject){
    let promises = [];
    sizes.forEach( size => {
      let lowerCaseKey = size.toLocaleString();
      let sizeSpec = sizesSpec[lowerCaseKey];
      if(sizeSpec){
        promises.push(resize(pathOrig, pathDest+"/"+lowerCaseKey+".png", sizeSpec.size, sizeSpec.size))
      }
    });

    Promise.all(promises)
      .then(resolve)
      .catch(reject);
  });
}

function resize(pathOrig, pathDest, width , height ){
  return new Promise(function(resolve, reject){
    gm(pathOrig)
    .resize(width, height,'!')
    .write(pathDest, function (err) {
      if (err) reject(err);
      else resolve(pathDest);
    });
  });
}



module.exports = ImageEditor;