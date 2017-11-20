# tb-multimedia Reference

Este módulo ofrece distintas funcionalidades multimedia. Algunas de ellas son:

- Streaming de video 
- Edición de imágenes

## Instalación y configuración

 **IMPORTANTE:** Algunas de las funciones de tb-multimedia, como la edición de imágenes, requieren tener instalado Graphic's Magick en el servidor.

  Para más información sobre cómo instalarlo consultar la página web: http://www.graphicsmagick.org

  En primer lugar vamos a explicar como se realiza la configuración del módulo para poder utilizarlo, aunque no todas las funciones requieren de ella.

### **- Configuración manual:**

La configuración manual del módulo se realiza en el archivo **"config.json"** que se encuentra en la carpeta **"app"**.
Para ello es necesario agregar un objeto cuya clave sea **"multimediaOptions"**, donde se configurarán las distintas funcionalidades que lo necesiten.

- Ejemplo:

```javascript
...
"multimediaOptions": {
  ...
}
...
```

# Video streaming

Transformar un video en formato de Streaming permite que el cliente descargue el vídeo “por partes” pequeñas y pueda comenzar a reproducirlo sin tener que descargar el archivo por completo.
Para ello, se recibe un vídeo en cualquier formato, y éste se transforma a formatos compatibles con streaming reproducibles en iOS (HLSv4), Android (MPEG-DASH) y Web (MPEG-DASH for web).

Para transformar vídeos a streaming, se deben seguir 2 pasos:

**1 -** Solicitar transformación a streaming. Esto crea un job (una solicitud de trabajo), que puede tomar pocos segundos o varios minutos dependiendo de la longitud del vídeo.

**2 -** Solicitar el estado del job creado con anterioridad. Una vez que el job esté listo, los archivos estarán disponibles para ser reproducidos en streaming.

Para configurar el servicio de streaming, en el objeto de configuración de multimedia ("multimediaOptions"), hay que añadir un objeto llamado "transcoder" que contendrá credenciales del servicio AWS de Amazon necesarias. El objeto será de la siguiente manera:

```javascript
  ...
  "multimediaOptions": {
    "transcoder":{
      "accessKeyId": "……",
      "secretAccessKey": "……"
    }
  }
  ...
```

## Solicitud de Streaming

En la solicitud de Streaming se especifica el video de entrada y el formato y configuración del video de salida.

El archivo de entrada puede estar alojado en alguno de los servicios de almacenamiento soportados por el módulo tb-storage (“local”, “gcloud”, “aws”), o puede ser tomado de una URL pública que contenga un archivo de vídeo.

La salida del streaming es un conjunto de archivos, y su formato, calidad y estructura depende de las plataformas destino y la variedad de calidades deseada. Dichos archivos siempre serán públicos para que puedan ser reproducidos directamente desde su ubicación.

La respueta de la solicitud retorna un “job id”, o identificador del trabajo de streaming que se está realizando. Se debe utilizar este id para consultar el estado del proceso posteriormente.


NOTA: Para más información sobre el módulo de almacenamiento tb-storage consultar la siguiente URL: "https://github.com/toroback/tb-storage"


### **- Solicitud y Parámetros**
  
La solicitud se puede realizar mediante la REST Api, realizando una petición POST a la siguiente URL:

 `https://a2server.a2system.net:XXXX/api/v1/srv/multimedia/streaming`

ó utilizando las funciones internas de la siguiente manera:

```js
  var pamatetros = {...};
  var multimedia = new App.Multimedia();
  multimedia.streaming(parametros)
  .then(res =>{ … })
  .catch(err => { … });
```


#### **• Parámetros de la solicitud:**

**- Objeto de entrada:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|input|Object||Contiene la información de donde tomar el video de entrada|
|input.service|String||Servicio de almacenamiento (valores: local, gcloud, aws, url)|
|input.container|String||Nombre del Bucket en el servicio. No requerido si service=url|
|input.path|String||Path al archivo, relativo al bucket. Si service = url, es la URL completa del archivo.|
  
**- Objeto de salida:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|output|Object||Configuración de salida, dónde ubicar los archivos y playlists del straming.|
|output.service|String||Servicio de almacenamiento (valores: local, gcloud, aws)|
|output.container|String||Nombre del Bucket en el servicio. Debe existir.|
|output.pathPrefix|String||Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket|
|output.targets|Array||Plataformas para las que se va a realizar el Streaming. (valores: IOS, ANDROID, WEB_MPEG_DASH)|
|output.qualities|Array||Resoluciones de video en que estará disponible la salida. (valores: SD, HD, FHD, UHD)|
|output.thumbnail|Bool|X|Indica si hay que generar un thumbnail. Por defecto es false|

