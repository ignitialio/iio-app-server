const IIO_SERVER_PORT =
  process.env.NODE_ENV === 'production' ? 8080
    : (process.env.IIO_SERVER_PORT ? parseInt(process.env.IIO_SERVER_PORT) : 4093)

const REST_API_KEY = '849b7648-14b8-4154-9ef2-8d1dc4c2b7e9'

module.exports = {
  server: {
    port: IIO_SERVER_PORT,
    path: process.env.IIOS_SERVER_PATH || './test/dist',
    filesDropPath: './test/dist/dropped',
    corsEnabled: false
  },
  rest: {
    logLevel: process.env.IIOS_REST_LOGLEVEL || 'error'
  },
  logout: {
    timeout: 15, /* minutes */
    _unified: true
  },
  store: require('./store'),
  modules: require('./modules'),
  /* data service information */
  data: {
    /* name of the main service that provides data access */
    service: 'dlake',
    /* additional collections */
    collections: [{
      name: 'notifications'
    }, {
      /* example */
      name: 'myitems'
    }],
    _unified: true
  },
  /* auth service information */
  auth: {
    /* name of the main service that provides authentication control */
    service: 'auth',
    _unified: true
  },
  i18n: require('./i18n'),
  unified: require('./unified')
}
