#!/bin/bash

# Go to project directory
cd "$(dirname "$0")/.."

# Load environment variables
source ~/.zshrc  # This ensures PATH includes node, etc.

# Function to run sync and log output
run_sync() {
    local log_file="logs/sync-$(date +%Y%m%d_%H%M%S).log"
    echo "Starting sync at $(date)" | tee -a "$log_file"
    node scripts/sync-vendor-pages.js 2>&1 | tee -a "$log_file"
    echo "Finished sync at $(date)" | tee -a "$log_file"
    echo "-------------------------------------------" | tee -a "$log_file"
}

echo "Starting continuous sync (every 15 minutes)"
echo "Press Ctrl+C to stop"
echo "Logs will be saved to logs/ directory"
echo "-------------------------------------------"

# Run continuously until interrupted
while true; do
    run_sync
    echo "Waiting 15 minutes until next sync..."
    sleep 900  # 15 minutes = 900 seconds
done
