const JSONEncoder = require('./json.encoder')
const BSONEncoder = require('./bson.encoder')

module.exports = {
  json: JSONEncoder,
  bson: BSONEncoder
}
