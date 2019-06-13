#!/bin/sh

docker-compose up -d
sleep 1

export S3_SECURE=false
export S3_ENDPOINT=localhost
export S3_PORT=9000
export S3_ACCESS_KEY_ID=G4I3RZP3I2AS7EMWQPMZ
export S3_SECRET_ACESS_KEY=xMzrrXMtnFEOP/K7MDFRA/bPxRfiCYEXOTOTOYEK

export IIO_SERVER_PORT=4093

export EMAILER_SMTP_PASS=toto

npm run test
