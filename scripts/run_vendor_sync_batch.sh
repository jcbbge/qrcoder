#!/bin/bash

# Script to run sync-vendor-pages.js for artists listed in a CSV
# and append extracted results to a new CSV, plus output a summary.

# set -e # Temporarily removed for debugging loop issues
set -o pipefail # Causes a pipeline to return the exit status of the last command in the pipe that failed.

# --- Configuration ---
# Column name in the input CSV that contains the artist/vendor name
ARTIST_COLUMN_NAME="Artist"
# Input CSV file path (provided as the first argument)
INPUT_CSV="$1"
# Output CSV file path
OUTPUT_CSV="${INPUT_CSV%.csv}_updated.csv"
# Path to the Node.js sync script
SYNC_SCRIPT="scripts/sync-vendor-pages.js"

# --- Validation ---
if [ -z "$INPUT_CSV" ]; then
  echo "Usage: $0 <path_to_input.csv>"
  exit 1
fi

if [ ! -f "$INPUT_CSV" ]; then
  echo "Error: Input CSV file not found: '$INPUT_CSV'"
  exit 1
fi

if [ ! -f "$SYNC_SCRIPT" ]; then
    echo "Error: Sync script not found: '$SYNC_SCRIPT'"
    exit 1
fi

# --- Main Logic ---
echo "Starting batch vendor sync..."
echo "Input CSV: $INPUT_CSV"
echo "Output CSV will be: $OUTPUT_CSV"

start_time=$(date +%s) # Record start time
success_count=0
failure_count=0

# Read the header line to find the artist column index
header=$(head -n 1 "$INPUT_CSV")
# Add the new Details column to the header
new_header="$header,Details"
echo "$new_header" > "$OUTPUT_CSV"

# Find the column number for the artist name (1-based index)
artist_col_index=$(echo "$header" | tr ',' '\n' | grep -nx "$ARTIST_COLUMN_NAME" | cut -d: -f1)

if [ -z "$artist_col_index" ]; then
  echo "Error: Column '$ARTIST_COLUMN_NAME' not found in the CSV header: '$header'"
  exit 1 # Keep exit here as it's fundamental
fi
echo "Found '$ARTIST_COLUMN_NAME' column at index: $artist_col_index"

# Process each line of the CSV (skip header)
total_lines=$(tail -n +2 "$INPUT_CSV" | wc -l)
current_line=0