#### **• Parámetros de la respuesta:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|id|String||Identificador del trabajo de streaming asociado a la petición.|
|status|String||Estado de procesamiento del trabajo (valores: "processing", "complete", "error")|
  
### **- Ejemplo REST 1: Video de URL**

POST: `https://a2server.a2system.net:1234/api/v1/srv/multimedia/streaming`

Body:

```js
{
  "input": {
    "service": "url",
    "path": "http://www.sample-videos.com/video/mp4/360/big_buck_bunny_360p_5mb.mp4"
  },
  "output": {
    "service": "aws",
    "container": "micontenedor",
    "pathPrefix": "test-streaming/prueba-1",
    "targets": ["IOS", "ANDROID"],
    "qualities": ["SD", "HD"],
    "thumbnail": true
  }
}
```

Respuesta:
```js
{
  "id": "1504485209559-bwzg66",
  "status": "processing"
}
```


### Ejemplo REST 2: Video en almacenamiento tb-storage

POST: `https://a2server.a2system.net:1234/api/v1/srv/multimedia/streaming`

Body:
```js
{
  "input": {
    "service": "local",
    "container": "videos",
    "path": "user/123456789"
  },
  "output": {
    "service": "aws",
    "container": "micontenedor",
    "pathPrefix": "test-streaming/prueba-2",
    "targets": ["IOS", "ANDROID"],
    "qualities": ["SD", "HD"],
    "thumbnail": true
  }
}
```

Respuesta:
```js
{
  "id": "1504485209559-bwzg77",
  "status": "processing"
}
```

## Consultar estado de procesamiento

Con el id recibido en el comando anterior, se puede consultar el estado del trabajo de streaming solicitado. Cuando el proceso termine, el estado del trabajo cambiará a “complete” y se recibirá la información de los archivos.

### **- Solicitud y Parámetros**

La solicitud se puede realizar mediante la REST Api, realizando una petición GET a la siguiente URL:

`https://a2server.a2system.net:XXXX/api/v1/srv/multimedia/streaming/<id_trabajo>`

ó utilizando las funciones internas de la siguiente manera:

```js
  var jobId = " … ";
  var multimedia = new App.Multimedia();
  multimedia.readJob(jobId)
  .then(res =>{ … })
  .catch(err => { … });
```

#### **• Parámetros de la solicitud:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|jobId|String||Identificador del trabajo de streaming|

#### **• Parámetros de la respuesta:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|id|String||Identificador del trabajo de streaming asociado a la petición.|
|status|String||Estado de procesamiento del trabajo (valores: "processing", "complete", "error")|
|outputs|Array||Array con los archivos del streaming especificos para cada plataforma.|
|outputs.target|String||Plataforma destinada del archivo|
|outputs.playlist|String||PlayList del streaming|
|outputs.thumbnail|String||Thumbnail del video|
    
### **- Ejemplo REST**

GET: `https://a2server.a2system.net:1234/api/v1/srv/multimedia/streaming/1504485209559-bwzg66`

Respuesta:
```js
{
  "id": "1504485209559-bwzg66",
  "status": "complete",
  "outputs": [
    {
      "target": "IOS",
      "playlist": "https://s3.eu-central-1.amazonaws.com/micontenedor/test-streaming/prueba-1/hls/playlist.m3u8",
      "thumbnail": "https://s3.eu-central-1.amazonaws.com/micontenedor/test-streaming/prueba-1/hls/60x108-00001.png",

    },
    {
      "target": "ANDROID",
      "playlist": "https://s3.eu-central-1.amazonaws.com/micontenedor/test-streaming/prueba-1/mpeg-dash/playlist.mpd",
      "thumbnail": "https://s3.eu-central-1.amazonaws.com/micontenedor/test-streaming/prueba-1/mpeg-dash/60x108-00001.png"
    }
  ]
}
```


# Edición de imágenes

Las funciones de edición de imágenes permiten realizar las siguientes opciones:

- Redimensionar imagen
- Crop de imagen
- Rotar

Todas estas opciones se pueden realizar por separado o en conjunto sobre una misma imagen.

La edición de imágenes no necesita de configuración previa pero sí requiere las funciones de GraphicsMagic.


## Solicitud de edición de imagen
  
Para editar una imagen es necesario especificar un archivo de entrada, las opciones de edición y el archivo de salida.

Para realizar la edicion de una imagen se puede utilizar el REST Api realizando una petición POST a la siguiente URL:

`https://a2server.a2system.net:XXXX/api/v1/srv/multimedia/editImage`

   ó utilizando las funciones internas de la siguiente manera:
  
