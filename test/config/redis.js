exports.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
exports.REDIS_PORT = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
exports.REDIS_DB = process.env.REDIS_DB || 0
