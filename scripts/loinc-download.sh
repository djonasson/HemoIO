#!/usr/bin/env bash
# Download the LOINC release through the LOINC Download API, when it is
# newer than the latest one already downloaded. See docs/LOINC.md.
#
# Usage:
#   LOINC_USER=you@example.com npm run loinc:download [-- [--force] [output-dir]]
#
# The password is read from LOINC_PASSWORD, or asked for (hidden) when unset,
# and is passed to curl on stdin, never on the command line.
#
# Releases go to <output-dir>/<version>/ (default ~/loinc, or LOINC_DIR):
#   metadata.json      the API's description of the release
#   Loinc_<v>.zip      the release, checked against the API's MD5
#   files/             the release unzipped
# --force downloads the current release again even if it is already there.

set -euo pipefail

API="https://loinc.regenstrief.org/api/v1"

force=false
if [[ "${1:-}" == "--force" ]]; then
  force=true
  shift
fi
OUT="${1:-${LOINC_DIR:-$HOME/loinc}}"

: "${LOINC_USER:?Set LOINC_USER to your loinc.org username}"
if [[ -z "${LOINC_PASSWORD:-}" ]]; then
  read -r -s -p "loinc.org password for $LOINC_USER: " LOINC_PASSWORD
  echo
fi

# A value for a double-quoted curl config string: curl reads \ and " there
# as escapes, so a password holding either would be sent altered
config_quote() {
  local value="${1//\\/\\\\}"
  printf '%s' "${value//\"/\\\"}"
}

# curl reads the credentials from a config on stdin (-K -), so they never
# show in the process list or in shell history
loinc_curl() {
  printf 'user = "%s:%s"\n' "$(config_quote "$LOINC_USER")" "$(config_quote "$LOINC_PASSWORD")" |
    curl --fail --silent --show-error --location -K - "$@"
}

# A field of a JSON file
json_field() {
  python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")' "$1" "$2"
}

# A release is complete once its zip matches the MD5 its metadata gives
is_complete() {
  local dir="$1" version md5
  [[ -f "$dir/metadata.json" ]] || return 1
  version="$(json_field "$dir/metadata.json" version)"
  md5="$(json_field "$dir/metadata.json" downloadMD5Hash)"
  [[ -f "$dir/Loinc_$version.zip" && -d "$dir/files" && -n "$md5" ]] || return 1
  [[ "$(md5sum "$dir/Loinc_$version.zip" | cut -d' ' -f1)" == "${md5,,}" ]]
}

# The latest complete release already downloaded, if any
latest_local() {
  local dir
  shopt -s nullglob
  for dir in "$OUT"/*/; do
    dir="${dir%/}"
    if is_complete "$dir"; then basename "$dir"; fi
  done | sort -V | tail -n 1
}

mkdir -p "$OUT"
meta="$(mktemp)"
trap 'rm -f "$meta"' EXIT

echo "Asking LOINC for the current release..."
loinc_curl -H 'Accept: application/json' "$API/Loinc" -o "$meta"
version="$(json_field "$meta" version)"
md5="$(json_field "$meta" downloadMD5Hash)"
released="$(json_field "$meta" releaseDate)"
if [[ -z "$version" || -z "$md5" ]]; then
  echo "The API's answer has no version or MD5:" >&2
  cat "$meta" >&2
  exit 1
fi
echo "Current release: LOINC $version (released ${released%%T*})"

local_version="$(latest_local)"
if [[ -n "$local_version" ]]; then
  echo "Latest downloaded: LOINC $local_version in $OUT/$local_version"
  newest="$(printf '%s\n%s\n' "$local_version" "$version" | sort -V | tail -n 1)"
  if [[ "$force" == false && "$newest" == "$local_version" ]]; then
    echo "Up to date; nothing to download."
    exit 0
  fi
fi

dir="$OUT/$version"
zip="$dir/Loinc_$version.zip"
mkdir -p "$dir"

echo "Downloading LOINC $version to $zip ..."
# The version is named, so the file is the release the metadata describes
loinc_curl "$API/Loinc/Download?version=$version" -o "$zip.part"

actual="$(md5sum "$zip.part" | cut -d' ' -f1)"
if [[ "$actual" != "${md5,,}" ]]; then
  rm -f "$zip.part"
  rmdir "$dir" 2>/dev/null || true
  echo "MD5 mismatch: expected $md5, got $actual. Nothing kept." >&2
  exit 1
fi
mv "$zip.part" "$zip"
echo "MD5 checks out."

echo "Unzipping..."
rm -rf "$dir/files"
unzip -q "$zip" -d "$dir/files"
# Written last: a release counts as downloaded only once it is all there
cp "$meta" "$dir/metadata.json"

echo "Done: LOINC $version in $dir ($(du -sh "$dir/files" | cut -f1) unzipped)"
