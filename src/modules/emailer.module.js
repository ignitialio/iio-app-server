const nodemailer = require('nodemailer')
const Module = require('../core/module').Module

class Emailer extends Module {
  constructor(options) {
    super(options)

    // Create a SMTP transporter object
    this._transporter = nodemailer.createTransport(options.smtp, options.mail)
  }

  send(mailOptions) {
    return new Promise((resolve, reject) => {
      this._transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          this.logger.error(err, 'Mailer failed')
          reject(err)
        } else {
          resolve(info)
        }
      })
    })
  }
}

module.exports = Emailer