tail -n +2 "$INPUT_CSV" | while IFS= read -r line
do
  current_line=$((current_line + 1))
  # Extract artist name using awk based on the found column index
  # Handles potential commas within quoted fields better than simple cut
  # Corrected awk command for quote removal
  artist_name=$(echo "$line" | awk -F, -v col="$artist_col_index" '{gsub(/^[[:space:]"\"\"]+|[[:space:]"\"\"]+$/, "", $col); print $col}')

  if [ -z "$artist_name" ]; then
    echo "[${current_line}/${total_lines}] Skipping line - could not extract artist name: $line"
    # Append the line with an error message in the details column
    details="\"Error: Could not extract artist name\""
    echo "$line,$details" >> "$OUTPUT_CSV"
    failure_count=$((failure_count + 1))
    continue
  fi

  echo "[${current_line}/${total_lines}] Processing Artist: '$artist_name'"

  # --- Run the sync script ---
  # Redirect stdin from /dev/null to prevent it consuming the loop's input
  node "$SYNC_SCRIPT" "$artist_name" < /dev/null
  script_exit_code=$?

  # Find the log file
  sanitized_artist=$(echo "$artist_name" | sed 's/\s\+/_/g; s/[^a-zA-Z0-9_\-\.]//g')
  # Safer way to find the latest log file
  latest_log_file=""
  # Use find instead of ls for better error handling & safety with filenames
  # -maxdepth 1 ensures we only search current directory
  # -print0 and read -d '' handle weird filenames safely
  while IFS= read -r -d '' file; do
      latest_log_file="$file"
      break # Found the latest one (due to -t sort)
  done < <(find . -maxdepth 1 -name "sync-log-${sanitized_artist}-*.txt" -printf '%T@ %p\0' | sort -znr | cut -z -d' ' -f2-)

  details="" # Reset details for this artist
  is_success=false # Flag to track success for this artist

  # Extract details
  # Check if latest_log_file was actually found and is a file
  if [ $script_exit_code -eq 0 ] && [ -n "$latest_log_file" ] && [ -f "$latest_log_file" ]; then
      escaped_artist_name=$(printf '%s\n' "$artist_name" | sed 's/[.*[\^$]/\\&/g')
      # Check grep exit code explicitly
      summary_line=$(grep -m 1 -E "^-\ ${escaped_artist_name}:" "$latest_log_file")
      grep_exit_code=$?

      if [ $grep_exit_code -eq 0 ] && [ -n "$summary_line" ]; then
          # Check if the line indicates failure
          if [[ "$summary_line" == *": ❌ FAILED"* ]]; then
              fail_reason=$(echo "$summary_line" | sed 's/.*FAILED - //')
              details="\"Sync Failed: ${fail_reason}\"" # Quote for CSV safety
              echo "   -> Failed. Reason: ${fail_reason}"
              # is_success remains false
          # Check if the line indicates success
          elif [[ "$summary_line" == *": ✅ OK"* ]]; then
              # Parse the numbers using sed
              cards=$(echo "$summary_line" | sed -n 's/.*Cards Synced: \([0-9]*\).*/\1/p')
              pages=$(echo "$summary_line" | sed -n 's/.*New Pages: \([0-9]*\).*/\1/p')
              queues=$(echo "$summary_line" | sed -n 's/.*New Queues: \([0-9]*\).*/\1/p')
              time_val=$(echo "$summary_line" | sed -n 's/.*Time: \([0-9.]*\)s.*/\1/p')

              # Basic check if parsing worked
              if [[ -n "$cards" && -n "$pages" && -n "$queues" && -n "$time_val" ]]; then
                   details="\"Cards: $cards, Pages: $pages, Queues: $queues, Time: ${time_val}s\""
                   echo "   -> Success. Details: ${details}"
                   is_success=true
              else
                   # Parsing failed for some reason
                   details="\"Error: Failed to parse summary line in log: $latest_log_file\""
                   echo "   -> Error: Failed to parse summary line format."
                   # is_success remains false
              fi
          else
               # Unknown summary line format
               details="\"Error: Unknown summary line format in log: $latest_log_file\""
               echo "   -> Error: Unknown summary line format found."
               # is_success remains false
          fi
      else
          # Grep failed to find the line
          details="\"Error: Summary line not found (grep code $grep_exit_code) in log: $latest_log_file\""
          echo "   -> Error: Summary line not found in log (grep code $grep_exit_code)."
          # is_success remains false
      fi
  elif [ $script_exit_code -ne 0 ]; then
      details="\"Error: Sync script failed (exit code $script_exit_code)\""
      echo "   -> Error: Sync script failed (exit code $script_exit_code)."
      # is_success remains false
  else # Handles case where log file wasn't found or wasn't a file
      details="\"Error: Log file not found for sanitized name '$sanitized_artist'\""
      echo "   -> Error: Log file not found."
      # is_success remains false
  fi

  # Update counts
  if [ "$is_success" = true ]; then
      success_count=$((success_count + 1))
  else
      failure_count=$((failure_count + 1))
  fi

  # Append the original line content and the new details column to the output CSV
  echo "$line,$details" >> "$OUTPUT_CSV"

done

end_time=$(date +%s)
total_duration=$((end_time - start_time))

echo "-----------------------------------------"
echo "Batch Processing Summary"
echo "-----------------------------------------"
echo "Input File:          $INPUT_CSV"
echo "Output File:         $OUTPUT_CSV"
echo "Total Artists Found:   $total_lines"
echo "Successfully Synced: $success_count"
echo "Failed Syncs:        $failure_count"

# Convert total duration to minutes and seconds for readability
total_minutes=$((total_duration / 60))
total_seconds=$((total_duration % 60))
echo "Total Run Time:      ${total_minutes}m ${total_seconds}s (${total_duration} seconds)"

echo "-----------------------------------------"

echo "Batch processing complete."
echo "Output saved to: $OUTPUT_CSV"

exit 0
