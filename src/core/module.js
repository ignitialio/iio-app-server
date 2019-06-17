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

        let topic = 'module:' + this._name + ':' + event.method +
          ':' + event.token

        if (!_.includes(this._methods, event.method)) {
          this.$app.ws.clients[event.source].socket
            .emit(topic, { err: 'method does not exist' })

          this.logger.error(this._name + ' service method ' +
            event.method + ' is private or does not belong to module')
        }

        // injects userid for authorization check as per user's roles and call
        // service method
        // 2018/08/15: detokenize userID
        let decoded
        try {
          // decoded = await this.$app.$data.users.checkToken({ token: event.jwt })
        } catch (err) {
          this.logger.warn(this._name + ' service method ' + event.method + ' token check failed: ' + err)
        }

        decoded = decoded || { login: { username: null }}

        event.args = event.args || []
        // injects userid for authorization check as per user's roles
        event.args.push({ $userId: decoded.login.username || null })

        this[event.method].apply(this, event.args)
          .then(response => {
            this.logger.info('[%s] -> response [%s] - user [%s]',
              this._name, topic, decoded._id)

            this.$app.ws.clients[event.source].socket
              .emit(topic, response)
          }).catch(err => {
            this.$app.ws.clients[event.source].socket.emit(topic, { err: err + '' })

            this.logger.error(err, this._name + ' service method ' +
              event.method + ' call failed')
          })
      }
    })

    // service discovery: add info to rootService table that can be obtained
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
