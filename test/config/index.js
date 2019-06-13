const IIO_SERVER_PORT =
  process.env.NODE_ENV === 'production' ? 8080
    : (process.env.IIO_SERVER_PORT ? parseInt(process.env.IIO_SERVER_PORT) : 4093)

const REST_API_KEY = '849b7648-14b8-4154-9ef2-8d1dc4c2b7e9'

module.exports = {
  server: {
    port: IIO_SERVER_PORT,
    path: process.env.IIO_SERVER_DIST || './dist',
    filesDropPath: './dist/dropped',
    corsEnabled: false
  },
  rest: {
    context: '/api',
    apiKeys: [ REST_API_KEY ],
    logLevel: 'error',
    _unified: true
  },
  logout: {
    timeout: 15, /* minutes */
    _unified: true
  },
  store: require('./store'),
  modules: require('./modules'),
  unified: require('./unified')
}
