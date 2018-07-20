
module.exports = {
  /**
   * Descarga un archivo de la url indicada
   * @param  {String} url URL del archivo a descargar
   * @param  {Object} cb Callback de la peticion
   * @param  {Strean} cb.resp Flujo de la descarga
   * @param  {Object} cb.data Objeto con informacion de los headers
   * @param  {Object} cb.data.filename Nombre del archivo extraido del content-disposition
   * @param  {Object} cb.data.contentType ContentType extraido del header
   * @return {}   
   */
  downloadFile: function(url, cb){
    // return new Promise( (resolve, reject) => {
      let downloader = url.match(/^http:\/\//i) ? require('follow-redirects').http : require('follow-redirects').https;//require('http') : require('https');

      return downloader.get( url, (resp) => {
        var filename;
        var contentType;
        var contentDispositionHeader = resp.headers['content-disposition'];
        if(contentDispositionHeader){
            var regexp = /filename=\"(.*)\"/gi;
            filename = regexp.exec( contentDispositionHeader)[1];
        }
        contentType = resp.headers['content-type'];

        var data = {
            filename: filename,
            contentType: contentType
        };
     
        if(cb) cb(resp, data);
      });
    
  },

  extensionForContentType: function(contentType){
    if(contentType == "image/jpeg"){
      return ".jpg";
    }else if(contentType == "image/png"){
      return ".png";
    }else if(contentType == "image/gif"){
      return ".gif";
    }
  },

  generateSlug: function(string) {
    return "slugerized_"+string.substring(0,string.indexOf("."));
  }


}