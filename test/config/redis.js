exports.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
exports.REDIS_PORT = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
exports.REDIS_DB = process.env.REDIS_DB || 0

let redis_sentinels

if (process.env.REDIS_SENTINELS) {
  redis_sentinels = []
  let sentinels = process.env.REDIS_SENTINELS.split(',')
  for (let s of sentinels) {
    redis_sentinels.push({ host: s.split(':')[0], port: s.split(':')[1] })
  }
}

exports.REDIS_SENTINELS = redis_sentinels
