const fs = require('fs')
const pino = require('pino')

exports.getAllMethods = require('@ignitial/iio-services').utils.getMethods

exports.fileExists = function(filepath) {
  try {
    fs.accessSync(filepath)
    return true
  } catch (err) {
    return false
  }
}

exports.logger = pino({
  name: 'iio-app',
  safe: true,
  level: process.env.IIOS_DEBUG_LEVEL || 'warn',
  prettyPrint: { colorized: true }
})

exports.uuid = () => {
  return Math.random().toString(36).slice(2)
}

/* wait for obj property to be defined */
exports.waitForPropertyInit = (obj, name, delay = 5000) => {
  return new Promise((resolve, reject) => {
    let checkTimeout

    let checkInterval = setInterval(() => {
      if (obj[name]) {
        clearInterval(checkInterval)
        clearTimeout(checkTimeout) // nothing if undefined

        resolve(obj[name])
      }
    }, 100)

    checkTimeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        reject(new Error('timeout: [' + name + '] property is not available'))
      }
    }, delay)
  })
}

/* wait for obj property to be set to a specific value */
exports.waitForPropertySet = (name, value, delay = 5000) => {
  return new Promise((resolve, reject) => {
    var checkTimeout

    var checkInterval = setInterval(() => {
      if (this[name] === value) {
        clearInterval(checkInterval)
        clearTimeout(checkTimeout) // nothing if undefined

        resolve(this[name])
      }
    }, 100)

    checkTimeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        reject(new Error('timeout: property [' + name +
        '] has not been set to requested value'))
      }
    }, delay)
  })
}
