#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'tavri macOS installer must be run on macOS.\n' >&2
  exit 2
fi

TAVRI_INSTALL_DIR="${TAVRI_INSTALL_DIR:-${WORKTRACE_INSTALL_DIR:-${HOME}/.local/bin}}"
TAVRI_MACOS_APP_DIR="${TAVRI_MACOS_APP_DIR:-${WORKTRACE_MACOS_APP_DIR:-${HOME}/Applications}}"
TAVRI_MACOS_SUPPORT_DIR="${TAVRI_MACOS_SUPPORT_DIR:-${WORKTRACE_MACOS_SUPPORT_DIR:-${HOME}/Library/Application Support/tavri}}"
TAVRI_MACOS_ARCHIVE_URL="${TAVRI_MACOS_ARCHIVE_URL:-}"
TAVRI_SKIP_DESKTOP="${TAVRI_SKIP_DESKTOP:-${WORKTRACE_SKIP_DESKTOP:-0}}"
TAVRI_SKIP_NPM_INSTALL="${TAVRI_SKIP_NPM_INSTALL:-${WORKTRACE_SKIP_NPM_INSTALL:-0}}"

script_dir="$(pwd)"
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

repo_root="$(cd "${script_dir}/.." 2>/dev/null && pwd || pwd)"
stage_dir=""
package_source=""
TAVRI_APP_VERSION=""

cleanup() {
  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
    rm -rf "$stage_dir"
  fi
}

trap cleanup EXIT

download_file() {
  local url="$1"
  local target="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$target"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$target" "$url"
    return
  fi

  printf 'tavri macOS installer: curl or wget is required.\n' >&2
  exit 1
}

local_package_available() {
  [[ -f "${repo_root}/tavri.sh" && -f "${repo_root}/package.json" && -d "${repo_root}/desktop" ]]
}

download_release_package() {
  if [[ -z "$TAVRI_MACOS_ARCHIVE_URL" ]]; then
    printf 'Install Tavri from a local checkout, or set TAVRI_MACOS_ARCHIVE_URL to a published release.\n' >&2
    exit 1
  fi
  local archive extracted

  stage_dir="$(mktemp -d)"
  archive="${stage_dir}/tavri-macos.tar.gz"

  printf 'Downloading tavri macOS package...\n'
  download_file "$TAVRI_MACOS_ARCHIVE_URL" "$archive"
  tar -xzf "$archive" -C "$stage_dir"

  extracted="$(find "$stage_dir" -mindepth 1 -maxdepth 1 -type d -name 'tavri-*' -print | head -n 1)"
  if [[ -z "$extracted" || ! -d "$extracted" ]]; then
    printf 'tavri macOS installer: release archive did not contain a tavri package.\n' >&2
    exit 1
  fi

  package_source="$extracted"
}

resolve_package_source() {
  if local_package_available; then
    package_source="$repo_root"
    return
  fi

  download_release_package
}

resolve_app_version() {
  TAVRI_APP_VERSION="$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' "${package_source}/package.json" | head -n 1)"
  if [[ -z "$TAVRI_APP_VERSION" ]]; then
    printf 'tavri macOS installer: package.json has no version.\n' >&2
    exit 1
  fi
}

install_cli() {
  mkdir -p "$TAVRI_INSTALL_DIR"
  cp "${package_source}/tavri.sh" "${TAVRI_INSTALL_DIR}/tavri"
  chmod 0755 "${TAVRI_INSTALL_DIR}/tavri"
}

copy_file_if_exists() {
  local source="$1"
  local target="$2"

  if [[ -f "$source" ]]; then
    cp "$source" "$target"
  fi
}

copy_dir() {
  local source="$1"
  local target="$2"

  rm -rf "$target"
  cp -R "$source" "$target"
}

