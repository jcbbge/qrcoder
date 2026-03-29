#!/bin/bash

# Go to project directory
cd "$(dirname "$0")/.."

# Function to check if sync is running
check_sync() {
    # Look for the EXACT process, exclude grep/pgrep itself
    if ps aux | grep "[r]un-scheduled-sync.sh" > /dev/null; then
        PID=$(ps aux | grep "[r]un-scheduled-sync.sh" | awk '{print $2}')
        echo "✅ Sync is running (PID: $PID)"
        return 0
    else
        echo "❌ Sync is not running"
        return 1
    fi
}

# Function to start sync
start_sync() {
    if check_sync > /dev/null; then
        echo "❌ Sync is already running!"
        return 1
    fi

    echo "🚀 Starting sync..."
    nohup ./scripts/run-scheduled-sync.sh > logs/sync.log 2>&1 &
    sleep 2  # Give it a moment to start

    if check_sync > /dev/null; then
        echo "✅ Sync started successfully!"
        echo "📝 Logs available in logs/sync.log"
    else
        echo "❌ Failed to start sync"
        return 1
    fi
}

# Function to stop sync
stop_sync() {
    if ! check_sync > /dev/null; then
        echo "❌ Sync is not running!"
        return 1
    fi

    PID=$(ps aux | grep "[r]un-scheduled-sync.sh" | awk '{print $2}')
    echo "🛑 Stopping sync (PID: $PID)..."
    kill $PID
    sleep 2  # Give it a moment to stop

    if ! check_sync > /dev/null; then
        echo "✅ Sync stopped successfully!"
    else
        echo "❌ Failed to stop sync"
        return 1
    fi
}

# Function to show recent logs
show_logs() {
    echo "📝 Recent sync activity:"
    echo "----------------------------------------"
    tail -n 50 logs/sync.log
}

# Parse command
case "$1" in
    start)
        start_sync
        ;;
    stop)
        stop_sync
        ;;
    status)
        check_sync
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|status|logs}"
        echo "  start  - Start the sync process in background"
        echo "  stop   - Stop the running sync process"
        echo "  status - Check if sync is running"
        echo "  logs   - Show recent sync logs"
        exit 1
        ;;
esac
