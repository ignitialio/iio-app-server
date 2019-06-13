const fs = require('fs')

const redisCfg = require('./redis')

// SMTP secrets
var EMAILER_SMTP_PASS = process.env.EMAILER_SMTP_PASS

// get from docker secrets
if (!EMAILER_SMTP_PASS) {
  try {
    EMAILER_SMTP_PASS = fs.readFileSync('/run/secrets/emailer_smtp_pass', 'utf8').replace('\n', '')
  } catch (err) {}
}

module.exports = {
  emailer: {
    smtp: {
      host: process.env.EMAILER_SMTP_HOST || 'mail.ignitial.fr', /* SMTP host */
      port: process.env.EMAILER_SMTP_PORT || 25, /* SMTP port */
      secure: process.env.EMAILER_SMTP_SECURE === 'true', /* true for 465, false for other ports */
      auth: {
        user: process.env.EMAILER_SMTP_USER, /* SMTP server user account */
        pass: EMAILER_SMTP_PASS /* SMTP server user password */
      },
      logger: false,
      debug: false
    },
    mail: {
      from: 'Systra Support <no-reply@ignitial.fr>'
    }
  },
  data: {
    service: 'dlake',
    engine: process.env.DB_ENGINE || 'mongo',
    namespace: process.env.IIOS_NAMESPACE || 'ignitialio',
    heartbeatPeriod: 5000,
    redis: {
      host: redisCfg.REDIS_HOST,
      port: redisCfg.REDIS_PORT,
      db: redisCfg.REDIS_DB
    }
  }
}