install_desktop_files() {
  mkdir -p "$TAVRI_MACOS_SUPPORT_DIR"

  copy_file_if_exists "${package_source}/README.md" "$TAVRI_MACOS_SUPPORT_DIR/"
  copy_file_if_exists "${package_source}/package.json" "$TAVRI_MACOS_SUPPORT_DIR/"
  copy_file_if_exists "${package_source}/package-lock.json" "$TAVRI_MACOS_SUPPORT_DIR/"
  cp "${package_source}/tavri.sh" "$TAVRI_MACOS_SUPPORT_DIR/"
  cp "${package_source}/tavri-desktop" "$TAVRI_MACOS_SUPPORT_DIR/"
  copy_dir "${package_source}/assets" "${TAVRI_MACOS_SUPPORT_DIR}/assets"
  copy_dir "${package_source}/desktop" "${TAVRI_MACOS_SUPPORT_DIR}/desktop"

  chmod 0755 "${TAVRI_MACOS_SUPPORT_DIR}/tavri.sh" "${TAVRI_MACOS_SUPPORT_DIR}/tavri-desktop"
}

install_desktop_dependencies() {
  if [[ "$TAVRI_SKIP_NPM_INSTALL" == "1" ]]; then
    printf 'Skipped desktop dependency install because TAVRI_SKIP_NPM_INSTALL=1.\n'
    return
  fi

  if ! command -v npm >/dev/null 2>&1; then
    printf 'npm was not found. The CLI is installed, but the desktop app needs Node.js and npm.\n' >&2
    printf 'After installing Node.js, run: cd "%s" && npm install\n' "$TAVRI_MACOS_SUPPORT_DIR" >&2
    return
  fi

  printf 'Installing desktop dependencies...\n'
  if [[ -f "${TAVRI_MACOS_SUPPORT_DIR}/package-lock.json" ]]; then
    (cd "$TAVRI_MACOS_SUPPORT_DIR" && npm ci)
  else
    (cd "$TAVRI_MACOS_SUPPORT_DIR" && npm install)
  fi
}

write_app_launcher() {
  local launcher="$1"

  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -euo pipefail\n'
    printf 'export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"\n'
    printf 'TAVRI_SUPPORT_DIR=%q\n' "$TAVRI_MACOS_SUPPORT_DIR"
    printf 'exec "${TAVRI_SUPPORT_DIR}/tavri-desktop" "$@"\n'
  } > "$launcher"
  chmod 0755 "$launcher"
}

write_info_plist() {
  local plist="$1"

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Tavri</string>
  <key>CFBundleExecutable</key>
  <string>tavri</string>
  <key>CFBundleIconFile</key>
  <string>tavri-icon</string>
  <key>CFBundleIdentifier</key>
  <string>com.tavri.desktop</string>
  <key>CFBundleName</key>
  <string>Tavri</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${TAVRI_APP_VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${TAVRI_APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST
}

create_app_bundle() {
  local app_bundle="${TAVRI_MACOS_APP_DIR}/Tavri.app"
  local contents="${app_bundle}/Contents"

  mkdir -p "${contents}/MacOS" "${contents}/Resources"
  write_app_launcher "${contents}/MacOS/tavri"
  write_info_plist "${contents}/Info.plist"

  if [[ -f "${TAVRI_MACOS_SUPPORT_DIR}/assets/tavri-icon.icns" ]]; then
    cp "${TAVRI_MACOS_SUPPORT_DIR}/assets/tavri-icon.icns" "${contents}/Resources/tavri-icon.icns"
  fi
}

path_contains_install_dir() {
  case ":${PATH}:" in
    *":${TAVRI_INSTALL_DIR}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

print_next_steps() {
  printf '\nInstalled tavri CLI to %s\n' "${TAVRI_INSTALL_DIR}/tavri"

  if ! path_contains_install_dir; then
    printf '\n%s is not currently in your PATH.\n' "$TAVRI_INSTALL_DIR"
    printf 'Add this to your shell profile, then open a new terminal:\n\n'
    printf '  export PATH="%s:$PATH"\n' "$TAVRI_INSTALL_DIR"
  fi

  if [[ "$TAVRI_SKIP_DESKTOP" != "1" ]]; then
    printf '\nInstalled tavri desktop app to %s\n' "${TAVRI_MACOS_APP_DIR}/Tavri.app"
    printf 'Open it from Finder, or run:\n\n'
    printf '  open "%s"\n' "${TAVRI_MACOS_APP_DIR}/Tavri.app"
  fi

  printf '\nCheck the CLI with:\n\n'
  printf '  tavri version\n'
}

resolve_package_source
resolve_app_version
install_cli

if [[ "$TAVRI_SKIP_DESKTOP" != "1" ]]; then
  install_desktop_files
  install_desktop_dependencies
  create_app_bundle
fi

print_next_steps
