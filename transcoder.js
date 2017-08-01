
let aws = require('./aws-wrapper.js');
let fs  = require('fs-extra');
// let http  = require('http');
// let https = require('https');

// define job return status
let statusEnum = Object.freeze({
  processing: 'processing',
  complete:   'complete',
  error:      'error'
});

// define output targets
let targetEnum = Object.freeze({
  IOS:            1,
  ANDROID:        2,
  WEB_MPEG_DASH:  3
});

// define output quality. kindda standard values: (different in mobile or web)
let qualityEnum = Object.freeze({
  SD:  1,  //  SD:  640x480  (Standard Definition)
  HD:  2,  //  HD: 1280x720  (High Definition)
  FHD: 3,  // FHD: 1920x1080 (Full HD)
  UHD: 4   // UHD: 3840x2160 (Ultra HD)
});

let presetsEnum = Object.freeze({
  // hls v4 (for iOS, Quicktime/safari streaming)
  HLS_V4_AUDIO_160K:     '1351620000001-200060',   // HLS v4 Audio - 160k - only 2 audio options, this is the best quality (44100)
  HLS_V4_VIDEO_400K:     '1351620000001-200055',   // HLS v4 Video - 400k (400x288) -> not used by quality definitions
  HLS_V4_VIDEO_600K:     '1351620000001-200045',   // HLS v4 Video - 600k (480x320) -> SD
  HLS_V4_VIDEO_1M:       '1351620000001-200035',   // HLS v4 Video - 1M   (640x432) -> HD
  HLS_V4_VIDEO_1_5M:     '1351620000001-200025',   // HLS v4 Video - 1.5M (960x640) -> FHD
  HLS_V4_VIDEO_2M:       '1351620000001-200015',   // HLS v4 Video - 2M   (1024x768) -> UDH
  // mpeg-dash (for android, web streaming)
  MPEG_DASH_AUDIO_128K:  '1351620000001-500060',   // MPEG-Dash Audio - 128k - only 1 audio option (48000)
  MPEG_DASH_VIDEO_600K:  '1351620000001-500050',   // MPEG-Dash Video - 600k (426x240) -> SD
  MPEG_DASH_VIDEO_1_2M:  '1351620000001-500040',   // MPEG-Dash Video - 1.2M (640x360) -> HD
  MPEG_DASH_VIDEO_2_4M:  '1351620000001-500030',   // MPEG-Dash Video - 2.4M (854x480) -> FHD
  MPEG_DASH_VIDEO_4_8M:  '1351620000001-500020'    // MPEG-Dash Video - 4.8M (1280x720) -> UDH
});


let app;      // reference to toroback
let log;      // logger (toroback's child)
let transcoderDefaults = {
  inputContainer:  'a2server-transcoder',
  outputContainer: 'a2server-transcoder',
  inputPrefix:     'in/',
  outputPrefix:    'out/',
  localPath:       'fs/'
}

class Transcoder {
  constructor(_app, _options) {
    if (!_options.accessKeyId || !_options.secretAccessKey) {
      throw new Error('Transcoder: no AWS keys configuration available');
    }
    // internal // TODO: how to hide from export?
    app = _app;      // reference to toroback
    log = _app.log.child({module:'multimedia-transcoder'});  // logger (toroback's child)
    this.transcoderOptions = {
      accessKeyId: _options.accessKeyId,
      secretAccessKey: _options.secretAccessKey
    };
    // overwrite defaults with _options (except keys, they go in a different object)
    this.transcoderDefaults = Object.assign({ }, transcoderDefaults, _options);
    delete this.transcoderDefaults.accessKeyId;
    delete this.transcoderDefaults.secretAccessKey;
    // aws
    this.storage    = new aws.S3(this.transcoderOptions);
    this.transcoder = new aws.ElasticTranscoder(this.transcoderOptions);

    // public methods
    this.streaming    = streaming;
    this.readJob      = readJob;
    // public enums
    this.targets   = ( ) => { return targetEnum  };
    this.qualities = ( ) => { return qualityEnum };
    this.status    = ( ) => { return statusEnum  };
  };
}

