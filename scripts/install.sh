#!/usr/bin/env bash
set -euo pipefail

TAVRI_RAW_URL="${TAVRI_RAW_URL:-}"
TAVRI_INSTALL_DIR="${TAVRI_INSTALL_DIR:-${WORKTRACE_INSTALL_DIR:-${HOME}/.local/bin}}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
target="${TAVRI_INSTALL_DIR}/tavri"

download_tavri() {
  if [[ -z "$TAVRI_RAW_URL" ]]; then
    printf 'Tavri is currently installed from a local checkout. Set TAVRI_RAW_URL to use a published release.\n' >&2
    exit 1
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$TAVRI_RAW_URL" -o "$target"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$target" "$TAVRI_RAW_URL"
    return
  fi

  printf 'tavri installer: curl or wget is required to download tavri.sh\n' >&2
  exit 1
}

install_tavri() {
  local local_source=""

  mkdir -p "$TAVRI_INSTALL_DIR"

  if [[ "$(basename "$script_dir")" == "scripts" && -f "${repo_root}/tavri.sh" ]]; then
    local_source="${repo_root}/tavri.sh"
  fi

  if [[ -f "$local_source" ]]; then
    cp "$local_source" "$target"
  else
    download_tavri
  fi

  chmod 0755 "$target"
}

path_contains_install_dir() {
  case ":${PATH}:" in
    *":${TAVRI_INSTALL_DIR}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

print_next_steps() {
  printf 'Installed tavri to %s\n' "$target"

  if path_contains_install_dir; then
    printf 'Run: tavri version\n'
    return
  fi

  printf '\n%s is not currently in your PATH.\n' "$TAVRI_INSTALL_DIR"
  printf 'Add this to your shell profile, then open a new terminal:\n\n'
  printf '  export PATH="%s:$PATH"\n\n' "$TAVRI_INSTALL_DIR"
  printf 'Or run tavri directly with:\n\n'
  printf '  %s version\n' "$target"
}

install_tavri
print_next_steps
