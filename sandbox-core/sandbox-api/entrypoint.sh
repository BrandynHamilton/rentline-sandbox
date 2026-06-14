#!/bin/sh
# entrypoint.sh — fix /app/data ownership after volume mount, then run as sandbox user
set -e

# Running as root here — fix ownership of the data volume so the sandbox user can write to it
chown -R sandbox:sandbox /app/data

# Drop privileges and exec the CMD
exec gosu sandbox "$@"
