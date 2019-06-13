const fs = require('fs')
const path = require('path')

const Module = require('../core/module').Module

class Utils extends Module {
  /* provide modules list to remote (only root sevices remotely available) */
  modules() {
    return new Promise((resolve, reject) => {
      resolve({
        list: this.$app.rootServices
      })
    })
  }

  /* provide app info */
  info() {
    return new Promise((resolve, reject) => {
      if (!this.appInfo) {
        let filepath = path.join(process.cwd(), 'package.json')
        fs.readFile(filepath, 'utf8', (err, result) => {
          if (err) {
            reject(err)
          } else {
            this.appInfo = {
              name: JSON.parse(result).name,
              version: JSON.parse(result).version
            }
            resolve(this.appInfo)
          }
        })
      } else {
        resolve(this.appInfo)
      }
    })
  }

  /* provide REST API keys */
  restAPIKeys() {
    return new Promise((resolve, reject) => {
      resolve({ keys: this.$app._config.rest.apiKeys })
    })
  }
}

module.exports = Utils
