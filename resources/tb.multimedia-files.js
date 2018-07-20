/**
 * Multimedia file storage
 * Partially uses File Storage models.
 * Keeps information about stored re-formatted multimedia files
 */

let mongoose  = require('mongoose');
let Schema    = mongoose.Schema;

let submodels = require('./submodels.js');
let helper    = require('./helpers/tb.multimedia-files.js');

let schema  = new Schema ({
  // datos del original, y compartidos por todos los sizes
  service:    { type: String, enum: submodels.storageTypes, required: true },    // file storage service
  container:  { type: String },  // bucket name. required if service!=url
  public:     { type: Boolean, required: true, default: false }, // is publicly accessible?
  // pathPrefix: { type: String, required: true },   // prefijo del path de todos

  slug:       { type: String, required: true},  // 

  //Specific for original file
  path:       { type: String },  // path to file, relative to bucket. required if service!=url
  url:        { type: String, required: true },   // url, can be accessed with a token if file is private
  mime:      { type: String },
  w:         { type: Number, min: 0 },
  h:         { type: Number, min: 0 },
  size:      { type: Number, min: 0 },//Tamaño del archivo en bytes

  sizes: [{ type: String, required: true }]  // available sizes in this document. (syntax: empty array)
  // rest of values added as non-strict schema, in first level for easy access on clients:
  // s_m: { type: submodels.mediaFile },
  // s_s: { type: submodels.mediaFile },
  // s_t: { type: submodels.mediaFile },
  // s_pepe: { type: submodels.mediaFile },
},
{
  strict: false,
  timestamps: { createdAt: 'cDate', updatedAt: 'uDate' }
});

schema.index({ 'slug': 1 }, { 'unique': true });  // unique identifier for url prefix

schema.pre('remove', function(next, ctx) {  // this can NOT be an arrow function
  console.log('========>>> HOOK: pre remove (model tb.multimedia-files)');
  helper.preRemoveHook(this)
    .then(next)
    .catch(next);
});


schema.pre('save', function(next, ctx) {  // this can NOT be an arrow function
  console.log('========>>> HOOK: pre save (tb.multimedia-files)');
  helper.preSaveHook(this)
    .then(next)
    .catch(next);
});

module.exports = schema;
