const _ = require('lodash')

const Service = require('../core/service').Service

class Config extends Service {
  constructor(io, options) {
    super(io, {
      name: 'config',
      ...options
    })

    this._register()
  }

  get() {
    // filter helper: provies only elements with _unified attribute set to true
    function check(o) {
      let cpy = {}
      if (o._unified) {
        cpy = o
      } else {
        for (let e in o) {
          if (o[e] && o[e]._unified) {
            cpy[e] = o[e]
          } else if (typeof o[e] === 'object') {
            let sub = check(o[e])
            if (sub) {
              cpy[e] = sub
            }
          }
        }
      }

      return !_.isEmpty(cpy) ? cpy : undefined
    }

    return new Promise((resolve, reject) => {
      let orig = this.$app._config
      if (orig) {
        try {
          let config = check(orig)
          resolve(config)
        } catch (err) {
          reject(err)
        }
      } else {
        reject(new Error('configuration is missing'))
      }
    })
  }

  modules() {
    return new Promise((resolve, reject) => {
      resolve({
        list: this.$app.rootServices
      })
    })
  }
}

module.exports = Config
