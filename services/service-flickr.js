var Flickr = require('flickr-sdk');


class Client {

  constructor(options){
    this.options = options;
    this.oauth = new Flickr.OAuth(
      options.clientId,
      options.secretKey
    );

  }

  upload(arg){
    return new Promise((resolve,reject) =>{
      var plugin = this.oauth.plugin(
        arg.token,
        arg.tokenSecret
      );

      // var flickr = new Flickr();
      let options = {};
      if(arg.title){
        options.title = arg.title;
      }
      
      new Flickr.Upload(plugin, arg.file.path, options) 
        .then(function (res) {
          // console.log('yay!', res.body);
          resolve(res);
        }).catch(function (err) {
          // console.error('bonk', err);
          reject(err);
        });
    });
  }

  genTestToken(){
    return new Promise((resolve, reject) => {
      this.oauth.request(`${App.baseRoute}`+'/srv/multimedia/genTokenCallback').then(function (res) {
        console.log('yay!', res);
      }).catch(function (err) {
        console.error('bonk', err);
      });
      // a2s.serverOptions.host+":"+a2s.serverOptions.port
    });
  }

}


module.exports = Client;



/**
// EJEMPLO:

  Añadir en confir.json:

   "socialOptions": {
      ...

      "flickr":{
        "clientId" : "b471f072118efdfce9912d4f3e12c6c4",
        "secretKey" : "17e7ce17a3c5e5d7"
      }

      ...
    }


 PETICION 
   POST MULTIPART:   https://localhost:4524/api/v1/srv/multimedia/upload?token=<myToken>&tokenSecret=<mytokensecret>

 DATOS MULTIPART:
   "fileUpload": El archivo a subir
**/