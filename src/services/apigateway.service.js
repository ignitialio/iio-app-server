const axios = require('axios')

const Service = require('../core/service').Service
const Gateway = require('@ignitial/iio-services').Gateway

class APIGateway extends Service {
  constructor(io, options) {
    super(io, {
      name: 'apigateway',
      ...options
    })

    // maps dynamic service on dynamic methods for each service available through
    // gateway
    this._bridges = {}

    // listeners
    this._listeners = {
      onServiceRegistered: this._createBridge.bind(this),
      onServiceUnregistered: this._cleanUpBridges.bind(this),
      onEvent: this._eventHandler.bind(this),
      onFileProxyRequest: this._fileProxyHandler.bind(this)
    }

    // maintains services info trough IIOS gateway
    this._gateway = new Gateway(this._options)

    this._gateway._init().then(() => {
      // service up
      this._gateway.on('service:registered', this._listeners.onServiceRegistered)

      // service deletion: one by one
      this._gateway.on('service:unregistered', this._listeners.onServiceUnregistered)

      // manage service specific publications
      this._gateway.on('iios:event', this._listeners.onEvent)

      // heartbeats...
      this._gateway._subscribeHeartBeat()

      this._gateway.on('heartbeat', message => {
        this._io.emit('service:heartbeat:event', message)
      })

      // provide file proxy for services
      this._io.on('service:proxy', this._listeners.onFileProxyRequest)

      for (let serviceName in this._gateway._services) {
        this._createBridge(serviceName, this._gateway._services[serviceName])
      }

      this.logger.info(this._options, 'api gateway created')
    }).catch(err => {
      this.logger.error(err, 'APIGateway initialization failed')
    })
  }

  // file proxy for services
  async _fileProxyHandler(serviceName, fileName, token) {
    let url
    try {
      // grab original service info
      let service = await this._gateway._waitForService(serviceName)

      let protocol = service.httpServer.https ? 'https://' : 'http://'

      url = protocol + service.httpServer.host +
        ':' + service.httpServer.port + '/' + fileName

      let response = await axios({
        url: url,
        method: 'get',
        responseType: 'arraybuffer'
      })

      this._io.emit('service:proxy:' + token, response.data)
    } catch (err) {
      this._io.emit('service:proxy:' + token, { err: 'failed to fetch file' })
      this.logger.warn('failed to fetch file at url %s', url)
      this.logger.info(err, 'failed to fetch file at url %s', url)
    }
  }

  // creates bridge for given service
  async _createBridge(serviceName, serviceInfo) {
    try {
      // avoid duplication
      if (this._bridges[serviceName] &&
        this._bridges[serviceName].$creationTimestamp >= serviceInfo.creationTimestamp) {
        this.logger.warn('avoided duplicate registration for service [%s]', serviceName)
        return
      } else if (this._bridges[serviceName]) {
        this.logger.warn('duplicate service [%s] will be overwritten', serviceName)
        this._cleanUpBridges(serviceName)
      }

      // check API
      await this._gateway._waitForServiceAPI(serviceName)

      // ...when done, creates new unified service bridge
      let isRemote = true
      this._bridges[serviceName] = new Service(this._io, serviceInfo, isRemote)
      // IIOS gateway injection in each servic for inter-services calls
      this._bridges[serviceName].$gateway = this._gateway

      // inject creation timestamp property for further checks
      this._bridges[serviceName].$creationTimestamp = serviceInfo.creationTimestamp

      for (let method of serviceInfo.methods) {
        // create method call bridge in a standard way: no additional processing
        this._bridges[serviceName]
          ._addMethod(method, this._gateway.api[serviceName][method])
      }

      // register full service as a gateway bridged object
      this._bridges[serviceName]._register()

      this.logger.info('api gateway service [%s] registered new service [%s] with service gateway [%s]',
        this.uuid, serviceName, this._gateway.uuid)
    } catch (err) {
      this.logger.error(err, 'failed to create bridge for service [%s]',
        serviceName)
    }
  }

  /* handle service specific event */
  _eventHandler(message) {
    // push to web client
    this._io.emit('service:event:' + message.meta.event, message.payload)
    this._io.emit('_bson:service:event:' + message.meta.event,
      this._gateway._connector.encoder.pack(message.payload))
  }

  /* clean up all bridges or selected subset only */
  _cleanUpBridges(subset) {
    // if one specific service name provided make it array
    if (subset && typeof subset === 'string') {
      subset = [ subset ]
    }

    // destroy and unregister each single bridged service
    for (let s in this._bridges) {
      if (subset) {
        if (subset.indexOf(s) !== -1) {
          this._bridges[s]._destroy()
          delete this._bridges[s]

          this.logger.warn('destroy [%s] bridge from gateway [%s]', s, this.uuid)
        }
      } else {
        // remove all the services since no subset provided
        this._bridges[s]._unregister()
        delete this._bridges[s]

        this.logger.warn('destroy [%s] bridge from gateway [%s]', s, this.uuid)
      }
    }
  }

  /* destructor */
  async _destroy() {
    try {
      this._io.off('service:proxy', this._listeners.onFileProxyRequest)

      this._gateway._unsubscribeHeartBeat()
      this._cleanUpBridges()

      await this._gateway._destroy()
      delete this._gateway
      this.logger.warn('IIOS gateway [%s] destroyed', this.uuid)
    } catch (err) {
      this.logger.error('failed to destroy api gateway with error', err)
    }
  }
}

module.exports = APIGateway
