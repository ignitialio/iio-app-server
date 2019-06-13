const IIOAppServer = require('../src').IIOAppServer
const defaultModules = require('../src').defaultModules
const defaultUnified = require('../src').defaultUnified

const config = require('./config')

let app = new IIOAppServer(config)

app.on('client', clientId => {
  for (let unifiedName in defaultUnified) {
    app.ws.addService(unifiedName, defaultUnified[unifiedName],
      config.unified.options[unifiedName], clientId)
  }
})

for (let moduleName in defaultModules) {
  app.instantiateModule(moduleName, defaultModules[moduleName])
}
