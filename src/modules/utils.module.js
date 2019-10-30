const fs = require('fs')
const path = require('path')

const Module = require('../core/module').Module

class Utils extends Module {
  /* provide modules list to remote (only root sevices remotely available) */
  modules() {
    return new Promise((resolve, reject) => {
      resolve({
        list: this.$app._modules
      })
    })
  }

  /* provide app info */
  appInfo() {
    return new Promise((resolve, reject) => {
      if (!this.packageJson) {
        let filepath = path.join(process.cwd(), 'package.json')
        fs.readFile(filepath, 'utf8', (err, result) => {
          if (err) {
            reject(err)
          } else {
            this.packageJson = JSON.parse(result)
            resolve(this.packageJson)
          }
        })
      } else {
        resolve(this.packageJson)
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
