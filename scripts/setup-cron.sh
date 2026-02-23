#!/bin/bash

# Setup Cron Job for Daily Decay
# Run this script once to set up the daily decay cron job

echo "Setting up Clawstreet daily decay cron job..."

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Create cron job entry
CRON_JOB="0 5 * * * cd $PROJECT_DIR && npm run daily-decay >> $PROJECT_DIR/logs/daily-decay.log 2>&1"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Add to crontab
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "Cron job added successfully!"
echo "Daily decay will run at 5:00 AM UTC every day"
echo "Logs will be written to: $PROJECT_DIR/logs/daily-decay.log"
echo ""
echo "To verify the cron job was added, run: crontab -l"
echo "To remove the cron job later, run: crontab -e"
echo ""
echo "Manual test command: npm run daily-decay"