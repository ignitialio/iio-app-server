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
    this._bridgedMethods = []

    // creates bridged methods
    // REST service way
    this.$app._rest.get('/modules/' + this._name + '/:method',
      async (request, content, callback) => {
        try {
          let result = await this[request.parameters.method]()
          return callback(null, result)
        } catch (err) {
          return callback(err, 'error')
        }
      })

    this.logger.info('Module [%s] initialized', this._name)
  }

  _register() {
    if (this.$app.rootServices[this._name]) {
      this.logger.warn(this._name + ' service already registered')
      return
    }

    // WS service way
    // which are the available methods
    this._bridgedMethods = getAllMethods(this)

    this.$app.ws.on('module:event', async event => {
      let re = new RegExp('module:' + this._name + ':request')
      if (!!event.topic.match(re)) {
        let topic = 'module:' + this._name + ':' + event.method +
          ':' + event.token

        if (!_.includes(this._bridgedMethods, event.method)) {
          this.$app.ws.clients[event.source].socket
            .emit(topic, { err: 'method does not exist' })

          this.logger.error(this._name + ' service method ' +
            event.method + ' is private or does not belong to module')
        }

        // injects userid for authorization check as per user's roles
        // injects logged info
        let loggedUser = this.$app.ws.clients[event.source].socket._logged

        // injects userid for authorization check as per user's roles and call
        // service method
        // 2018/08/15: detokenize userID
        let decoded = {}
        try {
          decoded = await this.$app.$data.users.checkToken({ token: event.userId })
          decoded = decoded || {}
        } catch (err) {
          this.logger.warn(this._name + ' service method ' + event.method + ' token check failed: ' + err)
        }

        this[event.method](event.args, decoded._id, loggedUser)
          .then(result => {
            this.logger.info('[%s] -> response [%s] - user [%s]',
              this._name, topic, decoded._id)

            this.$app.ws.clients[event.source].socket
              .emit(topic, { result: result })
          }).catch(err => {
            this.$app.ws.clients[event.source].socket.emit(topic, { err: err + '' })

            this.logger.error(err, this._name + ' service method ' +
              event.method + ' call failed')
          })
      }
    })

    // service discovery: add info to rootService table that can be obtained
    // from client side
    this.$app.rootServices[this._name] = {
      name: this._name,
      methods: this._bridgedMethods,
      subs: null // no sub-services
    }

    this.$app.ws.io.emit('module:up', this.$app.rootServices[this._name])
  }
}

exports.Module = Module
