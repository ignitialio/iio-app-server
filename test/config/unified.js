const redisCfg = require('./redis')

module.exports = {
  settings: {
    rpcTimeout: 10000,
    _unified: true
  },
  options: {
    apigateway: {
      namespace: process.env.IIOS_NAMESPACE || 'ignitialio',
      /* calling timeout for pub/sub mode */
      timeout: 5000,
      connector: {
        redis: {
          encoder: 'bson',
          sentinels: redisCfg.REDIS_SENTINELS,
          host: redisCfg.REDIS_HOST,
          port: redisCfg.REDIS_PORT,
          db: redisCfg.REDIS_DB
        }
      }
    },
    myunified: {
      someConfiguration: 'that\'s all folks !'
    }
  }
}
