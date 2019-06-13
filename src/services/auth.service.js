const bcrypt = require('bcryptjs')

const Service = require('../core/service').Service

class Auth extends Service {
  constructor(io, options) {
    super(io, {
      name: 'auth',
      ...options
    })

    // manage log status for current ws connection
    this._io._logged = undefined

    this._register()
  }

  authenticate(args) {
    return new Promise((resolve, reject) => {
      this.$app.$data.users.checkToken(args).then(decoded => {
        this._io._logged = decoded.username
        resolve()
      }).catch(err => {
        this.logger.error(err, 'authentication failed')
        reject(err)
      })
    })
  }

  signin(args) {
    this.logger.info({ args: args }, 'signin request')
    return new Promise((resolve, reject) => {
      this.$app.$data.users.checkPassword(args).then(response => {
        this._io._logged = args.username
        resolve(response)
      }).catch(err => {
        this.logger.error(err, 'signin failed')
        reject(err)
      })
    })
  }

  signup(args) {
    let salt = bcrypt.genSaltSync(10)
    let hash = bcrypt.hashSync(args.password, salt)

    // update on the fly for clean persistency
    args.password = hash

    // delete for clean persistency
    if (args._auth) delete args['_auth']

    return new Promise((resolve, reject) => {
      this.$app.$data.users.put(args).then(user => {
        if (user) {
          resolve(user)
        } else {
          this.logger.error({ user: args }, 'impossible to create user')
          reject(new Error('impossible to create user'))
        }
      }).catch(err => {
        this.logger.error(err, 'impossible to create user')
        reject(new Error('impossible to create user'))
      })
    })
  }

  signout() {
    return new Promise((resolve, reject) => {
      if (this._io._logged) {
        this._io._logged = undefined
        resolve()
      } else {
        this.logger.error('not logged when asking for logout')
        reject(new Error('not logged'))
      }
    })
  }

  chpwd(args) {
    return new Promise((resolve, reject) => {
      if (this._io._logged === args.username) {
        this.$app.$data.users.get({ 'username': args.username }).then(user => {
          if (user) {
            // compute password hash
            let salt = bcrypt.genSaltSync(10)
            let hash = bcrypt.hashSync(args.newPassword, salt)
            user.password = hash

            this.$app.$data.users.put(user).then(() => {
              resolve()
            }).catch(err => {
              this.logger.error(err, 'impossible to save user [%s]', args.username)
              reject(new Error('impossible to save user'))
            })
          } else {
            this.logger.error('impossible to find user [%s]', args.username)
            reject(new Error('impossible to find user'))
          }
        }).catch(err => {
          this.logger.error(err, 'impossible to find user [%s]', args.username)
          reject(new Error('impossible to find user'))
        })
      } else {
        this.logger.error({ user: args }, 'must be logged')
        reject(new Error('must be logged'))
      }
    })
  }
}

module.exports = Auth
