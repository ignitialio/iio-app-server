const BSON = require('bson')

// exports.unpack = function(data) {
//   if (typeof data === 'string') {
//     data = Buffer.from(data, 'utf8')
//   }
//
//   return BSON.deserialize(data)
// }

exports.unpack = BSON.deserialize
exports.pack = BSON.serialize
