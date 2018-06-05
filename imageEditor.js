let fs  = require('fs-extra');
var gm = require('gm').subClass({imageMagick: true});
let path = require('path');
let utils = require('./utils');

let app;      // reference to toroback
let log;      // logger (toroback's child)

let defaults = {
  localPath:   'storage/'
}

const sizesSpec = {
  t:  { size: 160 },
  s:  { size: 240 },
  m:  { size: 640 },
  l:  { size: 1280 },
  xl: { size: 1600 }
}

let defaultOptions = {};
/**
 * Clase para la edición de imágenes
 * @private
 * @memberOf module:tb-multimedia
 */
class ImageEditor{

  /**
   * Crea un editor de imagen
   * @param  {Object} _app Objeto App del servidor
   * @param  {Object} options Objeto de configuración del servicio de edición de multimedia (multimediaOptions.editor).
   */
  constructor(_app, options){
    app = _app;      // reference to toroback
    log = _app.log.child({module:'multimedia-imageEditor'});  // logger (toroback's child)
    this.options = options || defaultOptions;
  }

  /**
   * Edita la imagen preconfigurada con las opciones dadas
   * @param  {Object}   src                       Referencia a la imagen a editar
   * @param  {String}   src.service               Servicio del que cargar el archivo (gcloud, local, aws, url).
   * @param  {String}   [src.container]           Contedor del archivo. Solo para los servicios de almacenamiento. No es necesario para service="url"
   * @param  {String}   src.path                  Path del archivo relativo al contenedor para servicios de almacenamiento o url si es service="url"
   * @param  {Object}   editOptions               Las modificaciones a realizar sobre la imagen.
   * @param  {Boolean}   [editOptions.optimize]    True para optimizar la imagen.
   * @param  {String}   [editOptions.crop]        Tipo de crop que aplicar a la imagen (valores: squared, rounded).
   * @param  {Number}   [editOptions.rotate]      Rotación a aplicar a la imagen en grados. (Ej. 90, 270, 180).
   * @param  {Array}    [editOptions.resize]      Array con los tamaños de la imagen a generar. (valores: t, s, m, l, xl)
   * @param  {Boolean}  [editOptions.force]       True para forzar la redimension a los tamaños indicados, sino como máximo será el tamaño de la imagen original
   * @param  {Object}   dest                      Configuración de salida, dónde ubicar la imagen editada.
   * @param  {String}   dest.service              Servicio de almacenamiento (valores: local, gcloud, aws)
   * @param  {String}   dest.container            Nombre del Bucket en el servicio. Debe existir.
   * @param  {String}   dest.pathPrefix           Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket.
   * @param  {Boolean}  [dest.public]             Indica si el archivo de salida debe ser público o no.
   * @return {Promise<Object>}  Una promesa con el resultado de la edición
   */
  edit(src, editOptions, dest){
    return new Promise( (resolve, reject) => {
      if(!dest || !dest.service || !dest.container){
        reject(new Error("An output must be specified"));
      }else{
        let workDir = defaults.localPath + Math.random().toString(36).slice(2);
        createWorkDir(workDir)
          .then(workDir =>  load(src, workDir))
          .then(file => modifyImage(file, editOptions, this.options))
          .then(files => save(files, dest))
          .then(resolve)
          .catch(reject)
          .then(res => fs.remove(workDir));
      }
    });
  }
}

/**
 * Crea los directorios de trabajo
 * @private
 * @param  {String} workDir Path del directorio base de trabajo
 * @return {Promise<String>} Promesa con el directorio de trabajo creado
 */
function createWorkDir(workDir){
  return new Promise((resolve, reject) =>{
    fs.mkdirSync(workDir);
    fs.mkdirSync(workDir + "/tmp");
    resolve(workDir);
  });
}

/**
 * Carga un archivo con la informacion del input
 * @private
 * @param  {Object} input [description]
 * @param  {String} input.service Servicio del que cargar el archivo (gcloud, local, aws, url).
 * @param  {String} [input.container] Contedor del archivo. Solo para los servicios de almacenamiento. No es necesario para service="url"
 * @param  {String} input.path Path del archivo relativo al contenedor para servicios de almacenamiento o url si es service="url"
 * @param  {String} workDir Path del directorio base de trabajo
 * @return {Promise<Object>}  Promesa con el resultado de carlar la imagen fuente
 */