// public methods

function readJob(id) {
  return new Promise( (resolve, reject) => {
    let resp = { };
    this.transcoder.readJob(id)
      .then( (job) => {
        console.log(JSON.stringify(job, null, 2));
        resp.id = job.Job.Id;
        let umd = job.Job.UserMetadata;
        if (umd) {  // this should exist
          resp.service   = umd.service;
          resp.container = umd.container;
          resp.targets   = umd.targets.split('/');
          resp.qualities = umd.qualities.split('/');
          resp.thumbnail = umd.thumbnail;
        }
        // aws job Status: Submitted, Progressing, Complete, Canceled, or Error
        switch(job.Job.Status) {
          case 'Submitted':  case 'Progressing':
            resp.status = statusEnum.processing;
            break;
          case 'Complete':  // build output based on metadata
            resp.status = statusEnum.complete;
            break;
          default:
            resp.status = statusEnum.error;
            for (i in job.Job.Outputs) {
              let out = job.Job.Outputs[i];
              if (out.Status == 'Error') {
                resp.errorMessage = out.StatusDetail;
                break;
              }
            }
            break;
        }
        return (job);
      })
      .then( (job) => readJobUserOutput(job) )
      .then( (output) => {  // undefined if status != complete
        resp.outputs = output;
        resolve(resp);
      })
      .catch( (err) => {
        reject(app.err.badRequest(err.message));
      });
  });
}

function streaming(options) {
  return new Promise( (resolve, reject) => {
    let localFile;  // archivo input en local fs
    let localJobId; // job creado
    let localJob;   // job procesado con exito

    Promise.resolve( )// '1501008380442-963cfr') // '1500674858402-gm9sxf')
    .then ( ( )        => checkOptions(options) )
    .then ( ( )        => checkOutputStorage(options.output) )
    .then ( ( )        => downloadUserFile(options.input) )
    .then ( (fileName) => {
        localFile = fileName;
        return uploadAWSFile(fileName, this.transcoderOptions);
    })
    .then ( (fileName) => transcodeFile(fileName, options, this.transcoder) )
    .then ( (jobId)    => {
        localJobId = jobId;
        resolve({ id: jobId, status: statusEnum.processing });
        return waitForJob(jobId, this.transcoder);
    })
    .then( (job)       => {
        localJob = job;
        return listAWSFiles(job, this.storage);
    })
    .then( (files)     => uploadUserFiles(files, options.output, this.transcoderOptions))
    .catch ( (err)     => {
        if (!localJobId) {
          reject(app.err.badRequest(err.message));
        }
        else {
          log.warn('Streaming: Error while processing job: ' + localJobId);
          log.warn(err.message);
        }
    }) // finally: remove local/remote temp files, whatever happens
    .then( ( )         => cleanUpFiles(localFile, localJob, this.storage));
  });
}


// other functions
 
function readJobUserOutput(job) {
  let out;
  let umd = job.Job.UserMetadata;

  if ((job.Job.Status == 'Complete') && umd) {
    let targets   = umd.targets.split('/');
    let qualities = umd.targets.split('/');
    out = [ ];

    targets.forEach( (target) => {
      let plName;
      let targetFormat;
      let thPrefix;

      switch(target) {
        case 'IOS':           targetFormat = 'HLSv4';     break;
        case 'ANDROID':       targetFormat = 'MPEG-DASH'; break;
        case 'WEB_MPEG_DASH': targetFormat = 'MPEG-DASH'; break;
      }

      for (i in job.Job.Playlists) {
        let pl = job.Job.Playlists[i];
        if (pl.Format == targetFormat) {
          let plSufix;
          switch(targetFormat) {  // TODO: leer abajo sobre el thumbnail
            case 'HLSv4':     plSufix = '.m3u8'; thPrefix = 'hls/';       break;
            case 'MPEG-DASH': plSufix = '.mpd' ; thPrefix = 'mpeg-dash/'; break;
          }
          plName = pl.Name + plSufix;
          break;
        }
      }

      if (plName) {
        let o = { };
        o.target = target;
        o.playlist = umd.pathPrefix + '/' + plName;
        // TODO: no tengo de dónde sacar este thumbnail sin listar el bucket path.
        o.thumbnail = umd.pathPrefix + '/' + thPrefix + '60x108-00001.png';
        out.push(o);
      }
    });
  }

  return out;
}

