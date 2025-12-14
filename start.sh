#!/bin/bash

set -e

APP_DIR="/home/admin/iot"
LOG_FILE="/home/admin/iot/startup.log"

echo "[$(date)] Starting app" >> "$LOG_FILE"

cd "$APP_DIR"

# Make sure we are on master and up to date
/usr/bin/git fetch origin >> "$LOG_FILE" 2>&1
/usr/bin/git checkout master >> "$LOG_FILE" 2>&1
/usr/bin/git pull origin master >> "$LOG_FILE" 2>&1

# Start the app
/usr/bin/npm start >> "$LOG_FILE" 2>&1
