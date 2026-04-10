#!/bin/bash

# Web3 Process Manager - Continuous Deployment Script
# This script pulls the latest changes and gracefully reloads PM2 to prevent indexer downtime.

echo "Starting Deployment..."

# 1. Pull latest code (uncomment in a real git repo)
# echo "Pulling from git..."
# git reset --hard
# git pull origin main

# 2. Install Dependencies safely
echo "Installing dependencies..."
npm install --omit=dev  # Or use `yarn install --frozen-lockfile` if using yarn

# 3. Ensure logs directory exists
mkdir -p logs

# 4. Graceful Reload via PM2
echo "Reloading PM2 Ecosystem with Zero-Downtime..."

# We use reload instead of restart to achieve zero-downtime clustering.
# Using --update-env ensures any new .env variables are loaded.
npx pm2 reload ecosystem.config.js --update-env

if [ $? -eq 0 ]; then
  echo "Deployment Successful! Processes are running."
  npx pm2 status
else
  echo "Deployment Failed or PM2 is not running yet. Falling back to starting..."
  npx pm2 start ecosystem.config.js --env production
fi

# 5. Save the PM2 list locally so it restarts on system reboot
npx pm2 save

echo "Process Manager CI/CD executed successfully."
