const fs = require('fs')
const path = require('path')

const Module = require('../core/module').Module
const IIOSGateway = require('@ignitial/iio-services').Gateway
const utils = require('../utils')

class Gateway extends Module {
  constructor(options) {
    super({
      name: 'gateway',
      ...options
    })

    this._gateway = new IIOSGateway(options)

    this._gateway._init().then(() => {
      this.logger.info(this._options, 'gateway module ready')
    }).catch(err => {
      this.logger.error(err, 'gateway module initialization failed')
    })
  }

  get gateway() {
    return this._gateway
  }

  waitForService(name, delay) {
    return this.gateway._waitForService(name)
  }

  waitForServiceAPI(name, delay) {
    return this.gateway._waitForServiceAPI(name)
  }

  waitForAuthService() {
    return this.waitForServiceAPI(this.$app.config.auth.service)
  }
}

module.exports = Gateway
