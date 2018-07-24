let fs  = require('fs-extra');
var gm = require('gm');
// var im = gm.subClass({imageMagick: true});
let path = require('path');
let utils = require('./utils');
let removeDiacritics = require('diacritics').remove;
let mongoose  = require('mongoose');
let submodels  = require("./resources/submodels.js");

let app;      // reference to toroback
let log;      // logger (toroback's child)

let defaults = {
  localPath:   'storage/'
}

let sizesSpec = {
  t:  { w: 160, h: 160 },
  s:  { w: 240, h: 240 },
  m:  { w: 640, h: 640 },
  l:  { w: 1280, h: 1280 },
  xl: { w: 1600, h: 1600 }
}
// const sizesSpec = {
//   t:  { size: 160 },
//   s:  { size: 240 },
//   m:  { size: 640 },
//   l:  { size: 1280 },
//   xl: { size: 1600 }
// }

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
    log.debug("Multimedia ImageEditor instance");
    this.options = options || defaultOptions;
    this.readCustomSizes();
  }

  readCustomSizes(){
    if(this.options.sizes){
      var customSizes = this.options.sizes;
      for (var key in customSizes) {
        var size = customSizes[key];
        if(size)  sizesSpec[key] = extractSizes(size);
      }
    }
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


 /**
   * Sube una imagen a la ubicación indicada y la transforma segun las referencias pasadas. Devuelve un objeto con la imagen original y todas las transformaciones
   * @param  {Object}   payload                   Referencia a la imagen a editar
   * @param  {String}   payload.path              Ubicación en la que se almacenará la imagen y sus transformaciones. Ubación relativa a la referencia.   
   * @param  {File}     payload.file              Archivo que se va a subir
   * @param  {String}   payload.reference         Identificador de la referencia declarada en la configuración del módulo que contiene la especificación de las transformaciones
   * @param  {boolean}  payload.public            Flag que indica si el archivo será public
   * @return {Promise<tb.multimedia-files>}       Una promesa con el resultado de la subida 
   */
  upload(payload){
    return new Promise( (resolve, reject) => {
      log.debug("Multimedia Upload payload" +  JSON.stringify(payload));
      let file = payload.file;
      //Variables completadas en las respuestas de las promesas
      let refConfig, serviceObject, originalUploadedFile, slug, multimediaFile, fileSize; 
      let fileName = payload.path ? path.basename(payload.path) : file.originalname;
      let pathPrefix   = payload.path ? path.dirname(payload.path) + "/" : undefined;
      let isPublic = payload.public != undefined ? payload.public == true : true;

      var Storage;
      //En primer lugar se obtiene la configuracion de la referencia y el slug del nombre del archivo.
      Promise.all([
          this.getReferenceConfig(payload.reference),
          buildSlug(fileName.substring(0, fileName.lastIndexOf("."))),
          getFileSize(file.path)
        ])
        .then(res =>{
          log.debug("Loaded start data");
          refConfig = res[0];
          slug = res[1];
          fileSize = res[2];
          
          //Se realiza la subida del archivo
          serviceObject = app.Storage.toServiceObject({reference: refConfig.storageReference, path: pathPrefix || ""});
          
          if(!serviceObject)  throw app.err.notFound("Storage reference not found");
          
          var upload = Object.assign({}, serviceObject);
          upload.file = file;
          upload.public = isPublic;

          //Se establece la ubicacion final del archivo para la subida, uniendo el path que devuelve el service object junto al nombre del archivo y la extension;
          upload.path = path.join(serviceObject.path, slug + (utils.extensionForContentType(file.mimetype) || ""));

          // log.debug("Storage Upload payload" +  JSON.stringify(upload));
          Storage = new app.Storage(serviceObject.service);
          return Storage.uploadFile(upload) 
          
        })
        .then(res =>{
          log.debug("Original file uploaded");
          // Se guarda el resultado de la subida del archivo original
          originalUploadedFile = res.file;
        
          let MultimediaFile = app.db.model('tb.multimedia-files');
          multimediaFile = new MultimediaFile({
            service: originalUploadedFile.service,
            container: originalUploadedFile.container,
            public: originalUploadedFile.public,
            path: originalUploadedFile.path,
            url: originalUploadedFile.url,
            slug: slug,
            mime: file.mimetype,
            w: fileSize.width,
            h: fileSize.height,
            size: file.size
          });
         
          return multimediaFile.save();
        })
        .then(doc =>{
          log.debug("Media file saved");
          return Storage.setFileMetadata({container: doc.container, path: doc.path, metadata: { metadata: {_id: doc._id, sizeTag: "original", collection: 'tb.multimedia-files'}} });
        })
        .then(doc =>{
          log.debug("Media metadata set");
          //Se realiza la transformacion
          var output = Object.assign({public: isPublic}, serviceObject);
          output.pathPrefix = serviceObject.path;
          
          var prom = refConfig.editOptions.map( e => {
            var editOptions = Object.assign({}, e);
            editOptions.namePrefix = slug;
            //Si no se especifica la optimizacion en las opciones, por defecto hacemos que se optimice
            if(editOptions.optimize == undefined) editOptions.optimize = true;
            return this.edit({file: file}, editOptions, output).catch(err => {return Promise.resolve()});
          });

          return Promise.all(prom);
        })
        .then( res=>{
          log.debug("Transformations done");
          //res = [ {images: [{image1, image2 }]}, {images:[image1, imageX]} ,...]
          //Acá se guardan las imágenes transformadas
          let SubMediaFile = mongoose.model('MediaFile', submodels.mediaFile);
          var avSizes = [];
          for(var i = 0; i < res.length; i++ ){
            if(res[i] && res[i].images) {
              var images = res[i].images;
              for(var j = 0; j < images.length; j++ ){
                var subfile = images[j];
                if(subfile){
                  //TODO: Por ahora se establece las dimensiones en funcion a la que nos pidieron, hay que buscar la manera de extraerla del documento
                  let sizeSpec = sizesSpec[subfile.size];
                  let mediaFile = new SubMediaFile({ path: subfile.path, url: subfile.url, w: sizeSpec.w, h: sizeSpec.h});
                  //Se asocia un nuevo media file por cada tamaño con el key 's_<tamaño>'
                  multimediaFile.set('s_'+subfile.size, mediaFile);

                  avSizes.push(subfile.size);
                }
              }
            }
          }
          if(avSizes.length) multimediaFile.sizes = avSizes;
         
          return multimediaFile.save();
        })
        .then(doc =>{
          log.debug("Transformations saved");
          //Se setean los metadatos a los sub archivos
          var prom = [];
          
          if(multimediaFile.sizes){
            for(var i=0; i<multimediaFile.sizes.length; i++){
              var sizeKey = multimediaFile.sizes[i]; 
              var mediaFile = multimediaFile.get("s_"+sizeKey);
              if(mediaFile && mediaFile.path){ 
                var metadata = { metadata: {_id: multimediaFile._id, sizeTag: sizeKey, collection: 'tb.multimedia-files'}}; 
                prom.push(Storage.setFileMetadata({container: multimediaFile.container, path: mediaFile.path, metadata: metadata}).catch(err => Promise.resolve()));
              }
            }
          }
          return Promise.all(prom);
        })
        .then(res => {
          log.debug("Transformations metadata set");
          resolve(multimediaFile)
        })
        .catch(reject);
    });
  }

  getReferenceConfig(reference){
    return new Promise( (resolve, reject) => {
      if(this.options.references && this.options.references[reference]){
        resolve(this.options.references[reference]);
      }else{
        reject("reference not exists "+reference);
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

function getFileSize(filePath){
  return new Promise((resolve, reject) =>{
    let gmTask = gm(filePath);
    gmTask.size((err, size) => {
      if(err){
        reject(err);
      }else{
        resolve(size);
      }
    });
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
    if(input.file){
      // var extension = utils.extensionForContentType(input.file.mimetype);
      var fileName = input.file.originalname;//path.basename(input.file.path) + (extension ? "."+extension : "");
      let destPath = workDir + "/" + fileName;
      console.log("Loading file" +JSON.stringify(input))
      fs.copy(input.file.path, destPath, err =>{
        if(err) reject(err)
        else{
          resolve({
            path: destPath,
            workDir:  workDir,
            name: fileName
          });
        }
      });
    }else{
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
    console.log("Edit options "+ JSON.stringify(edit));
    // modifica la imagen con la informacion de edit
    Promise.resolve(image.path)
      .then(imagePath =>{
        if(edit.optimize){
          return optimize(imagePath, image.workDir, configOptions);
        }else{
          return imagePath;
        }
      })
      .then(imagePath =>{
        if(edit.rotate){
          return rotate(imagePath, image.workDir, edit.rotate);
        }else{
          return imagePath;
        }
      })
      .then(imagePath => {     
        if(edit.crop){
           return crop(imagePath, image.workDir, edit.crop)
        }else{
          return imagePath;
        }
      })
      .then(editPath => {
        if(edit.resize){
          return performResize(editPath, image.workDir, edit.resize, edit.force, edit.namePrefix);
        }else{
          return [{path: editPath}];
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
 * @param  {Object} configOptions Objeto con las configuraciones disponibles del editor
 * @return {String}               El servicio configurado para optimizar
 */
function getOptimizationService(configOptions){
  var service;
  Object.keys(configOptions).forEach( key => {
    if(!service && configOptions[key].optimization == true){
      service = key;
    }
  });
  return service || "local";
}

/**
 * Optimización con tinyPng
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
 * Optimización local usando GraphicsMagick
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
        var optimizeTask;
        format = format.toLowerCase();
        if(format == 'jpeg'){
          log.debug("Compressing jpg");
          optimizeTask = gm(imagePath).samplingFactor(2,2).noProfile().quality(70).interlace("Line").define("jpeg:dct-method=float");
          // optimizeTask = im(imagePath).samplingFactor(2,2).strip().quality(70).interlace("JPEG").define("jpeg:dct-method=float").colorspace("sRGB");
        }else{
          log.debug("Compressing png");
          optimizeTask = gm(imagePath).noProfile();
          // optimizeTask = im(imagePath).strip();
        }
        gmWrite(optimizeTask, destFile).then(resolve).catch(reject);
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


function performResize(pathOrig, pathDest, sizes, force = false, namePrefix){
  return new Promise(function(resolve, reject){
    if(!Array.isArray(sizes)) throw new app.err.notAcceptable("'resize' must be an array");
    //Se obtiene el tamaño original para limitar el resize que no sea mas grande
    let ext = getExtension(pathOrig);
    gm(pathOrig).size((err, originalSize) => { 
      if(err) throw err;
      
      let promises = [];
      sizes.forEach( size => {
        let lowerCaseKey = size.toLowerCase();
        let sizeSpec = sizesSpec[lowerCaseKey];
        if(!sizeSpec) sizeSpec = extractSizes(lowerCaseKey);
        if(sizeSpec){
          let width = force ? sizeSpec.w : Math.min(sizeSpec.w, originalSize.width);
          let height = force ? sizeSpec.h : Math.min(sizeSpec.h, originalSize.height); 
          
          var destName = lowerCaseKey+ext;
          if(namePrefix) destName = namePrefix +"_"+destName;
          let prom = resize(pathOrig, pathDest, destName, width, height, force)
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

function extractSizes(string){
  var parts = string.split('x');
  if(parts.length){
    var w = parts[0];
    var h = parts[1] || w;
    if(!isNaN(w) && !isNaN(h)){
      return {w:w, h:h};
    }
  }
  return undefined;
}

/**
 * Redimensiona la imagen en pathOrig con los tamaños pasados y la guarda en pathDest
 * @private
 */
//http://www.imagemagick.org/Usage/resize/ para mas detalles sobre la funcion y las opciones
function resize(pathOrig, destDir, fileName, width , height, force ){
  return new Promise(function(resolve, reject){

    var pathDest = destDir + "/" + fileName;
   
    log.debug("Resize to "+ width+"x"+height + " - "+force+ " - "+fileName);

    let resizeTask = gm(pathOrig).resize(width, height);
 
    if(force){
      var ext = path.extname(fileName);
      let isJPG = ext == ".jpg";
      
      Promise.all([
          gmWrite(resizeTask, destDir+"/tmp/"+fileName),
          createBackground(destDir+"/tmp/resize"+fileName, width, height, isJPG ? 'white' :'transparent')
        ])
        .then(results =>{
          let compositeTask =  gm(results[1])
          compositeTask.composite(results[0]).gravity("Center") 
          
          return gmWrite(compositeTask, pathDest);
        })
        .then(res => resolve(pathDest))
        .catch(reject);
    }else{
      gmWrite(resizeTask, pathDest)
        .then(res => resolve(pathDest))
        .catch(reject);
    }

      //  gm(pathOrig)
      //   .resize(width, height)
      //   .write(pathDest, function (err) {
      //   if (err) reject(err);
      //   else resolve(pathDest);
      // });
  });
}

function getExtension(filePath){
  return path.extname(filePath);
}

// builds a slug for a multimedia file from the file name
// name: file name to build slug from. path and extensions are removed if passed in name
// return: slug string
//
// makes sure slug doesn't exist in DB already. 
// auto-increases counter in slug if needed
function buildSlug( name ) {
  return new Promise( (resolve, reject) => {
    let MMFile = app.db.model( 'tb.multimedia-files' );
    let regexp;
    let slug;

    // parse from path (remove paths and extension), if not undefined
    slug = name ? name.split('/').pop( ).split('.')[0] : '';
    // clean up
    if ( slug ) {
      slug = removeDiacritics( name ).toLowerCase( )  // no diacritics, lowercase
                .replace(/[^A-Za-z0-9\s\-\_\/]/g, '')  // keep only characters in range
                .replace(/[\s\-\_\/]+/g, '-'); // remove dash duplicity
    }
    // it could be empty here after cleaning up
    slug = slug || (Math.random() + Number.EPSILON).toString(36).substr(2, 16); // + epsilon, avoid empty string. already lowercase
                   
    // match '<slug>' or '<slug>-<counter>' slugs in DB
    regex = new RegExp( '^' + slug + '(-\\d+$|$)' ); // all already lowercase (double slash on string building. single slash on regex \d)

    // make sure it doesn't exist in DB already. find them all
    MMFile.find( { 'slug': regex }, { 'slug': 1 } )    
      .then( mmFiles => {
        // if exact same string exists, we need to create a new slug
        if ( mmFiles.find( e => e.slug == slug ) ) {
          // find largest counter, and increment by 1 (from format: <slug>-<counter>)
          let num = mmFiles.map( e => Number( e.slug.split('-').pop( ) ) || 0 ) // add 0 to array if NaN
                           .sort( (a,b) => (a - b)).pop( ) + 1;
          slug = slug + '-' + num;
        } // else: no exact match, we can return slug as it is
        return slug;
      })
      .then(resolve)
      .catch(reject);
  });
}
/// END TEST

module.exports = ImageEditor;