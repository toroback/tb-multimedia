let aws = require('aws-sdk');

function ElasticTranscoder(options) {
  let localOptions = {
    apiVersion: '2012-09-25',
    maxRetries: 3,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region ? options.region : 'eu-west-1'
  };
  this.self = new aws.ElasticTranscoder(localOptions);
  this.readJob = readJob;
  this.createJob = createJob;
  this.listPipelines = listPipelines;
  this.waitForJobComplete = waitForJobComplete;
}

function S3(options) {
  let localOptions = {
    apiVersion: '2006-03-01',
    maxRetries: 3,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region ? options.region : 'eu-west-1'
  };
  this.self = new aws.S3(localOptions);
  this.listFiles = listFiles;
  this.deleteObjects = deleteObjects;
}

// ////
// AWS wrapper to promises
// ////

// delete array of objects from a bucket
function deleteObjects(bucket, objects) {
  return new Promise( (resolve, reject) => {
    let params = { Bucket: bucket, Delete: { Objects: objects } };
    this.self.deleteObjects(params, (err, data) => {
      if (err) reject(err);
      else {
        if (data.Errors && data.Errors.length > 0)
          reject(data);
        else
          resolve(data);
      }
    });
  });
}

// lists all files from a bucket, optionally with a prefix
function listFiles(bucket, prefix) {
  return new Promise( (resolve, reject) => {
    let params = { Bucket: bucket, Prefix: prefix };
    this.self.listObjectsV2(params, (err, data) => {
      if (err) reject(err);
      else     resolve(data);
    });
  });
}

// create a new transcoding job
function readJob( jobId ) {
  return new Promise( (resolve, reject) => {
    let params = { Id: jobId };
    this.self.readJob(params, (err, data) => {
      if (err) reject(err);
      else     resolve(data);
    });
  });
}

// create a new transcoding job
function createJob( params ) {
  return new Promise( (resolve, reject) => {
    this.self.createJob(params, (err, data) => {
      if (err) reject(err);
      else     resolve(data.Job.Id);
    });
  });
}

// read pipelines
function listPipelines( ) {
  return new Promise( (resolve, reject) => {
    this.self.listPipelines({ }, (err, data) => {
      if (err) reject(err);
      else     resolve(data);
    });
  });
}

// wait for job to complete
function waitForJobComplete( jobId ) {
  return new Promise( (resolve, reject) => {
    let params = { Id: jobId };
    this.self.waitFor('jobComplete', params, function(err, data) {
      if (err) reject(err);
      else     resolve(data);
    });
  });
}

module.exports = {
  ElasticTranscoder: ElasticTranscoder,
  S3: S3
}