function load(input, workDir){
  return new Promise( (resolve, reject) => {
    let service = input.service;    

    if(service == 'local'){ //Si la imagen está en local si obtiene el path local desde tb-storage y se devuelve
      let localPath = app.Storage.getLocalPath(input.container, input.path);
      let resp = {
        path: localPath,
        workDir:  workDir,
        name: path.basename(localPath)
      };
      resolve(resp);
    }else if(service == 'url'){

      let imageName = extractUrlBasename(input.path, Math.random().toString(36).slice(2));
      let dest = path.normalize(workDir + "/" + imageName);

      utils.downloadFile(input.path, (resp, data) =>{
        console.log("Download data", JSON.stringify(data));
        
        let extension = getExtension(imageName);
        if(!extension){
          extension = utils.extensionForContentType(data.contentType);
          if(!extension){
            extension = getExtension(data.filename);        
          }
          if(extension){
            imageName += extension;
            dest += extension;
          }
        }

        let fileStream = fs.createWriteStream(
          dest,
          { defaultEncoding: 'binary' }
        );

        resp.pipe(fileStream);
        resp.on('end', (resp) => resolve({path: dest, workDir: workDir, name: imageName}));
      }).on('error', (err) => {
        if(dest){
          fs.unlink(dest, (err) => { log.warn(err) });
        }
        reject(err);
      });


    }else{
      let imageName = path.basename(input.path);
      let dest = path.normalize(workDir + "/" + imageName);

      let fileStream = fs.createWriteStream(
        dest,
        { defaultEncoding: 'binary' }
      );
      //TODO: cargar el archivo del servicio que sea necesario
      let storage  = new app.Storage(service);
      if (storage) {
        storage.downloadFile({ container: input.container, path: input.path, res: fileStream })
          .then( res =>  resolve({path: dest, workDir: workDir, name: imageName}))
          .catch( (err) => {
            fs.unlink(dest, (err) => { log.warn(err) });
            reject(err);
          });
      }else {
        reject(new Error('Input storage not configured: ' + service));
      }
    }
  });
}

function extractUrlBasename(url, defaultBaseName){
  let basename = path.basename(url);
  if ( basename ) {
    basename = basename.split('?')[0];
    basename = decodeURIComponent(basename);
    basename = basename.split('/').pop();
  } else {
    basename = defaultBaseName;
  }
  return basename;
}

