const path = require('path')
const fs = require('fs')
const os = require('os')
const EventEmitter = require('events').EventEmitter
const Minio = require('minio')
const urlencode = require('urlencode')
const _ = require('lodash')

const serveStatic = require('serve-static')
const connect = require('connect')
const bodyParser = require('body-parser')
const Rest = require('connect-rest')
const multipart = require('connect-multiparty')
const http = require('http')
const cors = require('cors')

const WSManager = require('./ws').WSManager
const Service = require('./service').Service
const Module = require('./module').Module

const utils = require('../utils')
const logger = utils.logger

class IIOAppServer extends EventEmitter {
  constructor(options) {
    super()

    this._config = options

    // listeners
    this._listeners = {
      onKillSignal: this._killingMeSoftly.bind(this)
    }

    // manage destroy
    // catch signals for clean shutdown
    // => must catch signal to clean up connector/discovery
    process.on('SIGINT', this._listeners.onKillSignal)
    process.on('SIGTERM', this._listeners.onKillSignal)

    // path to server statically
    let path2serve = path.join(process.cwd(), this._config.server.path)

    // logger
    this.logger = logger.child({ origin: 'core' })

    this._connectApp = connect()

    if (this._config.server.corsEnabled) {
      this._connectApp.use(cors)
    }

    this._connectApp.use(bodyParser.urlencoded({ extended: true }))
      .use(bodyParser.json())
      .use(multipart())
      .use(serveStatic(path2serve, { 'index': [ 'index.html' ] }))

    this._rest = Rest.create({
      context: '/api',
      logger: { level: this._config.rest.logLevel || 'error' }
    })

    // adds connect-rest middleware to connect
    this._connectApp.use(this._rest.processRequest())

    // HTTP server
    this._server = new http.Server(this._connectApp)

    // inject app instance to any core object
    Service.prototype.$app = this
    WSManager.prototype.$app = this

    // Current Working Directory from app configuration
    this._cwd = path.join(process.cwd(), this._config.server.path)

    // managers
    this.ws = new WSManager(this._server, this._config)
    this.ws.on('client', clientId => this.emit('client', clientId))

    // modules that provide root services
    this._modules = {}

    // manage file uploads
    this._minioClient = new Minio.Client(this._config.store.minio)

    let bucket = this._config.store.bucket.name
    let region = this._config.store.bucket.region

    // not to be used with S3 due to endpoint creation delays
    this._minioClient.bucketExists(bucket, (err, exists) => {
      if (!err && !exists) {
        this.logger.warn('Bucket ' + bucket + ' does not exist')

        this._minioClient.makeBucket(bucket, region, errOnMake => {
          if (errOnMake) {
            this.logger.error(errOnMake, 'Bucket ' + bucket + ' cannot be created')
          } else {
            this.logger.info('Bucket [%s] has been created', bucket)
          }
        })
      } else if (err) {
        this.logger.error(err, 'Error when connecting to S3/Minio')
        process.exit(1)
      }
    })

    // REST service for uploaded files
    let getObject = request => {
      return new Promise((resolve, reject) => {
        this._minioClient.getObject(bucket,
          urlencode.decode(request.parameters.userid + '/' + request.parameters.filename),
          (err, readableStream) => {
            if (err) {
              reject(err)
            } else {
              resolve(readableStream)
            }
          })
      })
    }

    this._rest.get('/uploads/:userid/:filename', async (request, content) => {
      let stream = null
      try {
        await this._checkRESTAccess(request.parameters.token)
        stream = await getObject(request)
      } catch (err) {
        stream = err
        this.logger.error(err, 'failed getting file', request.parameters)
      }

      return stream
    })

    this._rest.post('/upload', async (request, content) => {
      return 'ok'
    })

    this._rest.get('/test', (request, content) => {
      console.log('OLE TEST')
      return 'ok'
    })

    this._rest.post('/dropfiles', async (request, content) => {
      try {
        if (request.files) {
          if (!utils.fileExists(this._config.server.filesDropPath)) {
            fs.mkdirSync(this._config.server.filesDropPath)
          }

          let files = Object.values(request.files)
          if (!Array.isArray(files)) {
            files = [ files ]
          }

          for (let f of files) {
            let filename = path.basename(f.name)
            try {
              let dest = path.join(this._config.server.filesDropPath, filename)

              let readStream = fs.createReadStream(f.path)
              let writeStream = fs.createWriteStream(dest)
              readStream.pipe(writeStream)

              /* writeStream.on('end', () => {
                // console.log('---> end writeStream')
              }) */

              writeStream.on('error', err => {
                this.logger.error(err, 'drop failed')
              })
            } catch (err) {
              this.logger.error(err, 'Failed to drop file')
            }
          }
          // console.log('RRR---', files)
          return files
        } else {
          this.logger.warn(request.files, 'File drop request but empty data')

          return 'empty'
        }
      } catch (err) {
        return 'ko'
      }
    })

    // Health API endpoint
    this._rest.get('/healthcheck', async (request, content) => {
      let healthInfo = await this.$utils.info()
      healthInfo.hostname = os.hostname()
      healthInfo.cpus = os.cpus()
      healthInfo.loadavg = os.loadavg()
      return healthInfo
    })

    // start web server
    this._server.listen(this._config.server.port, err => {
      if (err) {
        throw new Error('' + err)
      }

      console.log('-----------------------------\nSuperstatically ready for [' +
        path2serve + '] on port [' +
        this._config.server.port + ']\n-----------------------------')
    })

    // all done
    this.logger.info('Application manager created')
  }

  /* instantiate module dynamically using */
  instantiateModule(name, ModClass, options) {
    if (typeof ModClass === 'object') {
      options = _.cloneDeep(ModClass)
      ModClass = Module
    } else if (ModClass === undefined) {
      ModClass = Module
    }

    options = options || {}

    if (this['$' + name]) {
      throw new Error('Module name conflict for ' + name)
    }

    // inject app reference to module
    ModClass.prototype.$app = this

    // create module instance and pass configuration
    this._config.modules[name] = this._config.modules[name] || options
    this._config.modules[name].name = name
    this['$' + name] = new ModClass(this._config.modules[name])

    // call init function if any (!= _init, that could be private like in services Gateway)
    if (typeof this['$' + name]._initModule === 'function') {
      this['$' + name]._initModule()
    }

    // is root service and needs to be added to the root services list
    if (typeof this['$' + name]._register === 'function' && ModClass.name !== 'Module') {
      this['$' + name]._register()
    }

    this.logger.info('[' + name + '] module loaded')

    return this['$' + name]
  }

  /* ------------------------------------------------------------------------
     called on catching SIGTERM/SIGINT signal
     ------------------------------------------------------------------------ */
  _killingMeSoftly() {
    this.logger.info('SIGINT/SIGTERM received...')
    for (let module in this._modules) {
      this['$' + module]._destroy()
    }
  }

  /* check REST access rights */
  _checkRESTAccess(token) {
    return new Promise((resolve, reject) => {
      this.$data.users.checkToken({ token: token })
        .then(() => resolve())
        .catch(err => reject(err))
    })
  }
}

exports.IIOAppServer = IIOAppServer
