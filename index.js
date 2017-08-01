/*
 * BEWARE...!
 * By now, this class default values are configured in setup()
 * All instances share the same app (toroback), log and default
 * configuration taken from toroback config.
 * New instances can override default configuration by passing options
 * to the constructor, but app and log will remain shared.
*/

let app;      // reference to toroback
let log;      // logger (toroback's child)
let defaultOptions;   // default values if instance called without options

class MultiMedia {

  constructor(_options) {  // this represents app.multimediaOptions
    if (!app)
      throw new Error('Constructor: setup() needs to be called first');

    log.info('new Multimedia');
    let options = _options || defaultOptions;
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
    if ( Object.keys(this.services).length == 0 ) {
      throw new Error('Multimedia: at least one module needs to be configured.');
    }
  }

  // multimedia tb module setup. Must be called before any instance creation. 
  static setup(_app) {
    return new Promise( (resolve, reject) => {
      // set globals
      app = _app;
      log = _app.log.child({module:'multimedia'});
      defaultOptions = _app.multimediaOptions || { };
      log.info('Setup: Multimedia');
      // load routes
      require("./routes")(_app);
      resolve( );
    });
  }

  // Request to transcode a video to a streaming format
  // See route for detailed arguments
  streaming (options) {
    // returns a promise
    if (this.services.transcoder)
      return this.services.transcoder.streaming(options);
    else
      return Promise.reject(new Error('Streaming: Transcoder not configured on streaming'));
  }

  // Read status from a previously created streaming request
  // See route for detailed arguments
  readJob(jobId) {
    // returns a promise
    if (this.services.transcoder)
      return this.services.transcoder.readJob(jobId);
    else
      return Promise.reject(new Error('Streaming: Transcoder not configured on readJob'));
  }

  
}


module.exports = MultiMedia;