function save(files, output){
  return new Promise( (resolve, reject) => {
    if(files && files.length > 0){
      let promises = [];
      
      files.forEach( file=> {
        promises.push(uploadFile(file.path, output)
          .then(res => { //la respuesta es {file:{}}
            let obj = res.file;
            if(file.size){
              obj.size = file.size
            }
            return Promise.resolve(obj);
          })
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
      reject(new Error('Storage not configured. This is a ToroBack internal missing configuration.'));
    }
  });
}

function modifyImage(image, edit, configOptions){
  return new Promise( (resolve, reject) => {
    // modifica la imagen con la informacion de edit
    Promise.resolve(image.path)
      .then(imagePath =>{
        if(edit.optimize){
          return optimize(imagePath, image.workDir, configOptions);
        }else{
          return Promise.resolve(imagePath);
        }
      })
      .then(imagePath =>{
        if(edit.rotate){
          return rotate(imagePath, image.workDir, edit.rotate);
        }else{
          return Promise.resolve(imagePath);
        }
      })
      .then(imagePath => {     
        if(edit.crop){
           return crop(imagePath, image.workDir, edit.crop)
        }else{
          return Promise.resolve(imagePath)
        }
      })
      .then(editPath => {
        if(edit.resize){
          return performResize(editPath, image.workDir, edit.resize, edit.force);
        }else{
          return Promise.resolve([{path: editPath}]);
        }
      })
      .then(resolve)
      .catch(reject);
  });
}


function optimize(imagePath, destPath, configOptions){
  return new Promise( (resolve, reject) => {
    let fileName = path.basename(imagePath);
    var destFile = destPath+"/tmp/"+fileName;
    var service = getOptimizationService(configOptions);
  
    var optimizePromise;
    if(!service || service == "local"){
      optimizePromise = localOptimization(imagePath, destFile);
    }else if(service == "tinyPng"){
      optimizePromise = tinyPngOptimize(imagePath, destFile, configOptions[service])
    }else{
      reject("Optimization service not supported - " + service);
    }

    if(optimizePromise){
      optimizePromise.then(res => resolve(res)).catch(reject);
    }
  });
}

/**
 * Devuelve el servicio configurado para optimizar imágenes o "local" si no hay ninguno
 * @param  {[type]} configOptions [description]
 * @return {[type]}               [description]
 */
function getOptimizationService(configOptions){
  var service;
  Object.keys(configOptions).forEach( key => {
    if(!service && configOptions[key].optimization){
      service = key;
    }
  });
  return service || "local";
}

/**
 * Optimización local usando ImageMagick
 * @param  {String} imagePath Path de la imagen a optimizar
 * @param  {String} destFile  Path donde se almacenará la imagen modificada
 * @param  {Object} serviceOptions  Opciones del servicio de TinyPNG
 * @return {Promise}         Promesa a la ubicacion de la imagen modificada
 */
function tinyPngOptimize(imagePath, destFile, serviceOptions){
  return new Promise( (resolve, reject) => {
    if(serviceOptions && serviceOptions.apikey){
      var tinify = require("tinify");
      tinify.key = serviceOptions.apikey;

      tinify.fromFile(imagePath)
        .toFile(destFile)
        .then(res =>resolve(destFile))
        .catch(reject);
      
    }else{
      reject("Optimization service not configured");
    }
  });
}

/**
 * Optimización local usando ImageMagick
 * @param  {String} imagePath Path de la imagen a optimizar
 * @param  {String} destFile  Path donde se almacenará la imagen modificada
 * @return {Promise}          Promesa a la ubicacion de la imagen modificada
 */
function localOptimization(imagePath, destFile){
  return new Promise( (resolve, reject) => {
    //Se extrae el formato para no basarnos en la extension del archivo
    gm(imagePath).format(function(err, format){
      if(err) reject(err);
      else{
        var optimizePromise;
        format = format.toLowerCase();
        if(format == 'jpeg'){
          optimizePromise = gmWrite(gm(imagePath).samplingFactor(2,2).strip().quality(70).interlace("JPEG").define("jpeg:dct-method=float").colorspace("sRGB"), destFile)
        }else{
          optimizePromise = gmWrite(gm(imagePath).strip(), destFile)
        }
        optimizePromise.then(res => resolve(res)).catch(reject);
      }
    });
  });
}

function rotate(imagePath, destPath, rotation){
  return new Promise( (resolve, reject) => {
    // let ext = getExtension(imagePath);
    let fileName = path.basename(imagePath);
    gmWrite(gm(imagePath).rotate("none",rotation), destPath+"/tmp/"+fileName)
      .then(res => resolve(res))
      // .then(res => resolve(gm(res)))
      .catch(reject);
  });
}


function crop(imagePath, destPath, crop, bgColor = 'none'){
  return new Promise( (resolve, reject) => {
    let origExt = getExtension(imagePath);
    let fileNameNoExt = path.basename(imagePath, origExt);
    let gmTask = gm(imagePath);
    gmTask.size((err, size) => {
      if(err)
        throw err;

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
          // gmWrite(gmTask, destPath+"/tmp/crop"+origExt),
          gmWrite(gmTask, destPath+"/tmp/"+fileNameNoExt + origExt),
          createCircle(destPath+"/tmp/circle.png", cutSize, cutSize, cutSize/2, cutSize/2, cutSize/2, 0 ),
          createBackground(destPath+"/tmp/bg.png", cutSize, cutSize)
          ])
          .then(results =>{
            let compositeTask =  gm(results[2])
            compositeTask.composite(results[0], results[1]) 
            // return gmWrite(compositeTask, destPath+"/tmp/round.png");
            return gmWrite(compositeTask, destPath+"/tmp/"+fileNameNoExt+".png");
           
          })
          .then(resolve)
          .catch(reject);
      }else{
         // gmWrite(gmTask, destPath+"/tmp/crop"+origExt)
        gmWrite(gmTask, destPath+"/tmp/"+fileNameNoExt + origExt)
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


function performResize(pathOrig, pathDest, sizes, force = false){
  return new Promise(function(resolve, reject){
    //Se obtiene el tamaño original para limitar el resize que no sea mas grande
    gm(pathOrig).size((err, originalSize) => { 
      if(err) throw err;
      
      let promises = [];
      sizes.forEach( size => {
        let lowerCaseKey = size.toLocaleString();
        let sizeSpec = sizesSpec[lowerCaseKey];
        if(sizeSpec){
          let width = force ? sizeSpec.size : Math.min(sizeSpec.size, originalSize.width);
          let height = force ? sizeSpec.size : Math.min(sizeSpec.size, originalSize.height); 
          let ext = getExtension(pathOrig);
          let prom = resize(pathOrig, pathDest+"/"+lowerCaseKey+ext, width, height)
                      .then(path => {return {path: path, size: size}});
          promises.push(prom);
        }
      });

      Promise.all(promises)
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Redimensiona la imagen en pathOrig con los tamaños pasados y la guarda en pathDest
 * @private
 */
//http://www.imagemagick.org/Usage/resize/ para mas detalles sobre la funcion y las opciones
function resize(pathOrig, pathDest, width , height ){
  return new Promise(function(resolve, reject){
    gm(pathOrig)
    .resize(width, height)
    .write(pathDest, function (err) {
      if (err) reject(err);
      else resolve(pathDest);
    });
  });
}

function getExtension(filePath){
  return path.extname(filePath);
}

module.exports = ImageEditor;