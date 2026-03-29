#!/bin/bash

# Get the Neon connection string from environment variable
NEON_DB_URL="${DATABASE_URL}"

# Create a temporary file for the current schema
TEMP_SCHEMA=$(mktemp)

# Dump the current schema from Neon
pg_dump "$NEON_DB_URL" --schema-only > "$TEMP_SCHEMA"

# Compare with our tracked schema
if diff -q "$TEMP_SCHEMA" migrations/schema/schema.sql >/dev/null; then
    echo "✅ Schema is up to date with Neon"
    rm "$TEMP_SCHEMA"
    exit 0
else
    echo "❌ Schema differences detected!"
    echo "Differences:"
    diff "$TEMP_SCHEMA" migrations/schema/schema.sql
    rm "$TEMP_SCHEMA"
    exit 1
fi
