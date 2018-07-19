/*
 * BEWARE...!
 * By now, this class default values are configured in setup()
 * All instances share the same app (toroback), log and default
 * configuration taken from toroback config.
 * New instances can override default configuration by passing options
 * to the constructor, but app and log will remain shared.
*/

/** 
 * @module tb-multimedia 
 * @description 
 *
 * <p>Este módulo ofrece distintas funcionalidades multimedia. Algunas de ellas son:
 * <ul>
 * <li> Streaming de video </li>
 * <li> Edición de imágenes </li>
 * </ul>
 * </p>
 * <p>
 * @see [Guía de uso]{@tutorial tb-multimedia} para más información.
 * @see [REST API]{@link module:tb-multimedia/routes} (API externo).
 * @see [Class API]{@link module:tb-multimedia.Multimedia} (API interno).
 * @see Repositorio en {@link https://github.com/toroback/tb-multimedia|GitHub}.
 * </p>
 * 
 */


let app;      // reference to toroback
let log;      // logger (toroback's child)
let defaultOptions;   // default values if instance called without options

/**
* Clase que representa un gestor de multimedia
 * @memberOf module:tb-multimedia
 */
class Multimedia {

  /**
   * Crea una instancia de un gestor de multimedia
   * @param  {Object} _options Opciones para configurar el gestor
   * @param  {Object} [_options.transcoder] Opciones para configurar el servicio de streaming
   * @param  {Object} [_options.transcoder.accessKeyId] Opciones para configurar el servicio de streaming
   * @param  {Object} [_options.transcoder.secretAccessKey] Opciones para configurar el servicio de streaming
   */
  constructor(_options) {  // this represents app.multimediaOptions
    if (!app)
      throw new Error('Constructor: setup() needs to be called first');

    log.info('new Multimedia');
    let options = _options || defaultOptions;
    this.options = options;
    this.services = { };
    // at least one option must exist. by now, only transcoder available
    // transcoder
    if (options.transcoder) {
      if (options.transcoder.accessKeyId && options.transcoder.secretAccessKey) {
        let Transcoder = require('./transcoder.js');
        this.services.transcoder = new Transcoder(app, options.transcoder);
      }
    }
    // check for at least one service setup
    // if ( Object.keys(this.services).length == 0 ) {
    //   throw new Error('Multimedia: at least one module needs to be configured.');
    // }
  }

  /**
   * Setup del módulo. Debe ser llamado antes de crear una instancia
   * @param {Object} _app Objeto App del servidor
   * @return {Promise} Una promesa
   */
  static setup(_app) {
    return new Promise( (resolve, reject) => {
      // set globals
      app = _app;
      log = _app.log.child({module:'multimedia'});
      defaultOptions = _app.multimediaOptions || { };
      log.info('Setup: Multimedia');

      checkGM()
        .then(res => {
          // load routes
          require("./routes")(_app);
          resolve( );
        })
        .catch(reject)
    });
  }

  // Request to transcode a video to a streaming format
  // See route for detailed arguments
  /**
   * Request to transcode a video to a streaming format
   * @param {Object}  options                          Object with streaming options
   * @param {Object}  options.input                    Reference where to take the input video from
   * @param {String}  options.input.service            File Storage service (values: local, gcloud, aws, url)
   * @param {String}  options.input.container          Bucket name in service. Not required if service = url
   * @param {String}  options.input.path               Path to file, relative to bucket. If service = url, full URL path.
   * @param {Object}  options.output                   Output settings, where to put the output streaming files and playlists.
   * @param {String}  options.output.service           File Storage service (values: local, gcloud, aws)
   * @param {String}  options.output.container         Bucket name in service. Must exist already.
   * @param {String}  options.output.pathPrefix        Prefix path where to put all the output files.
   * @param {Array}   options.output.targets           Target platforms to transcode the video for. (values: IOS, ANDROID, WEB_MPEG_DASH)
   * @param {Array}   options.output.qualities         Video resolutions to make available in the playlist. (values: SD, HD, FHD, UHD)
   * @param {Boolean} [options.output.thumbnail=false] Whether or not to also generate a thumbnail.
   * @return {Promise<Object>} A promise to the result
   */
  streaming (options) {
    // returns a promise
    if (this.services.transcoder)
      return this.services.transcoder.streaming(options);
    else
      return Promise.reject(new Error('Streaming: Transcoder not configured on streaming'));
  }

