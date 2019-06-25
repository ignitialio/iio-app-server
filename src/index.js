const path = require('path')
const fs = require('fs')

exports.IIOAppServer = require('./core/appserver').IIOAppServer

exports.defaultModules = {
  gateway: require('./modules/gateway.module'),
  utils: require('./modules/utils.module'),
  emailer: require('./modules/emailer.module')
}

let defaultUnified = {}

let defaultUnifiedPath = path.join(__dirname, 'services')
let defaultUnifiedSrc = fs.readdirSync(defaultUnifiedPath)

for (let f of defaultUnifiedSrc) {
  if (f.match('.service.js')) {
    let basename = path.basename(f, '.service.js')
    let Service = require(path.join(defaultUnifiedPath, f))
    defaultUnified[basename] = Service
  }
}

exports.defaultUnified = defaultUnified

exports.Module = require('./core/module').Module
exports.Service = require('./core/service').Service
