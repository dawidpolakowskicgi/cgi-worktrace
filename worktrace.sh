#!/usr/bin/env bash
# Compatibility entry point for local scripts using the previous project name.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${script_dir}/tavri.sh" "$@"