function cleanUpFiles(localFile, localJob, storage) {
  // clean up some of the files:
  // 1.- the input downloaded to local file system
  // 2.- the input/output files in the AWS transcoder container
  // the rest of the files are unlinked at the time of download/upload result
  
  // 1) remove first user file downloaded to local
  if (localFile)
    fs.unlink(transcoderDefaults.localPath + localFile, (err) => { log.warn(err) });

  // 2) temporal files in aws
  if (localJob) {
    let objects = [{ Key: localJob.Job.Input.Key }];

    // delete input. then, list output files and delete them
    storage.deleteObjects(transcoderDefaults.inputContainer, objects)
      .then( ( ) => storage.listFiles(transcoderDefaults.outputContainer, localJob.Job.OutputKeyPrefix))
      .then( (data) => {
        objects = [ ];
        data.Contents.forEach( (file) => {
          objects.push({ Key: file.Key });
        });
        return storage.deleteObjects(transcoderDefaults.outputContainer, objects);
      })
      .then( ( ) => {
        log.debug('Streaming (cleanUpFiles): Clean up finished ok');
      })
      .catch( (err) => {
        log.warn('Streaming (cleanUpFiles): Error cleaning up temp AWS files');
      })
  }

  return;
}

// download files from AWS and upload them to user container
function uploadUserFiles(files, output, transcoderOptions) {
  // console.log('==========================>>>> uploadUserFiles');
  log.trace('uploadUserFiles');
  return new Promise( (resolve, reject) => {
    let awsStorage  = new app.FileStorage('aws', null, transcoderOptions);
    let userStorage = new app.FileStorage(output.service);
    if (awsStorage && userStorage) {
      // download each file from aws, then upload to user container,
      // then remove local file (all, one by one)
      let lastError;
      let userFiles = [ ];
      files.forEach(file => {
        // download aws file
        let fileName   = Math.random().toString(36).slice(2);
        let fileStream = fs.createWriteStream(
          transcoderDefaults.localPath + fileName,
          { defaultEncoding: 'binary' }
        );
        let arg = {
          container: transcoderDefaults.outputContainer,
          file:      file,
          res:       fileStream
        };
        awsStorage.downloadFile(arg)
          .then( ( ) => {
            log.trace('AWS file downloaded: ' + file);
            // upload to user container. remove prefix (out/<random>/)
            let userFileName = output.pathPrefix + '/' + file.split('/').slice(2).join('/');
            let arg = {
              container: output.container,
              path: userFileName, // destination
              file: { path: transcoderDefaults.localPath + fileName }   // local path to read file from
            };
            return userStorage.uploadFile(arg);
          })
          .then( (doc) => { return doc.file })
          .catch( (err) => {
            log.error('Streaming: uploadUserFiles failed: ' + file);
            log.error(err);
            lastError = err;
            return 'Error: ' + file;
          })
          .then( (file) => { // finally:
            // add to final array. if comming from then (remote file name),
            // from catch (Error + remote file name (container key))
            userFiles.push(file);
            // unlink local file
            log.trace('Streaming: uploadUserFiles removing file: ' + fileName);
            fs.unlink(transcoderDefaults.localPath + fileName, ( ) => { });
            // verify if all files have finished processing
            if (userFiles.length >= files.length) {
              log.info('Streaming: uploadUserFiles finished '
                + (lastError ? 'with errors' : 'successfully') + '. Total files: ' + files.length);
              
              if (lastError) reject(lastError);
              else           resolve (userFiles);
            }
          });
      });
    } else {
      reject(new Error('Streaming: Upload user files - Output storage not configured: ' + output.service));
    }
  });
}

