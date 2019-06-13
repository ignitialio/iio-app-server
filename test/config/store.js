const fs = require('fs')

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'localhost'
const S3_SECURE = process.env.S3_SECURE ? (process.env.S3_SECURE === 'true') : false
const S3_PORT = process.env.S3_PORT ? parseInt(process.env.S3_PORT) : undefined
const S3_BUCKET = process.env.S3_BUCKET || 'ignitialio'
const S3_REGION = process.env.S3_REGION || 'eu-west-3'

// BUCKET endPoint
var S3_BUCKET_ENDPOINT = ''

if (S3_ENDPOINT.match('.amazonaws.')) {
  S3_BUCKET_ENDPOINT = (S3_SECURE ? 'https://' : 'http://') + S3_BUCKET + '.' +
    S3_ENDPOINT
} else {
  S3_BUCKET_ENDPOINT = (S3_SECURE ? 'https://' : 'http://') + S3_ENDPOINT +
    (S3_PORT ? ':' + S3_PORT : '') + '/' + S3_BUCKET
}

// ACCESS secrets
var S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
var S3_SECRET_ACESS_KEY = process.env.S3_SECRET_ACESS_KEY

// get from docker secrets
if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACESS_KEY) {
  S3_ACCESS_KEY_ID = fs.readFileSync('/run/secrets/s3_access_key_id', 'utf8').replace('\n', '')
  S3_SECRET_ACESS_KEY = fs.readFileSync('/run/secrets/s3_secret_access_key', 'utf8').replace('\n', '')
}

module.exports = {
  minio: {
    endPoint: S3_ENDPOINT,
    useSSL: S3_SECURE,
    accessKey: S3_ACCESS_KEY_ID,
    secretKey: S3_SECRET_ACESS_KEY,
    port: S3_PORT,
    region: S3_REGION
  },
  bucket: {
    name: S3_BUCKET,
    region: S3_REGION,
    endPoint: S3_BUCKET_ENDPOINT,
    _unified: true
  }
}
