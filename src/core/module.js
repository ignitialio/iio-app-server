const _ = require('lodash')

const utils = require('../utils')
const logger = utils.logger
const getAllMethods = utils.getAllMethods

class Module {
  constructor(options) {
    this._options = options || {}

    // name for future generic implementation
    this._name = this._options.name || Math.random().toString(36).slice(2)

    // logging
    this.logger = logger.child({ origin: this._name })

    // methods bridge list
    this._methods = []

    this.logger.info('Module [%s] initialized', this._name)
  }

  _register() {
    if (this.$app._modules[this._name]) {
      this.logger.warn(this._name + ' service already registered')
      return
    }

    // WS service way
    // which are the available methods
    this._methods = getAllMethods(this)

    this.$app.ws.on('module:event', async event => {
      let re = new RegExp('module:' + this._name + ':request')
      if (!!event.topic.match(re)) {
        let topic = 'module:' + this._name + ':' + event.method +
          ':' + event.token

        // prohibited methods:
        // _ -> internal/private
        // $ -> injected
        if (event.method[0] === '_' && event.method[0] === '$') {
          this.$app.ws.clients[event.source].socket.emit(topic, {
            err: 'private method call not allowed'
          })

          this.logger.warn('private method [%s] call not allowed for module [%s]', event.method,
            this._name)

          return
        }

        if (!_.includes(this._methods, event.method)) {
          this.$app.ws.clients[event.source].socket
            .emit(topic, { err: 'method does not exist' })

          this.logger.error(this._name + ' service method ' +
            event.method + ' is private or does not belong to module')
        }

        let userId
        try {
          let authService = await this.$app.$gateway.waitForAuthService()

          userId = await authService.authorize(event.jwt)
        } catch (err) {
          this.logger.warn(err, 'module [%s] method [%s] token check failed',
            this._name, event.method)
        }

        event.args = event.args || []
        // injects userid for second authorization check as per user's roles
        // -> module can check grants as per its specific needs
        event.args.push({ $userId: userId || null })

        this[event.method].apply(this, event.args)
          .then(response => {
            this.logger.info('[%s] -> response [%s] - user [%s]',
              this._name, topic, userId)

            this.$app.ws.clients[event.source].socket
              .emit(topic, response)
          }).catch(err => {
            this.$app.ws.clients[event.source].socket.emit(topic, { err: err + '' })

            this.logger.error(err, this._name + ' service method ' +
              event.method + ' call failed')
          })
      }
    })

    // service discovery: add info to _modules table that can be obtained
    // from client side
    this.$app._modules[this._name] = {
      name: this._name,
      methods: this._methods,
      subs: null // no sub-services
    }

    this.$app.ws.io.emit('module:up', this.$app._modules[this._name])
  }

  _destroy() {
    this.logger.info('module [' + this._name + ' will be destroyed')
  }
}

exports.Module = Module
