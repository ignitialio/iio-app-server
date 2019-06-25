#!/bin/sh

if command -v iio 2>/dev/null; then
  iio infra dev
  if [ $? -ne 0 ]
  then
    echo "iio version must be >=2.2.1: 'npm i -g @ignitial/iio-cli'"
    exit 1
  fi
else
  echo "iio not installed: 'npm i -g @ignitial/iio-cli'"
  exit 1
fi

export APP_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

echo "app version: ${APP_VERSION}"

export IIOS_NAMESPACE=ignitialio
export MONGODB_DBNAME=ignitialio

docker-compose -f docker-compose.yml up -d

export S3_SECURE=false
export S3_ENDPOINT=localhost
export S3_PORT=9000
export S3_ACCESS_KEY_ID=G4I3RZP3I2AS7EMWQPMZ
export S3_SECRET_ACESS_KEY=xMzrrXMtnFEOP/K7MDFRA/bPxRfiCYEXOTOTOYEK

export EMAILER_SMTP_PASS=toto

node ./test/index.js
