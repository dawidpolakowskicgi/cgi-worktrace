#!/usr/bin/env bash
set -euo pipefail

# Keep macOS resource-fork sidecars out of cross-platform archives.
export COPYFILE_DISABLE=1

if (($# != 2)); then
  printf 'usage: %s <version-tag> <output-dir>\n' "${0##*/}" >&2
  exit 2
fi

readonly VERSION_TAG="$1"
output_dir_arg="$2"
readonly RELEASE_REPOSITORY="${TAVRI_REPOSITORY:-${GITHUB_REPOSITORY:-dawidpolakowskicgi/CGITART}}"
readonly RELEASE_URL_BASE="https://github.com/${RELEASE_REPOSITORY}/releases/download/${VERSION_TAG}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
stage_dir="$(mktemp -d)"
package_root="${stage_dir}/tavri-${VERSION_TAG}"
package_version="$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' "${repo_root}/package.json" | head -n 1)"
if [[ "${VERSION_TAG#v}" != "$package_version" ]]; then
  printf 'release tag %s does not match package version %s\n' "$VERSION_TAG" "$package_version" >&2
  exit 2
fi

cleanup() {
  rm -rf "$stage_dir"
}

trap cleanup EXIT

mkdir -p "$output_dir_arg"
readonly OUTPUT_DIR="$(cd "$output_dir_arg" && pwd)"

mkdir -p "$OUTPUT_DIR" "$package_root/assets" "$package_root/desktop" "$package_root/scripts"

cp "${repo_root}/README.md" "$package_root/"
cp "${repo_root}/LICENSE" "$package_root/"
cp "${repo_root}/CHANGELOG.md" "${repo_root}/CONTRIBUTING.md" "${repo_root}/SECURITY.md" "${repo_root}/ROADMAP.md" "$package_root/"
cp -R "${repo_root}/docs" "$package_root/docs"
cp -R "${repo_root}/src" "$package_root/src"
cp "${repo_root}/package.json" "$package_root/"
if [[ -f "${repo_root}/package-lock.json" ]]; then
  cp "${repo_root}/package-lock.json" "$package_root/"
fi
cp "${repo_root}/tavri.sh" "$package_root/"
cp "${repo_root}/tavri-desktop" "$package_root/"
cp "${repo_root}/scripts/install.sh" "$package_root/scripts/"
cp "${repo_root}/scripts/install-macos.sh" "$package_root/scripts/"
cp "${repo_root}/scripts/install.ps1" "$package_root/scripts/"
cp -R "${repo_root}/desktop/." "$package_root/desktop/"
cp -R "${repo_root}/assets/." "$package_root/assets/"

chmod 0755 "$package_root/tavri.sh" "$package_root/tavri-desktop" "$package_root/scripts/install.sh" "$package_root/scripts/install-macos.sh"

sed \
  "s|TAVRI_RAW_URL:-}|TAVRI_RAW_URL:-${RELEASE_URL_BASE}/tavri.sh}|g" \
  "${repo_root}/scripts/install.sh" > "${OUTPUT_DIR}/install.sh"
chmod 0755 "${OUTPUT_DIR}/install.sh"

sed \
  "s|TAVRI_MACOS_ARCHIVE_URL:-}|TAVRI_MACOS_ARCHIVE_URL:-${RELEASE_URL_BASE}/tavri-macos.tar.gz}|g" \
  "${repo_root}/scripts/install-macos.sh" > "${OUTPUT_DIR}/install-macos.sh"
chmod 0755 "${OUTPUT_DIR}/install-macos.sh"

sed \
  "s|\$SourceUrl = \"\"|\$SourceUrl = \"${RELEASE_URL_BASE}/tavri.sh\"|g" \
  "${repo_root}/scripts/install.ps1" > "${OUTPUT_DIR}/install.ps1"

cp "${repo_root}/tavri.sh" "${OUTPUT_DIR}/tavri.sh"
chmod 0755 "${OUTPUT_DIR}/tavri.sh"

tar -C "$stage_dir" -czf "${OUTPUT_DIR}/tavri-${VERSION_TAG}-linux.tar.gz" "tavri-${VERSION_TAG}"
cp "${OUTPUT_DIR}/tavri-${VERSION_TAG}-linux.tar.gz" "${OUTPUT_DIR}/tavri-linux.tar.gz"

tar -C "$stage_dir" -czf "${OUTPUT_DIR}/tavri-${VERSION_TAG}-macos.tar.gz" "tavri-${VERSION_TAG}"
cp "${OUTPUT_DIR}/tavri-${VERSION_TAG}-macos.tar.gz" "${OUTPUT_DIR}/tavri-macos.tar.gz"

(
  cd "$stage_dir"
  zip -qr "${OUTPUT_DIR}/tavri-${VERSION_TAG}-windows.zip" "tavri-${VERSION_TAG}"
)
cp "${OUTPUT_DIR}/tavri-${VERSION_TAG}-windows.zip" "${OUTPUT_DIR}/tavri-windows.zip"

(
  cd "$OUTPUT_DIR"
  shasum -a 256 \
    install.sh \
    install-macos.sh \
    install.ps1 \
    tavri.sh \
    "tavri-${VERSION_TAG}-linux.tar.gz" \
    "tavri-${VERSION_TAG}-macos.tar.gz" \
    "tavri-${VERSION_TAG}-windows.zip" \
    tavri-linux.tar.gz \
    tavri-macos.tar.gz \
    tavri-windows.zip \
    > SHA256SUMS.txt
)