// retrieves a list of all the output files from the transcoding
function listAWSFiles(job, storage) {
  // console.log('==========================>>>> listAWSFiles');
  log.trace('listAWSFiles');
  return new Promise( (resolve, reject) => {
    // TODO: cambiar FileStorage para que devuelva la lista de archivos de un path, no de todo el bucket
    storage.listFiles(transcoderDefaults.outputContainer, job.Job.OutputKeyPrefix)
      .then( (data) => {
        let fileList = data.Contents.map(file => { return file.Key });
        if (fileList.length > 0)  resolve(fileList);
        else reject(new Error('Streaming: no output files from transcoding'));
      })
      .catch( reject );
  });
}

// waits for a job to finish
function waitForJob(jobId, transcoder) {
  // TODO: esto es de aws y tarda 30 segundos en el loop.
  // se puede hacer uno propio para disminuir el tiempo,
  // o se puede configurar el webhook del transcoder para enterarse
  // de cuándo terminó el job.
  // console.log('==========================>>>> waitForJob');
  log.trace('waitForJob');
  return new Promise( (resolve, reject) => {
    transcoder.waitForJobComplete(jobId)
      .then( resolve )
      .catch( reject );
  });
}

// transcodes a file
function transcodeFile(fileName, options, transcoder) {
  // console.log('==========================>>>> transcodeFile');
  log.trace('transcodeFile');
  return new Promise( (resolve, reject) => {
    Promise.resolve( )
      .then ( ( ) => getAvailablePipeline(transcoder) )
      .then ( (pipeline) => {
        return {
          pipelineId: pipeline,
          inputFile:  transcoderDefaults.inputPrefix + fileName,
          outputKey:  transcoderDefaults.outputPrefix + fileName + '/',
          targets:    options.output.targets,
          qualities:  options.output.qualities,
          thumbnail:  options.output.thumbnail,
          metadata:   {
            service: options.output.service,
            container: options.output.container,
            pathPrefix: options.output.pathPrefix,
            targets: options.output.targets.join('/'),
            qualities: options.output.qualities.join('/'),
            thumbnail: options.output.thumbnail ? 'true' : 'false'
          }
        };
      })
      .then ( (jobOptions) => buildJobParams(jobOptions) )
      .then ( (jobParams) => transcoder.createJob(jobParams) )
      .then ( resolve )
      .catch ( reject );
  });
}

// gets an available pipeline for transcoding
function getAvailablePipeline(transcoder) {
  return new Promise( (resolve, reject) => {
    transcoder.listPipelines( )
      .then( (data) => {
        let pl  = data.Pipelines;
        let len = pl.length;
        let pid = null;
        for ( i = 0 ; i < len ; i++ ) {
          if (pl[i].Status == 'Active') {
            pid = pl[i].Id;
          }
        }
        if (pid) resolve(pid);
        else {
          let err = new new Error('No pipelines available');
          reject(err);
        }
      })
      .catch(reject);
  });
}

