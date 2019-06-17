const _ = require('lodash')
const EventEmitter = require('events').EventEmitter

const utils = require('../utils')
const uuid = utils.uuid
const logger = utils.logger
const getAllMethods = utils.getAllMethods

/* Unified service base class */
class Service extends EventEmitter {
  constructor(io, options) {
    super()

    try {
      this._options = options || {}

      // reference to the client WS
      this._io = io

      // service name
      this._name = this._options.name || Math.random().toString(36).slice(2)

      // service public methods
      this._methods = []

      // sets an unique id for the service
      this.uuid = uuid()

      // logs
      this.logger = logger.child({ origin: this._name })

      // detect methods to be exposed as per design rules
      this._detectMethods()
    } catch (err) {
      this.logger.error(err, 'Falied to build service. Exiting...', this._name)
      process.exit(1)
    }

    this.logger.info('[' + this._name + '] has been defined with uuid= ' + this.uuid)
  }

  get name() {
    return this._name
  }

  /* registers public method */
  _addMethod(name, fct) {
    this._methods.push(name)
    this[name] = fct
  }

  /* detects public methods as per the naming rules */
  _detectMethods() {
    let properties = getAllMethods(this)

    for (let p of properties) {
      this._methods.push(p)
    }
  }

  /* register service logic for methods remote call through WS socket */
  _register() {
    this.logger.info('[%s] methods registration [%s] with public options [%s]',
      this.name, this._methods, this._options.options)

    // on service method request
    this._io.on('service:' + this._name + ':request', async data => {
      try {
        let topic = 'service:' + this._name + ':' + data.method + ':' + data.token

        // prohibited methods:
        // _ -> internal/private
        // $ -> injected
        if (data.method[0] === '_' && data.method[0] === '$') {
          this._io.emit(topic, {
            err: 'private method call not allowed'
          })

          this.logger.warn('private method [%s] call not allowed for service [%s]', data.method,
            this._name)

          return
        }

        // 2018/08/15: detokenize userID
        let decoded
        try {
          // decoded = await this.$app.$data.users.checkToken({ token: data.jwt })
        } catch (err) {
          this.logger.warn('data service method ' + data.method + ' token check failed: ' + err)
        }
        
        decoded = decoded || { login: { username: null }}

        this.logger.info('[%s]-> request [%s] - instance: [%s], user: [%s]',
          this._name, data.method, this.uuid, decoded._id)

        if (this[data.method]) {
          data.args = data.args || []
          // injects userid for authorization check as per user's roles
          data.args.push({ $userId: decoded.login.username || null })

          this[data.method].apply(this, data.args).then(response => {
            this.logger.info('[%s]-> response [%s] - user [%s]',
              this._name, topic, decoded._id)

            this._io.emit(topic, response)
          }).catch(err => {
            this._io.emit(topic, { err: err + '' })
          })
        } else {
          this._io.emit(topic, {
            err: 'Method [' + data.method + '] is not available for service [%s]' + this._name
          })
        }
      } catch (err) {
        this.logger.error(err, 'failed to call method [%s] for service [%s]', data.method, this._name)
      } // try/catch
    })

    // tells client that service is up
    this._io.emit('service:up', {
      name: this._name,
      methods: this._methods,
      options: this._options.options
    })
  }

  /* unregister service and inform client that service is down */
  _unregister() {
    this.logger.info('[%s] unregistration', this.name)

    try {
      this._io.removeAllListeners('service:' + this._name + ':request')

      // clean up service before down (/= destroy)
      if (typeof this._clean === 'function') {
        this._clean()
      }

      // tells client that service is down
      this._io.emit('service:down', {
        name: this._name
      })
    } catch (err) {
      this.logger.error(err, 'failed to unregister', this._name)
    }
  }

  /*
    - called when need to destroy service in a clean way
    - implement _clean if you want specific clean up
  */
  _destroy() {
    this._unregister()
  }
}

exports.Service = Service
