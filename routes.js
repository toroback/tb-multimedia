let router = new require('express').Router();

// TODO: this require needs to be fixed. re-structure.
let Multimedia = require('./index.js');
let mm = new Multimedia( );

function setupRoutes(App){
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
  router.get('/streaming/:id', (req, res, next)=>{

    mm.readJob(req.params.id)
    .then ( resp => res.json(resp))
    .catch (next);
  });


  router.post('/editImage', function(req, res, next) { 
    var ctx = req._ctx;

    var input = ctx.payload.input;
    var options = ctx.payload.image;
    var output = ctx.payload.output;

    mm.editImage(input, output, options) 
      .then ( resp => res.json(resp))
      .catch (next);

  });




  App.app.use(`${App.baseRoute}/srv/multimedia`, router);

}

module.exports = setupRoutes;