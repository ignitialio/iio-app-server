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
const morgan = require('morgan')

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

    if (process.env.IIOS_SERVER_ACCESS_LOGS) {
      this._connectApp.use(morgan('combined'))
    }

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

    /* **********************************************************************
    S3 download proxy
    ********************************************************************** */
    let getObject = request => {
      return new Promise((resolve, reject) => {
        this._minioClient.getObject(bucket,
          urlencode.decode(request.parameters.filename),
          (err, readableStream) => {
            if (err) {
              reject(err)
            } else {
              resolve(readableStream)
            }
          })
      })
    }

    this._rest.get('/s3/:filename', async (request, content) => {
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

    /* **********************************************************************
    File upload management
    ********************************************************************** */
    let temporaryFolder = path.join(this._config.server.filesDropPath, 'tmp')
    let maxFileSize = null
    let fileParameterName = 'file'

    try {
      fs.mkdirSync(temporaryFolder)
    } catch (e) {
      this.logger.info('temporary folder [%s] created', temporaryFolder)
    }

    function cleanIdentifier(identifier) {
      return identifier.replace(/[^0-9A-Za-z_-]/g, '')
    }

    function getChunkFilename(chunkNumber, identifier) {
      // Clean up the identifier
      identifier = cleanIdentifier(identifier)

      // What would the file name be?
      return path.resolve(temporaryFolder, './flow-' + identifier +
        '.' + chunkNumber)
    }

    function validateRequest(chunkNumber, chunkSize, totalSize, identifier,
      filename, fileSize) {
      // Clean up the identifier
      identifier = cleanIdentifier(identifier)

      // Check if the request is sane
      if (chunkNumber === 0 || chunkSize === 0 || totalSize === 0 ||
        identifier.length === 0 || filename.length === 0) {
        return 'non_flow_request'
      }

      var numberOfChunks = Math.max(Math.floor(totalSize / (chunkSize * 1.0)), 1)
      if (chunkNumber > numberOfChunks) {
        return 'invalid_flow_request1'
      }

      // Is the file too big?
      if (maxFileSize && totalSize > maxFileSize) {
        return 'invalid_flow_request2'
      }

      if (typeof (fileSize) !== 'undefined') {
        if (chunkNumber < numberOfChunks && fileSize !== chunkSize) {
          // The chunk in the POST request isn't the correct size
          return 'invalid_flow_request3'
        }

        if (numberOfChunks > 1 && chunkNumber === numberOfChunks &&
          fileSize !== ((totalSize % chunkSize) + parseInt(chunkSize))) {
          // The chunks in the POST is the last one, and the fil is not the correct size
          return 'invalid_flow_request4'
        }

        if (numberOfChunks === 1 && fileSize !== totalSize) {
          // The file is only a single chunk, and the data size does not fit
          return 'invalid_flow_request5'
        }
      }

      return 'valid'
    }

    this._rest.get('/upload', (request, content) => {
      var chunkNumber = request.params.flowChunkNumber || 0
      var chunkSize = request.params.flowChunkSize || 0
      var totalSize = request.params.flowTotalSize || 0
      var identifier = request.params.flowIdentifier || ''
      var filename = request.params.flowFilename || ''

      if (validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename) === 'valid') {
        var chunkFilename = getChunkFilename(chunkNumber, identifier)
        let exists = fs.existsSync(chunkFilename)

        if (exists) {
          this.logger.info('file found', chunkFilename, filename, identifier)

          return { result: 'found', options: { statusCode: 200 } }
        } else {
          this.logger.info('chunk [%s] not found for file [%s]', chunkFilename, filename)
          return { result: 'not found', options: { statusCode: 204 } }
        }
      } else {
        this.logger.info('file [%s] not found: validation failed', filename)
        return { result: 'not found', options: { statusCode: 204 } }
      }
    })

    this._rest.post('/upload', (request, content) => {
      let uploadedFile
      if (request.files.file) {
        uploadedFile = request.files.file
      }

      if (!utils.fileExists(this._config.server.filesDropPath)) {
        fs.mkdirSync(this._config.server.filesDropPath)
      }

      var fields = request.body
      var files = request.files

      var chunkNumber = fields['flowChunkNumber']
      var chunkSize = fields['flowChunkSize']
      var totalSize = fields['flowTotalSize']
      var identifier = cleanIdentifier(fields['flowIdentifier'])
      var filename = fields['flowFilename']

      if (!files[fileParameterName] || !files[fileParameterName].size) {
        this.logger.error('invalid flow request', fileParameterName)
        return { result: 'not found', options: { statusCode: 204 } }
      }

      var originalFilename = files[fileParameterName]['originalFilename']
      var validation = validateRequest(chunkNumber, chunkSize, totalSize,
        identifier, filename, files[fileParameterName].size)

      if (validation === 'valid') {
        var chunkFilename = getChunkFilename(chunkNumber, identifier)

        // Save the chunk (TODO: OVERWRITE)
        fs.renameSync(files[fileParameterName].path, chunkFilename)

        // Do we have all the chunks?
        var currentTestChunk = 1
        var numberOfChunks = Math.max(Math.floor(totalSize / (chunkSize * 1.0)), 1)

        var testChunkExists = () => {
          try {
            let exists = fs.existsSync(getChunkFilename(currentTestChunk, identifier))

            if (exists) {
              currentTestChunk++
              if (currentTestChunk > numberOfChunks) {
                this.logger.info('file [%s] (original = [%s]) uploaded with id [%s]',
                  filename, originalFilename, identifier)

                fs.copyFileSync(uploadedFile.path,
                  path.join(this._config.server.filesDropPath, uploadedFile.name))
                fs.unlinkSync(uploadedFile.path)

                return {
                  result: path.join(this._config.server.filesDropPath, uploadedFile.name),
                  options: { statusCode: 200 }
                }
              } else {
                // Recursion
                return testChunkExists()
              }
            } else {
              this.logger.info('file [%s] (original = [%s]) partially uploaded with id [%s]',
                filename, originalFilename, identifier)

              fs.copyFileSync(uploadedFile.path,
                path.join(this._config.server.filesDropPath, uploadedFile.name))
              fs.unlinkSync(uploadedFile.path)

              return {
                result: path.join(this._config.server.filesDropPath, uploadedFile.name),
                options: { statusCode: 200 }
              }
            }
          } catch (err) {
            return new Error('failed to update chunks')
          }
        }

        return testChunkExists()
      } else {
        this.logger.info('file [%s] (original = [%s], id = [%s]) validation failed',
          filename, originalFilename, identifier)

        fs.copyFileSync(uploadedFile.path,
          path.join(this._config.server.filesDropPath, uploadedFile.name))
        fs.unlinkSync(uploadedFile.path)

        return {
          result: path.join(this._config.server.filesDropPath, uploadedFile.name),
          options: { statusCode: 200 }
        }
      }
    })

    this._rest.post('/s3upload', async (request, content) => {
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

    /* **********************************************************************
    ENDOF File management
    ********************************************************************** */

    // Health API endpoint
    this._rest.get('/healthcheck', async (request, content) => {
      let info = await this.$utils.appInfo()
      
      return {
        name: info.name,
        version: info.version,
        hostname: os.hostname(),
        cpus: os.cpus(),
        loadavg: os.loadavg()
      }
    })

    // register data collections
    this._waitForModule('gateway').then(gateway => {
      gateway.gateway._waitForServiceAPI(this._config.data.service)
        .then(async dataService => {
          for (let collection of this._config.data.collections) {
            try {
              await dataService.addDatum(collection.name, collection.options, {
                $privileged: true,
                $userId: null
              })
            } catch (err) {
              if (!('' + err).match('datum already defined')) {
                this.logger.error(err, 'failed to add datum')
              }
            }
          }
        }).catch(err => {
          this.logger.error(err, 'failed to add datum')
        })
    }).catch(err => {
      this.logger.error(err, 'failed to add datum')
    })

    // start web server
    this._server.listen(this._config.server.port, err => {
      if (err) {
        throw new Error('' + err)
      }

      try {
        let packageDef = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
        let version = packageDef.version
        let name = packageDef.name

        console.log('--------------------------------------------------------------------------------')
        console.log('IIOS app [' + name + ':' + version + '] ready and serves path [' +
          path2serve + '] on port [' + this._config.server.port + ']')
        console.log('--------------------------------------------------------------------------------')
      } catch (err) {
        this.logger.error(err, 'failed to start when reading the package info')
        process.exit(1)
      }
    })

    // all done
    this.logger.info('Application manager created')
  }

  get config() {
    return this._config
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

  /* wait for module to be available */
  _waitForModule(name, timeout = 5000) {
    return new Promise((resolve, reject) => {
      var checkTimeout

      var checkInterval = setInterval(() => {
        if (this['$' + name]) {
          clearInterval(checkInterval)

          if (checkTimeout) {
            clearTimeout(checkTimeout)
          }

          resolve(this['$' + name])
        }
      }, 100)

      checkTimeout = setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval)

          reject(new Error('timeout: service ' + name + ' is not available'))
        }
      }, timeout)
    })
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
      this._waitForModule('gateway').then(gateway => {
        gateway.gateway._waitForServiceAPI('auth')
          .then(async auth => {
            resolve(await auth.authorize(token))
          }).catch(err => { reject(err) })
      }).catch(err => { reject(err) })
    })
  }
}

exports.IIOAppServer = IIOAppServer
