#!/bin/sh

echo "Create mandatory folders..."
mkdir -p ~/iio-data
mkdir -p ~/iio-data/mongo
mkdir -p ~/iio-data/minio
mkdir -p ~/iio-data/minio/config
mkdir -p ~/iio-data/minio/data

echo "Copy Minio configuration..."
cp test/helpers/minio/config.json ~/iio-data/minio/config

echo "Prepare docker-compose.yml..."
cat test/helpers/template.docker-compose.yml | sed "s/_user_/$USER/g" > docker-compose.yml

echo "Prepare dev start bash file..."
cp test/helpers/_start.sh dev_start.sh
