// submodels.js
// various models for subdocuments

let mongoose = require('mongoose');
let Schema   = mongoose.Schema;

const storageTypes = [ 'local', 'gcloud', 'aws', 'url' ];

// Model: file in storage bucket
let mediaFileSchema  = new Schema ({
  path:       { type: String },  // path to file, relative to bucket. required if service!=url
  // access information:
  url:       { type: String, required: true },   // url, can be accessed with a token if file is private
  // media information, optional:
  mime:      { type: String },
  w:         { type: Number, min: 0 },
  h:         { type: Number, min: 0 },
  size:      { type: Number, min: 0 }//Tamaño del archivo en bytes
}, { _id: false });

module.exports = {
  // definitions:
  storageTypes: storageTypes,
  // sub-model schemas:
  mediaFile:    mediaFileSchema
}