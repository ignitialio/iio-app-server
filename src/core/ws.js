'use strict'

const fs = require('fs')
const path = require('path')

const EventEmitter = require('events').EventEmitter
const IO = require('socket.io')
const SocketStream = require('socket.io-stream')

const utils = require('../utils')
const logger = utils.logger

const Service = require('./service').Service
const Services = require('./service').Services

class WSManager extends EventEmitter {
  constructor(server, config) {
    super()

    if (!config) {
      this.logger.info('Come on, dumber, a small configuration is easy stuff...')
      process.exit()
    }

    // config
    this._config = config

    // logger
    this.logger = logger.child({ origin: 'ws' })

    // WS server
    this._io = IO(server)

    // WS server clients
    this._clients = {}

    // inject WS reference into services
    Service.prototype.$ws = this

    this._io.on('connection', socket => {
      this.logger.info('new client connection', socket.client.conn.remoteAddress)

      // manage file streams through minio/S3
      SocketStream(socket).on('ws:file:upload', (stream, data) => {
        if (data && data.name) {
          let filename = path.basename(data.name)
          try {
            this.$app._minioClient.putObject(data.bucket, data.userId + '/' + filename, stream,
              data.size, (err, etag) => {
                if (err) {
                  socket.emit('ws:file:upload:result', {
                    err: '' + err
                  })
                  this.logger.error(err, 'S3 upload failed')
                } else {
                  data.etag = etag
                  socket.emit('ws:file:upload:result', data)
                }
              })
          } catch (err) {
            this.logger.error(err, 'Minio client failed to put file')
          }
        } else {
          this.logger.warn(data, 'File upload request but empty data')
        }
      })

      // manage file drop through streams
      SocketStream(socket).on('ws:file:drop', (stream, data) => {
        if (data && data.folder && data.name) {
          let filename = path.basename(data.name)
          try {
            if (!utils.fileExists(this._config.server.filesDropPath)) {
              fs.mkdirSync(this._config.server.filesDropPath)
            }

            let folder = path.join(this._config.server.filesDropPath,
              data.folder)
            data.dest = path.join(folder, filename)

            if (!utils.fileExists(folder)) {
              fs.mkdirSync(folder)
            }

            let writeStream = fs.createWriteStream(data.dest)
            stream.pipe(writeStream)

            writeStream.on('end', () => {
              socket.emit('ws:file:drop:result', data)
              // console.log('end writeStream')
            })

            writeStream.on('error', err => {
              socket.emit('ws:file:drop:result', {
                err: '' + err
              })

              this.logger.error(err, 'drop failed')
            })
          } catch (err) {
            this.logger.error(err, 'Failed to drop file')
          }
        } else {
          this.logger.warn(data, 'File drop request but empty data')
        }
      })

      try {
        // ensure root services (modules) work
        socket.on('module:event', event => {
          if (socket.client) {
            // inject source info
            event.source = socket.client.id

            // emits normalized event for any client events
            this.emit('module:event', event)
          }
        })

        // new client registered locally
        this._clients[socket.client.id] = {
          socket: socket,
          $services: {}
        }

        // tells app that a new client is there
        this.emit('client', socket.client.id)

        socket.on('disconnect', async () => {
          try {
            await this._unregisterAll(socket.client.id)
            delete this._clients[socket.client.id].$services
            delete this._clients[socket.client.id]

            this.logger.warn('deleted services for ' + socket.client.id)
          } catch (err) {
            console.error(err)
          }
        })

        // just for debugging client side
        socket.emit('ws', { status: 'ready' })

        setInterval(() => {
          socket.emit('heartbeat')
        }, 3000)
      } catch (err) {
        this.logger.error(err, 'something weird happened')
      }
    })

    this.logger.info('WSManager ready')
  }

  /* IO server */
  get io() {
    return this._io
  }

  /* clients list */
  get clients() {
    return this._clients
  }

  /* add unified service */
  addService(name, service, options, clientId) {
    if (this._clients[clientId]) {
      this._registerService(clientId, service, {
        name: name,
        ...options
      })
    }
  }

  /* get service called serviceName for a given client */
  getService(clientId, serviceName) {
    return this._clients[clientId] ? this._clients[clientId].$services[serviceName] : null
  }

  /* register and instantiates a new service class: not exported */
  _registerService(clientId, ServiceClass, opts) {
    let service = new ServiceClass(this._clients[clientId].socket, opts)
    this._clients[clientId].$services[service.name] = service

    this.logger.info('service [' + service.name + '] registered')
  }

  /* unregister and "uninstantiates" a service class: not exported */
  async _unregisterService(clientId, service) {
    if (typeof service === 'object') {
      service = service.name
    }

    try {
      if (this._clients[clientId].$services[service]._destroy) {
        await this._clients[clientId].$services[service]._destroy()
      }

      delete this._clients[clientId].$services[service]
    } catch (err) {
      this.logger.error(err, 'fail to unregister service [' + service + ']')
    }
  }

  /* unregister all services: not exported */
  _unregisterAll(clientId) {
    return new Promise(async (resolve, reject) => {
      try {
        for (let s in this._clients[clientId].$services) {
          await this._unregisterService(clientId, s)
        }
        resolve()
      } catch (err) {
        this.logger.error(err, 'fail to unregister services')
        reject(err)
      }
    })
  }
}

exports.WSManager = WSManager