// build parameter object for new job, setting defaults 
// accepts only individual inputs
// options: {
//   pipelineId: (String) pipeline id where to send the job
//   inputFile:  (String) name of the file to transcode, relative to pipeline bucket
//   outputKey:  (String) key to prefix to all the outputs according to transcoding profiles
//   targets:    ([targetEnum]) targets to transcode
//   qualities:  ([qualityEnum]) qualities to transcode
//   thumbnail:  (Bool) true if thumbnails wanted along with the video transcoding (default: false)
// }
function buildJobParams(options = {}) {

  let params        = { };  // object with transcoding params
  let presets = getPresets(options.targets, options.qualities);

  // assign pipeline
  params.PipelineId = options.pipelineId;
  // config input source
  params.Input = buildInputObject(options.inputFile);
  // config outputs
  params.OutputKeyPrefix = options.outputKey;
  params.Outputs = [ ];
  presets.forEach( (preset) => {
    params.Outputs.push(buildOutputObject(preset, options.thumbnail));
  });
  // config playlists
  params.Playlists = buildPlaylists(params.Outputs);
  // metadata, to be able to reconstruct output by user request
  params.UserMetadata = options.metadata;

  return params;
}


// returns an array of presets to be transcoded,
// according to targets and quality selected
function getPresets(targets, qualities) {
  // targets Array from targetEnum
  // qualities Array from qualityEnum
  // returns Array of presetsEnum (may be empty)
  let presets = new Set( );
  let te = targetEnum;
  let qe = qualityEnum;
  let pe = presetsEnum;

  // first, add video presets
  targets.forEach( (t) => {
    qualities.forEach( (q) => {
      // HLS_V4_VIDEO_400K not used
      switch (true) {
        case (te[t] == te.IOS && qe[q] == qe.SD):            presets.add(pe.HLS_V4_VIDEO_600K);      break;
        case (te[t] == te.IOS && qe[q] == qe.HD):            presets.add(pe.HLS_V4_VIDEO_1M);        break;
        case (te[t] == te.IOS && qe[q] == qe.FHD):           presets.add(pe.HLS_V4_VIDEO_1_5M);      break;
        case (te[t] == te.IOS && qe[q] == qe.UHD):           presets.add(pe.HLS_V4_VIDEO_2M);        break;
        case (te[t] == te.ANDROID && qe[q] == qe.SD):        presets.add(pe.MPEG_DASH_VIDEO_600K);   break;
        case (te[t] == te.ANDROID && qe[q] == qe.HD):        presets.add(pe.MPEG_DASH_VIDEO_1_2M);   break;
        case (te[t] == te.ANDROID && qe[q] == qe.FHD):       presets.add(pe.MPEG_DASH_VIDEO_2_4M);   break;
        case (te[t] == te.ANDROID && qe[q] == qe.UHD):       presets.add(pe.MPEG_DASH_VIDEO_4_8M);   break;
        case (te[t] == te.WEB_MPEG_DASH && qe[q] == qe.SD):  presets.add(pe.MPEG_DASH_VIDEO_600K);   break;
        case (te[t] == te.WEB_MPEG_DASH && qe[q] == qe.HD):  presets.add(pe.MPEG_DASH_VIDEO_1_2M);   break;
        case (te[t] == te.WEB_MPEG_DASH && qe[q] == qe.FHD): presets.add(pe.MPEG_DASH_VIDEO_2_4M);   break;
        case (te[t] == te.WEB_MPEG_DASH && qe[q] == qe.UHD): presets.add(pe.MPEG_DASH_VIDEO_4_8M);   break;
      }
    });
  });

  // add audio according to video presets available
  presets.forEach( (preset) => {
    // by specs, forEach range of elements is set before the first callback
    // so, no problem about modifying the same set
    switch (preset) {
      case pe.HLS_V4_VIDEO_400K:
      case pe.HLS_V4_VIDEO_600K:
      case pe.HLS_V4_VIDEO_1M:
      case pe.HLS_V4_VIDEO_1_5M:
      case pe.HLS_V4_VIDEO_2M:
        presets.add(pe.HLS_V4_AUDIO_160K);
        break;
      case pe.MPEG_DASH_VIDEO_600K:
      case pe.MPEG_DASH_VIDEO_1_2M:
      case pe.MPEG_DASH_VIDEO_2_4M:
      case pe.MPEG_DASH_VIDEO_4_8M:
        presets.add(pe.MPEG_DASH_AUDIO_128K);
        break;
    }
  });

  // make it an array
  return Array.from(presets);
}

