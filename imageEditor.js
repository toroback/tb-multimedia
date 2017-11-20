let fs  = require('fs-extra');
var gm = require('gm');
let path = require('path');


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

/**
 * Clase para la edición de imágenes
 * @private
 * @memberOf module:tb-multimedia
 */
class ImageEditor{

  /**
   * Crea un editor de imagen
   * @param  {Object} _app Objeto App del servidor
   * @param  {Object} src  Referencia a la imagen a editar
   * @param  {String} src.service            Servicio de almacenamiento (valores: local, gcloud, aws)
   * @param  {String} src.container          Nombre del contenedor en el servicio.
   * @param  {String} src.path               ath al archivo, relativo al contenedor.
   */
  constructor(_app, src){
    app = _app;      // reference to toroback
    log = _app.log.child({module:'multimedia-imageEditor'});  // logger (toroback's child)

    this.src = src;
  }

  /**
   * Edita la imagen preconfigurada con las opciones dadas
   * @param  {Object}   options                Las modificaciones a realizar sobre la imagen.
   * @param  {String}   [options.crop]         Tipo de crop que aplicar a la imagen (valores: squared, rounded).
   * @param  {Number}   [options.rotate]       Rotación a aplicar a la imagen en grados. (Ej. 90, 270, 180).
   * @param  {Array}    [options.resize]       Array con los tamaños de la imagen a generar. (valores: t, s, m, l, xl)
   * @param  {Boolean}  [options.force]        True para forzar la redimension a los tamaños indicados, sino como máximo será el tamaño de la imagen original
   * @param  {Object}   dest                   Configuración de salida, dónde ubicar la imagen editada.
   * @param  {String}   dest.service           Servicio de almacenamiento (valores: local, gcloud, aws)
   * @param  {String}   dest.container         Nombre del Bucket en el servicio. Debe existir.
   * @param  {String}   dest.pathPrefix        Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket.
   * @param  {Boolean}  [dest.public]          Indica si el archivo de salida debe ser público o no.
   * @return {Promise<Object>}  Una promesa con el resultado de la edición
   */
  edit(options, dest){
    return new Promise( (resolve, reject) => {
      if(!dest || !dest.service || !dest.container){
        reject(new Error("An output must be specified"));
      }else{
        let workDir = defaults.localPath + Math.random().toString(36).slice(2);
        createWorkDir(workDir)
          .then(workDir =>  load(this.src, workDir))
          .then(file => modifyImage(file, options))
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
  })
}

/**
 * Carga un archivo con la informacion del input
 * @private
 * @param  {Object} input [description]
 * @param  {String} input.service Servicio del que cargar el archivo (gcloud, local, aws)
 * @param  {String} input.container Contedor del archivo
 * @param  {String} input.path Path del archivo
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
      }
      resolve(resp);
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
        storage.downloadFile({ container: input.container, file: input.path, res: fileStream })
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

function modifyImage(image, edit){
  return new Promise( (resolve, reject) => {
    // modifica la imagen con la informacion de edit
    Promise.resolve(image.path)
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

function rotate(imagePath, destPath, rotation){
  return new Promise( (resolve, reject) => {
    let ext = getExtension(imagePath);
    gmWrite(gm(imagePath).rotate("none",rotation), destPath+"/tmp/rotate"+ext)
      .then(res => resolve(res))
      // .then(res => resolve(gm(res)))
      .catch(reject);
  });
}


function crop(imagePath, destPath, crop, bgColor = 'none'){
  return new Promise( (resolve, reject) => {
    let origExt = getExtension(imagePath);
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
          gmWrite(gmTask, destPath+"/tmp/crop"+origExt),
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
        gmWrite(gmTask, destPath+"/tmp/crop"+origExt)
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