#!/bin/bash

# Script to READ EXISTING sync logs for artists listed in a CSV
# and append extracted results to a new CSV, plus output a summary.
# DOES NOT run the sync script.

# set -e # Keep disabled for robustness when logs might be missing/malformed
set -o pipefail # Causes a pipeline to return the exit status of the last command in the pipe that failed.

# --- Configuration ---
ARTIST_COLUMN_NAME="Artist"
INPUT_CSV="$1"
OUTPUT_CSV="${INPUT_CSV%.csv}_read_log_updated.csv" # Different output name

# --- Validation ---
if [ -z "$INPUT_CSV" ]; then
  echo "Usage: $0 <path_to_input.csv>"
  exit 1
fi

if [ ! -f "$INPUT_CSV" ]; then
  echo "Error: Input CSV file not found: '$INPUT_CSV'"
  exit 1
fi

# --- Main Logic ---
echo "Starting batch log processing..."
echo "Input CSV: $INPUT_CSV"
echo "Output CSV will be: $OUTPUT_CSV"

start_time=$(date +%s) # Record start time
success_count=0 # Counts artists where details were successfully parsed
failure_count=0 # Counts artists where logs/details couldn't be parsed

header=$(head -n 1 "$INPUT_CSV")
new_header="$header,Details"
echo "$new_header" > "$OUTPUT_CSV"

artist_col_index=$(echo "$header" | tr ',' '\n' | grep -nx "$ARTIST_COLUMN_NAME" | cut -d: -f1)
if [ -z "$artist_col_index" ]; then
  echo "Error: Column '$ARTIST_COLUMN_NAME' not found in the CSV header: '$header'"
  exit 1
fi
echo "Found '$ARTIST_COLUMN_NAME' column at index: $artist_col_index"

total_lines=$(tail -n +2 "$INPUT_CSV" | wc -l)
current_line=0

tail -n +2 "$INPUT_CSV" | while IFS= read -r line
do
  current_line=$((current_line + 1))
  echo # Add a blank line for readability
  echo "---"
  echo "[${current_line}/${total_lines}] Processing Line: $line"
  # Extract artist name and remove potential trailing carriage return
  artist_name=$(echo "$line" | awk -F, -v col="$artist_col_index" '{gsub(/^[[:space:]\"\"]+|[[:space:]\"\"]+$/, "", $col); print $col}' | tr -d '\r')
  echo "  DEBUG: Extracted Artist Name (CR stripped): '$artist_name'"

  if [ -z "$artist_name" ]; then
    echo "  -> Skipping line - could not extract artist name."
    details="\"Error: Could not extract artist name\""
    echo "$line,$details" >> "$OUTPUT_CSV"
    failure_count=$((failure_count + 1))
    continue
  fi

  # Find the MOST RECENT existing log file (macOS compatible)
  # Simplified sed command for better compatibility
  sanitized_artist=$(echo "$artist_name" | sed -e 's/ /_/g' -e 's/[^a-zA-Z0-9_.-]//g')
  echo "  DEBUG: Sanitized Name Pattern: '$sanitized_artist'"
  glob_pattern="sync-log-${sanitized_artist}-*.txt"
  echo "  DEBUG: Glob Pattern Used: '$glob_pattern'"
  # Use quotes around the glob pattern for safety
  latest_log_file=$(ls -t "$glob_pattern" | head -n 1)
  echo "  DEBUG: Result from ls command: '$latest_log_file'"

  details=""
  is_success=false

  # Extract details FROM THE LOG FILE
  if [ -n "$latest_log_file" ] && [ -f "$latest_log_file" ]; then
      echo "  -> Found Log File: $latest_log_file"
      escaped_artist_name=$(printf '%s\n' "$artist_name" | sed 's/[.*[\^$]/\\&/g')
      summary_line=$(grep -m 1 -E "^-\ ${escaped_artist_name}:" "$latest_log_file")
      grep_exit_code=$?

      if [ $grep_exit_code -eq 0 ] && [ -n "$summary_line" ]; then
          if [[ "$summary_line" == *": ❌ FAILED"* ]]; then
              fail_reason=$(echo "$summary_line" | sed 's/.*FAILED - //')
              details="\"Sync Failed: ${fail_reason}\""
              echo "     -> Failed (from log). Reason: ${fail_reason}"
              is_success=false # Count as failure if log shows failure
          elif [[ "$summary_line" == *": ✅ OK"* ]]; then
              cards=$(echo "$summary_line" | sed -n 's/.*Cards Synced: \([0-9]*\).*/\1/p')
              pages=$(echo "$summary_line" | sed -n 's/.*New Pages: \([0-9]*\).*/\1/p')
              queues=$(echo "$summary_line" | sed -n 's/.*New Queues: \([0-9]*\).*/\1/p')
              time_val=$(echo "$summary_line" | sed -n 's/.*Time: \([0-9.]*\)s.*/\1/p')

              if [[ -n "$cards" && -n "$pages" && -n "$queues" && -n "$time_val" ]]; then
                   details="\"Cards: $cards, Pages: $pages, Queues: $queues, Time: ${time_val}s\""
                   echo "     -> Success (from log). Details: ${details}"
                   is_success=true
              else
                   details="\"Error: Failed to parse summary line in log: $latest_log_file\""
                   echo "     -> Error: Failed to parse summary line format."
                   is_success=false
              fi
          else
               details="\"Error: Unknown summary line format in log: $latest_log_file\""
               echo "     -> Error: Unknown summary line format found."
               is_success=false
          fi
      else
          details="\"Error: Summary line not found (grep code $grep_exit_code) in log: $latest_log_file\""
          echo "     -> Error: Summary line not found in log (grep code $grep_exit_code)."
          is_success=false
      fi
  else # Log file not found or latest_log_file variable is empty
      details="\"Error: Log file not found using pattern '$glob_pattern' (Result: '$latest_log_file')\"" # More specific error
      echo "  -> Error: Log file not found."
      is_success=false
  fi

  # Update counts based on SUCCESSFUL PARSING of log details
  if [ "$is_success" = true ]; then
      success_count=$((success_count + 1))
  else
      failure_count=$((failure_count + 1))
  fi

  # Append to CSV
  echo "$line,$details" >> "$OUTPUT_CSV"

done

# --- Final Summary --- #
end_time=$(date +%s)
total_duration=$((end_time - start_time))

echo "-----------------------------------------"
echo "Batch Log Processing Summary"
echo "-----------------------------------------"
echo "Input File:           $INPUT_CSV"
echo "Output File:          $OUTPUT_CSV"
echo "Total Artists Found:    $total_lines"
echo "Logs Parsed OK:       $success_count"
echo "Logs Not Found/Error: $failure_count"

total_minutes=$((total_duration / 60))
total_seconds=$((total_duration % 60))
echo "Total Run Time:       ${total_minutes}m ${total_seconds}s (${total_duration} seconds)"

echo "-----------------------------------------"

echo "Log processing complete."

exit 0