  // Read status from a previously created streaming request
  // See route for detailed arguments

  /**
   * Read status from a previously created streaming request
   * @param {String}  jobId    Job ID obtained from making the streaming request
   * @return {Promise<Object>} A promise to the result       
   */
  readJob(jobId) {
    // returns a promise
    if (this.services.transcoder)
      return this.services.transcoder.readJob(jobId);
    else
      return Promise.reject(new Error('Streaming: Transcoder not configured on readJob'));
  }

  /**
   * Edita una imagen.
   * @param  {Object}   input                    Referencia de donde tomar la imagen de entrada
   * @param  {String}   input.service            Servicio de almacenamiento (valores: local, gcloud, aws)
   * @param  {String}   input.container          Nombre del contenedor en el servicio.
   * @param  {String}   input.path               path al archivo, relativo al contenedor.
   * @param  {Object}   output                   Configuración de salida, dónde ubicar la imagen editada.
   * @param  {String}   output.service           Servicio de almacenamiento (valores: local, gcloud, aws)
   * @param  {String}   output.container         Nombre del Bucket en el servicio. Debe existir.
   * @param  {String}   output.pathPrefix        Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket.
   * @param  {Boolean}  [output.public]          Indica si el archivo de salida debe ser público o no.
   * @param  {Object}   image                    Las modificaciones a realizar sobre la imagen.
   * @param  {Boolean}   [image.optimize]    True para optimizar la imagen.
   * @param  {String}   [image.crop]             Tipo de crop que aplicar a la imagen (valores: squared, rounded).
   * @param  {Number}   [image.rotate]           Rotación a aplicar a la imagen en grados. (Ej. 90, 270, 180).
   * @param  {Array}    [image.resize]           Array con los tamaños de la imagen a generar. (valores: t, s, m, l, xl)
   * @param  {Boolean}  [image.force]            True para forzar la redimension a los tamaños indicados, sino como máximo será el tamaño de la imagen original
   * @return {Promise<Object>} Una promesa con el resultado
   */
  editImage(input, output, image){
    return new Promise( (resolve, reject) => {
      let ImageEditor = require('./imageEditor.js');
      let imageEditor = new ImageEditor(App, this.options ? this.options.editor: undefined);
      imageEditor.edit(input, image, output)
        .then(resolve)
        .catch(reject);
    });
  }

  upload(payload){
    return new Promise( (resolve, reject) => {
      this.getReferenceConfig(payload.reference)
        .then(refConfig => {
          var serviceObject = App.Storage.toServiceObject({reference: refConfig.storageReference, path: payload.file.originalname});
          if(serviceObject){
            var uploadPayload = Object.assign({}, serviceObject);
            uploadPayload.file = payload.file;
            uploadPayload.public = true;

            var Storage = new App.Storage(serviceObject.service);
            Storage.uploadFile(uploadPayload) 
              .then(res =>{
                console.log("original image: " +JSON.stringify(res));
                //TODO: Acá se guardaría el resultado de la subida
                return Promise.resolve(res);
              })
              .then(res =>{
                var output = Object.assign({public: true}, serviceObject);
                return this.editImage({file: payload.file}, output, {crop: "rounded", resize:["l", "m"]} )
              })
              .then(resolve)
              .catch(reject);
          }
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
 * Comprueba que GM esté instalado
 * @private
 * @return {Promise} Una promesa
 */
function checkGM(){
  return new Promise((resolve, reject)=>{
    const { exec } = require('child_process');
    exec('which gm', (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        return reject(new Error("GM is not installed"));
      }else{
        resolve();
      }
    });
  })
}



module.exports = Multimedia;