// builds an array of playlists according to outputs requested
// required to create a transcoding job
function buildPlaylists(outputs) {
  // receives Array of output objects (from presets) to be transcoded
  // usualy from buildOutputByPreset() pushed to Array
  // returns Array of Playlists (could be empty if no mpeg-dash or hls detected)
  
  let playlists    = [ ];
  let hlsList      = {
    Name:       'hls/playlist',
    Format:     'HLSv4',
    OutputKeys: [ ]
  };
  let mpegDashList = {
    Name:       'mpeg-dash/playlist',
    Format:     'MPEG-DASH',
    OutputKeys: [ ]
  };
  let p = presetsEnum;

  outputs.forEach( (o) => {
    switch (o.PresetId) {
      case p.HLS_V4_AUDIO_160K:
      case p.HLS_V4_VIDEO_400K:
      case p.HLS_V4_VIDEO_600K:
      case p.HLS_V4_VIDEO_1M:
      case p.HLS_V4_VIDEO_1_5M:
      case p.HLS_V4_VIDEO_2M:
        hlsList.OutputKeys.push(o.Key);
        break;
      case p.MPEG_DASH_AUDIO_128K:
      case p.MPEG_DASH_VIDEO_600K:
      case p.MPEG_DASH_VIDEO_1_2M:
      case p.MPEG_DASH_VIDEO_2_4M:
      case p.MPEG_DASH_VIDEO_4_8M:
        mpegDashList.OutputKeys.push(o.Key);
        break;
    }
  });

  if (hlsList.OutputKeys.length > 0)
    playlists.push(hlsList);
  if (mpegDashList.OutputKeys.length > 0)
    playlists.push(mpegDashList);

  return playlists;
}

// builds the input object for transcoding with default values
function buildInputObject(inputFile) {
  let i = {
    Key:         inputFile,
    FrameRate:   'auto',
    Resolution:  'auto',
    AspectRatio: 'auto',
    Interlaced:  'auto',
    Container:   'auto',
    TimeSpan:    { Duration: '00010.000' }  // 10-second frames
  };

  return i;
}

// builds a job request output object according to preset
// required to create a transcoding job
function buildOutputObject(preset, thumbnail = false) {
  // preset comes from presetsEnum
  // thumbnail (create thumbnails) is useful only when preset is for video
  // throws on error (invalid preset)
  let o = { };
  let p = presetsEnum;

  // preset. will throw later if invalid
  o.PresetId = preset;

  // key. depends on preset
  // (needs .mp4 for mpeg-dash. auto appends {counter} on hls (even in hls v4 with one file))
  switch (preset) {
    case p.HLS_V4_AUDIO_160K:     o.Key = 'hls/audio-160k';         break;
    case p.HLS_V4_VIDEO_400K:     o.Key = 'hls/video-400k';            break;
    case p.HLS_V4_VIDEO_600K:     o.Key = 'hls/video-600k';            break;
    case p.HLS_V4_VIDEO_1M:       o.Key = 'hls/video-1m';              break;
    case p.HLS_V4_VIDEO_1_5M:     o.Key = 'hls/video-1_5m';            break;
    case p.HLS_V4_VIDEO_2M:       o.Key = 'hls/video-2m';              break;
    case p.MPEG_DASH_AUDIO_128K:  o.Key = 'mpeg-dash/audio-128k.mp4';   break;
    case p.MPEG_DASH_VIDEO_600K:  o.Key = 'mpeg-dash/video-600k.mp4';   break;
    case p.MPEG_DASH_VIDEO_1_2M:  o.Key = 'mpeg-dash/video-1_2m.mp4';   break;
    case p.MPEG_DASH_VIDEO_2_4M:  o.Key = 'mpeg-dash/video-2_4m.mp4';   break;
    case p.MPEG_DASH_VIDEO_4_8M:  o.Key = 'mpeg-dash/video-4_8m.mp4';   break;
    default:
      throw new Error('Invalid Preset');
      break;
  }

  // thumbnail
  o.ThumbnailPattern = '';  // required empty if not used
  if (thumbnail) {
    switch (preset) {
      case p.HLS_V4_VIDEO_400K:
      case p.HLS_V4_VIDEO_600K:
      case p.HLS_V4_VIDEO_1M:
      case p.HLS_V4_VIDEO_1_5M:
      case p.HLS_V4_VIDEO_2M:
        o.ThumbnailPattern = 'hls/{resolution}-{count}';
        break;
      case p.MPEG_DASH_VIDEO_600K:
      case p.MPEG_DASH_VIDEO_1_2M:
      case p.MPEG_DASH_VIDEO_2_4M:
      case p.MPEG_DASH_VIDEO_4_8M:
        o.ThumbnailPattern = 'mpeg-dash/{resolution}-{count}';
        break;
    }
  }

  // other fixed defaults
  o.Rotate = 'auto';
  o.SegmentDuration = '10';

  return o;
}


