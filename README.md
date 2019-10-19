# IgnitialIO web application server library

This library allows an web app to take advantage of the
[IIOS](https://github.com/ignitialio/iio-services) services framework.  
It implements several concepts:
- web socket communication using [socket.io](https://www.npmjs.com/package/socket.io)
- unified services: these are services defined server-side that can be called
browser side as if they were seamlesly local to browser. They use web sockets to
do so.
- modules: these are services (you can see this as app plugins) implemented
server-side and eventually available browser side. If so, unlikely unified
services, they are defined with one instance per all web socket clients (e.g.
connection), while unified services provide one instance per client
- API gateway: is providing an unified service for each available IIO
micro-service. In this way, any micro-service can be used locally to the browser.
- static configuration management for the web app
- static file serve
- REST API capabilities thanks to [connect-rest](https://www.npmjs.com/package/connect-rest)
- AWS S3 or compliant (e.g. Minio S3) file storage

## Architecture

### _core/IIOSAppServer_  

It provides:
- static configuration management
- REST API implementation
- server-side web socket communication (using _core/ws.js_)
- modules life cycle management
- S3 file storage

### _core/module.js_

Base class for modules implementation.

### _core/service.js_

Base class for unified services implementation.

### _core/ws.js_

Web socket communication and unified services management.

### Default modules

- _modules/emailer.module.js_: mail services
- _modules/gateway.module.js_: IIOS gateway for utility access to current deployed
services
- _modules/utils.module.js_: utility module

### Default unified services  

- _services/apigateway.service.js_: IIOS gateway providing one unified service per
available micro-service per client
- _config.service.js_: client side access to public configuration (flagged with
_ _unified_ in the congifuraiton file)

## Tests  

Tests are mainly done trough the full application. For example:
[IgnitialIO application template](https://github.com/ignitialio/iio-app-material-template)
