
let router = require('express').Router();

// TODO: this require needs to be fixed. re-structure.
let Multimedia = require('./index.js');
let mm = new Multimedia( );

let log;
/**
 * @module tb-multimedia/routes
 */
function setupRoutes(App){
  log = App.log.child({module:'multimediaRoute'});

  log.debug("Setup routes multimedia");

  router.use( (req, res, next) => {
    req._ctx['service']  = "multimedia";
    req._ctx['resource']  = req.query.service;
    next();
  });

  // Request to transcode a video to a streaming format.
  // This call creates a job. The actual result can be read from GET /streaming/:jobId
  // Arguments (in post body):
  //   input:   Object. Reference where to take the input video from
  //      service:    String. File Storage service (values: local, gcloud, aws, url)
  //      container:  String. Bucket name in service. Not required if service = url
  //      path:       String. Path to file, relative to bucket. If service = url, full URL path.
  //   output:  Object. Output settings, where to put the output streaming files and playlists.
  //      service:    String. File Storage service (values: local, gcloud, aws)
  //      container:  String. Bucket name in service. Must exist already.
  //      pathPrefix: String. Prefix path where to put all the output files.
  //      targets:    Array. Target platforms to transcode the video for. (values: IOS, ANDROID, WEB_MPEG_DASH)
  //      qualities:  Array. Video resolutions to make available in the playlist. (values: SD, HD, FHD, UHD)
  //      thumbnail:  Bool. (Optional, default: false) Whether or not to also generate a thumbnail.
  // Response:
  //   id:      String. Streaming job identifier.
  //   status:  String: Status of job. (only 'processing' at this stage)

  /**
   * Request to transcode a video to a streaming format.
   * This call creates a job. The actual result can be read from GET /streaming/:jobId
   *
   * @name Stream video
   *
   * @route  {POST} srv/multimedia/streaming
   * 
   * @bodyparam  {Object}   input                    Reference where to take the input video from
   * @bodyparam  {String}   input.service            File Storage service (values: local, gcloud, aws, url)
   * @bodyparam  {String}   input.container          Bucket name in service. Not required if service = url
   * @bodyparam  {String}   input.path               Path to file, relative to bucket. If service = url, full URL path.
   * @bodyparam  {Object}   output                   Output settings, where to put the output streaming files and playlists.
   * @bodyparam  {String}   output.service           File Storage service (values: local, gcloud, aws)
   * @bodyparam  {String}   output.container         Bucket name in service. Must exist already.
   * @bodyparam  {String}   output.pathPrefix        Prefix path where to put all the output files.
   * @bodyparam  {Array}    output.targets           Target platforms to transcode the video for. (values: IOS, ANDROID, WEB_MPEG_DASH)
   * @bodyparam  {Array}    output.qualities         Video resolutions to make available in the playlist. (values: SD, HD, FHD, UHD)
   * @bodyparam  {Boolean}  [output.thumbnail=false] Whether or not to also generate a thumbnail.
   * 
   * @return {Object}  Objeto con la respuesta (Por describir)
   *          
   */
  router.post('/streaming', (req, res, next) => {
    mm.streaming(req.body)
    .then ( resp => res.json(resp))
    .catch (next);
  });

  // Read status from a previously created streaming request
  // Arguments (in url):
  //   id:        String.  Job ID obtained from making the streaming request
  // Response:
  //   id:        String.  Job ID (same as input)
  //   status:    String. Job status (values: processing, complete, error)
  //   errorMessage:  String. Details further explaining the error (only if status = error)
  //   service:   String. File Storage service where the output is located (values: local, gcloud, aws) (same as input)
  //   container: String. Bucket name in service. (same as input)
  //   targets:   Array. Target platforms to transcode the video for. (values: IOS, ANDROID, WEB_MPEG_DASH) (same as input)
  //   qualities:  Array. Video resolutions to make available in the playlist. (values: SD, HD, FHD, UHD) (same as input)
  //   thumbnail:  Bool. Whether or not a thumbnail was requested. (same as input)
  //   outputs:    Array. Objects containing the output playlists, one for each target requested.
  //       target:    String: Target platform this playlist belongs to. (values: IOS, ANDROID, WEB_MPEG_DASH)
  //       playlist:  String: File path, relative to bucket, where to find the playlist for this target plataform.
  //       thumbnail: String: (Optional) File path, relative to bucket, where to find the thumbnail, if requested.
  //   

  /**
   * Read status from a previously created streaming request
   * 
   * @name Get straming info
   *
   * @route  {GET} srv/multimedia/streaming/:id
   *
   * @routeparam {String} id   Job ID obtained from making the streaming request
   * 
   * @return {Object} Objeto con la respuesta (Por describir)
   *
   */
  router.get('/streaming/:id', (req, res, next)=>{

    mm.readJob(req.params.id)
    .then ( resp => res.json(resp))
    .catch (next);
  });



  /**
   * Edita una imagen.
   *
   * @name Edit image
   *
   * @route  {POST} srv/multimedia/editImage
   * 
   * @bodyparam  {Object}   input                    Referencia de donde tomar la imagen de entrada
   * @bodyparam  {String}   input.service            Servicio del que cargar el archivo (gcloud, local, aws, url).
   * @bodyparam  {String}   [input.container]        Contedor del archivo. Solo para los servicios de almacenamiento. No es necesario para service="url"
   * @bodyparam  {String}   input.path               Path del archivo relativo al contenedor para servicios de almacenamiento o url si es service="url"
   * @bodyparam  {Object}   output                   Configuración de salida, dónde ubicar la imagen editada.
   * @bodyparam  {String}   output.service           Servicio de almacenamiento (valores: local, gcloud, aws)
   * @bodyparam  {String}   output.container         Nombre del Bucket en el servicio. Debe existir.
   * @bodyparam  {String}   output.pathPrefix        Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket.
   * @bodyparam  {Boolean}  [output.public]          Indica si el archivo de salida debe ser público o no.
   * @bodyparam  {Object}   image                    Las modificaciones a realizar sobre la imagen.
   * @bodyparam  {Boolean}   [image.optimize]    True para optimizar la imagen.
   * @bodyparam  {String}   [image.crop]             Tipo de crop que aplicar a la imagen (valores: squared, rounded).
   * @bodyparam  {Number}   [image.rotate]           Rotación a aplicar a la imagen en grados. (Ej. 90, 270, 180).
   * @bodyparam  {Array}    [image.resize]           Array con los tamaños de la imagen a generar. (valores: t, s, m, l, xl)
   * @bodyparam  {Boolean}  [image.force]            True para forzar la redimension a los tamaños indicados, sino como máximo será el tamaño de la imagen original
   * 
   * @return {Object}  Objeto con la respuesta (Por describir)
   *          
   */
  router.post('/editImage', function(req, res, next) { 
    var ctx = req._ctx;

    var input = ctx.payload.input;
    var options = ctx.payload.image;
    var output = ctx.payload.output;

    mm.editImage(input, output, options) 
      .then ( resp => res.json(resp))
      .catch (next);

  });


  /**
   * Sube un archivo, lo edita y lo almacena segun la referencia indicada. Post en formato multipart
   *
   * @name Upload file
   *
   * @route  {POST} srv/multimedia/upload
   * 
   * @queryparam {String} [reference] Referencia que especifica la ubicación de almacenamiento y las ediciones a aplicar (Ej: "myReference")
   *
   * @queryparam {String} [public]    "true" Para indicar que el archivo será público. Cualquier otro valor será tomado como no public, Por defecto es público.
   * 
   * @bodyparam  {File}   fileUpload  Archivo que se va a subir
   * @bodyparam  {String} path        Path destino del archivo incluyendo el nombre y extension. Ejemplos: "filename.png", "subdir/filename.png"
   * 
   * @return {Object}  Informacion del archivo subido 
   *
   * @example: 
   *   UPLOAD: http://localhost:4524/api/v1/srv/multimedia/upload?reference=myReference
   *   DATOS multipart:
   *        - "path" : "subfolder/file.png"
   *        - "fileUpload": El archivo a subir
   *
   *          
   */
  router.post("/upload", App.Storage.multer.single('fileUpload'), function(req, res, next){
    log.trace("entra en upload file");
    log.debug(req.file);

    var ctx = req._ctx;

    var payload = {
      file: req.file,
      path: req.body.path,
      reference: req.query.reference,
      public: req.query.public == "true"
    }
    
    mm.upload(payload)
      .then(resp => res.json(resp))
      .catch(next);
  });  


  App.app.use(`${App.baseRoute}/srv/multimedia`, router);

}

module.exports = setupRoutes;