// uploads the file to aws with toroback credentials
function uploadAWSFile(fileName, transcoderOptions) {
  // console.log('==========================>>>> uploadAWSFile');
  log.trace('uploadAWSFile');
  return new Promise( (resolve, reject) => {
    let storage  = new app.FileStorage('aws', undefined, transcoderOptions);
    if (storage) {
      let arg = {
        container: transcoderDefaults.inputContainer,
        path: transcoderDefaults.inputPrefix + fileName, // destination
        file: { path: transcoderDefaults.localPath + fileName }   // local path to read file from
      };
      storage.uploadFile(arg)
        .then( ( ) => resolve(fileName) )
        .catch(reject);
    } else {
      reject(new Error('Transcoder storage not configured. This is a ToroBack internal missing configuration.'));
    }
  });
}

// grabs file from input user storage, and uploads it to AWS (required for transcoding)
function downloadUserFile(input) {
  // console.log('==========================>>>> downloadUserFile');
  log.trace('downloadUserFile');
  return new Promise( (resolve, reject) => {
    // TODO: arreglar esto:
    // - hay que crear un archivo?? cambiar el nombre (fs/?).. borrar al terminar
    // - se guarda el archivo completo antes de hacer upload. se podría aprovechar el stream y subir directamente?
    let fileName   = Math.random().toString(36).slice(2);
    let fileStream = fs.createWriteStream(
      transcoderDefaults.localPath + fileName,
      { defaultEncoding: 'binary' }
    );
    // choose source (url or bucket)
    if (input.service == 'url') {
      let downloader = input.path.match(/^http:\/\//i) ? require('http') : require('https');

      downloader.get( input.path, (resp) => {
        resp.pipe(fileStream);
        resp.on('end', (resp) => resolve(fileName));
      }).on('error', (err) => {
        fs.unlink(transcoderDefaults.localPath + fileName, (err) => { log.warn(err) });
        reject(err);
      });
    } else {
      let storage  = new app.FileStorage(input.service);
      if (storage) {
        let arg = {
          container: input.container,
          file:      input.path,
          res:       fileStream
        };
        storage.downloadFile(arg)
          .then( ( ) => {
            resolve(fileName);
          })
          .catch( (err) => {
            fs.unlink(transcoderDefaults.localPath + fileName, (err) => { log.warn(err) });
            reject(err);
          });
      } else {
        reject(new Error('Input storage not configured: ' + input.service));
      }
    }
  });
}

// checks for required access on output storage
function checkOutputStorage(out) {
  // console.log('==========================>>>> checkOutputStorage');
  // this is to avoid creating the job and then have no access to output storage
  log.trace('checkOutputStorage');

  // TODO: FileStorage breaks if service is not configured. it should return null, not break!
  // TODO: FileStorage returns local storage (does it?) if an unhandled service is passed. should return null
  // TODO: FileStorage has no way to verify RW access. a method should exist for that.

  // TODO: arreglar todo esto aquí abajo... no pude probar bien hasta no arreglar FileStorage
  return new Promise( (resolve, reject) => {
    let storage  = new app.FileStorage(out.service);
    if (!storage)
      reject(new Error('Service ' + out.service + ' not configured'));
    else {
      // check for container existance at least (there's no way yet to read RW access)
      storage.getContainerInfo({ name: out.container })
        .then( ( ) => resolve(out))
        .catch( reject );   // TODO: ah ok... FileStorage se rompe si no existe el bucket! (o si se escribe con mayúscula)
    }
  });
}

// checks for required streaming options
function checkOptions(options) {
  // console.log('==========================>>>> checkOptions');
  log.trace('checkOptions');
  // TODO: esta verificación debería salir de las opciones de storage
  // required input format is verified in job creation
  let outputServices = ['local', 'gcloud', 'aws'];
  let inputServices = outputServices.concat('url'); // input can also be retrived from url

  if (!options)        throw new Error('Streaming: options missing');
  if (!options.input)  throw new Error('Streaming: options.input missing');
  if (!options.output) throw new Error('Streaming: options.output missing');

  let i = options.input;
  let o = options.output;

  // check input
  if ( !(inputServices.includes(i.service)) )
    throw new Error('Streaming: Invalid input.service. Valid options: '
      + inputServices.toString());

  if (!i.container && (i.service != 'url'))
    throw new Error('Streaming: input.container missing');

  if (!i.path)
    throw new Error('Streaming: input.path missing');
  
  switch(i.service) {
    case 'url': { 
      if (!i.path.match(/^https?:\/\//i))
        throw new Error('Streaming: input.service (' + i.service +
          '): input.path should start with http:// or https://');
    } break;
    case 'local': 
    case 'gcloud':
    case 'aws':
    { // TODO: local esto no debería ser público
      // nothing to do?
    } break;
/*    case 'gcloud': { // TODO: gcloud esto no debería ser público
      if (!i.path.match(/^gs:\/\//))
        throw new Error('Streaming: input.service (' + i.service +
          '): input.path should start with gs://');
    } break;
    case 'aws': { // TODO: aws esto no debería ser público
      if (!i.path.match(/^s3:\/\//))
        throw new Error('Streaming: input.service (' + i.service +
          '): input.path should start with s3://');
    } break;
*/
  }

  // check output
  if ( !(outputServices.includes(o.service)) )
    throw new Error('Streaming: Invalid output.service. Valid options: ' + outputServices.toString());
  
  if (!o.container)
    throw new Error('Streaming: output.container missing');

  if (!o.container.match(/^[a-z][a-z0-9\-\_]*$/i))
    throw new Error('Streaming: invalid output.container name: ' + o.container);
  
  if (!o.pathPrefix)
    throw new Error('Streaming: output.pathPrefix missing');

  if (!o.targets || o.targets.length == 0)
    throw new Error('Streaming: output.targets missing');

  o.targets.forEach( t => {
    if (!targetEnum[t])
      throw new Error('Streaming: Invalid output.targets['
        + t + ']. Valid options: ' + Object.keys(targetEnum).toString());
  });

  if (!o.qualities || o.qualities.length == 0)
    throw new Error('Streaming: output.qualities missing');

  o.qualities.forEach( q => {
    if (!qualityEnum[q])
      throw new Error('Streaming: Invalid output.qualities['
        + q + ']. Valid options: ' + Object.keys(qualityEnum).toString());
  });

  // all fine. thumbnails and public are optionsl
  return options;
}

module.exports = Transcoder;
