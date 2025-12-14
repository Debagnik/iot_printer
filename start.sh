#!/bin/bash

set -e

APP_DIR="/home/admin/iot"
LOG_DIR="/home/admin/iot/logs"
LOG_FILE="$LOG_DIR/startup.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

echo "========================================" >> "$LOG_FILE"
echo "[$(date)] Boot sequence started" >> "$LOG_FILE"

cd "$APP_DIR"

echo "[$(date)] Fetching latest code" >> "$LOG_FILE"
/usr/bin/git fetch origin >> "$LOG_FILE" 2>&1
/usr/bin/git checkout master >> "$LOG_FILE" 2>&1
/usr/bin/git pull origin master >> "$LOG_FILE" 2>&1

echo "[$(date)] Installing dependencies (npm ci)" >> "$LOG_FILE"
/usr/bin/npm ci >> "$LOG_FILE" 2>&1

echo "[$(date)] Starting application" >> "$LOG_FILE"
/usr/bin/npm start >> "$LOG_FILE" 2>&1