```js
  var input = { … }; // Imagen de entrada
  var options = { … }; // Opciones de edición
  var output = { … }; // Configuración de salida

  var multimedia = new App.Multimedia();

  multimedia.editImage(input, output, options) 
  .then(res =>{ … })
  .catch(err => { … });

```

### **- Parámetros**

#### **• Parámetros de la solicitud:**

**- Objeto de entrada:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|input|Object||Contiene la información de donde tomar la imagen de entrada|
|input.service|String||Servicio de almacenamiento (valores: local, gcloud, aws)|
|input.container|String||Nombre del Bucket en el servicio.|
|input.path|String||Path al archivo, relativo al bucket.|
  
**- Objeto de salida:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|output|Object||Configuración de salida, dónde ubicar la imagen editada.|
|output.service|String||Servicio de almacenamiento (valores: local, gcloud, aws)|
|output.container|String||Nombre del Bucket en el servicio. Debe existir.|
|output.pathPrefix|String||Prefijo de ruta donde ubicar los archivos de salida. Relativo al bucket.|
|output.public|Boolean||Indica si el archivo de salida debe ser público o no.|
            
**- Opciones de edicion:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|image|Object||Objeto con las modificaciones a realizar sobre la imagen.|
|image.crop|String|X|Tipo de crop que aplicar a la imagen (valores: squared, rounded).|
|image.rotate|Number|X|Rotación a aplicar a la imagen en grados. (Ej. 90, 270, 180).|
|image.resize|Array|X|Array con los tamaños de la imagen a generar. (valores: t, s, m, l, xl)|
|image.force|Boolean|X|True para forzar la redimension a los tamaños indicados, sino como máximo será el tamaño de la imagen original|
      
#### **• Parámetros de la respuesta:**

| Clave | Tipo | Opcional   | Descripción |
|---|---|:---:|---|
|images|Array||Array con la información de las imágenes generadas tras la edición.|
|images.service|String||Servicio de almacenamiento (valores: local, gcloud, aws).|
|images.container|String||Nombre del Bucket en el servicio.|
|images.path|String||Path al archivo, relativo al bucket.|
|images.public|Boolean||Indica si el archivo es público o no.|
|images.url|String||URL de la imagen.|
|images.size|String||Tamaño de la imagen. (valores: t, s, m, l, xl)|
      
### **- Ejemplo: Rotar imagen**

El siguiente ejemplo muestra cómo rotar una imagen.
Para ello se tomará una imagen del almacenamiento local cuyo contenedor es "test-container". La imagen se llama pic.png
Una vez editada la imagen, los archivos generados serán almacenados en el servicio de almacenamiento "gcloud" dentro del contenedor "gcloud-container" en el subpath "modified/". Dicha imagen será pública.

En este caso la imagen será rotada 90 grados en el sentido de las agujas del reloj.

POST: `https://a2server.a2system.net:1234/api/v1/srv/multimedia/editImage`

Body:
```js
{
  "input":{ 
    "service": "local", 
    "container": "test-container", 
    "path": "pic.png"
  },
  "image":{
    "rotate": 90
  },
  "output":{
    "service":"gcloud", 
    "container":"gcloud-container", 
    "pathPrefix": "modified/", 
    "public":true
  }

}
```

Respuesta:
```js
{
  "images": [
    {
      "path": "modified/rotate.png",
      "service": "gcloud",
      "container": "gcloud-container",
      "public": true,
      "url": "https://s3.eu-central-1.amazonaws.com/gcloud-container/modified/rotate.png"
    }
  ]
}
```


### **- Ejemplo: Rotar + Crop de imagen**

El siguiente ejemplo muestra cómo crear el crop de una imagen.
Para ello se tomará una imagen del almacenamiento local cuyo contenedor es "test-container". La imagen se llama pic.png
Una vez editada la imagen, los archivos generados serán almacenados en el servicio de almacenamiento "gcloud" dentro del contenedor "gcloud-container" en el subpath "modified/". Dicha imagen será pública.

En este caso la imagen será rotada 90 grados en el sentido de las agujas del reloj y además se hará crop de la misma.

POST: `https://a2server.a2system.net:1234/api/v1/srv/multimedia/editImage`

Body:
```js
{
  "input":{ 
    "service": "local", 
    "container": "test-container", 
    "path": "pic.png"
  },
  "image":{
    "rotate": 90,
    "crop": "squared"
  },
  "output":{
    "service":"gcloud", 
    "container":"gcloud-container", 
    "pathPrefix": "modified/", 
    "public":true
  }

}
```

Respuesta:
```js
{
  "images": [
    {
      "path": "modified/crop.png",
      "service": "gcloud",
      "container": "gcloud-container",
      "public": true,
      "url": "https://s3.eu-central-1.amazonaws.com/gcloud-container/modified/crop.png"
    }
  ]
}
```