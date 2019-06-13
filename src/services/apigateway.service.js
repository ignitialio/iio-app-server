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
      onEvent: this._eventHandler.bind(this)
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

      // fix gateway discrepency when hot reload
      let gateway = this._gateway

      this.$app._rest.get('/services/:service/*filename',
        async (request, content) => {
          try {
            // grab original service info
            let service = gateway.services[request.parameters.service]
            let protocol = service.httpServer.https ? 'https://' : 'http://'

            let url = protocol + service.httpServer.host +
              ':' + service.httpServer.port + '/' +
              request.parameters.filename

            let response = await axios({
              url: url,
              method: 'get',
              responseType: 'document'
            })

            return response.data
          } catch (err) {
            return err
          }
        }) //, { contentType: 'text/html' })

      this.$app._rest.get('/images/:service/*filename', async (request, content) => {
        try {
          // grab original service info
          let service = gateway.services[request.parameters.service]

          let protocol =
            service.options.httpServer.https ? 'https://' : 'http://'

          let url = protocol + service.httpServer.host +
            ':' + service.httpServer.port + '/' +
            request.parameters.filename

          let response = await axios({
            url: url,
            method: 'get',
            responseType: 'stream'
          })

          return response.data
        } catch (err) {
          this.logger.error(err, 'failed to get image file')
          return err
        }
      })

      for (let serviceName in this._gateway._services) {
        this._createBridge(serviceName, this._gateway._services[serviceName])
      }

      this.logger.info({ options: this._options }, 'api gateway created')
    }).catch(err => {
      this.logger.error(err, 'APIGateway initialization failed')
    })
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
      this._bridges[serviceName] = new Service(this._io, serviceInfo)

      // inject creation timestamp property for further checks
      this._bridges[serviceName].$creationTimestamp = serviceInfo.creationTimestamp

      for (let method of serviceInfo.methods) {
        // create method call bridge in a standard way: no additional processing
        this._bridges[serviceName]
          ._addMethod(method, this._gateway.api[serviceName][method])
      }

      // register full service as a gateway bridged object
      this._bridges[serviceName]._register()

      this.logger.info('gateway [%s] registered new service [%s]',
        this.uuid, serviceName)
    } catch (err) {
      this.logger.error(err, 'failed to create bridge for service [%s]',
        serviceName)
    }
  }

  /* handle service specific event */
  _eventHandler(message) {
    // push to web client
    this._io.emit('service:' + message.meta.service +
      ':event:' + message.meta.event, message.payload)
  }

  /* clean up all bridges or selected subset only */
  _cleanUpBridges(subset) {
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
        this._bridges[s]._unregister()
        delete this._bridges[s]

        this.logger.warn('destroy [%s] bridge from gateway [%s]', s, this.uuid)
      }
    }
  }

  /* destructor */
  async _destroy() {
    try {
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
