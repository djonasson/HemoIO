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

# Checked before anything else runs: macOS still ships bash 3.2, and the
# quoting in config_quote and the arrays below behave as meant from 4.3 on
if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 3) )); then
  echo "This script needs bash 4.3 or newer (this is $BASH_VERSION)." >&2
  echo "On macOS: brew install bash" >&2
  exit 1
fi

API="https://loinc.regenstrief.org/api/v1"

usage() {
  cat <<'EOF'
Usage: LOINC_USER=you@example.com scripts/loinc-download.sh [--force] [output-dir]
       (through npm: npm run loinc:download -- [--force] [output-dir])

Downloads the current LOINC release into <output-dir>/<version>/ when it is
newer than the latest complete release already there.

  --force      download the current release again, even if already present
  output-dir   where releases go (default LOINC_DIR, else ~/loinc); a relative
               path is taken from the folder the command was run in
  -h, --help   show this help

Environment:
  LOINC_USER      loinc.org username (required)
  LOINC_PASSWORD  loinc.org password; asked for, hidden, when unset
  LOINC_DIR       default output-dir

See docs/LOINC.md.
EOF
}

die() {
  echo "$*" >&2
  exit 1
}

force=false
out=""
while (( $# )); do
  case "$1" in
    --force) force=true ;;
    -h | --help) usage; exit 0 ;;
    -*) die "Unknown option: $1 (see --help)" ;;
    *)
      [[ -z "$out" ]] || die "Only one output dir can be given (got '$out' and '$1')"
      out="$1"
      ;;
  esac
  shift
done
OUT="${out:-${LOINC_DIR:-$HOME/loinc}}"
# npm runs scripts from the repo root but records where it was called from
# in INIT_CWD, so a relative dir means what the person typing it expects
if [[ "$OUT" != /* ]]; then
  OUT="${INIT_CWD:-$PWD}/$OUT"
fi

missing=()
for tool in curl unzip python3; do
  command -v "$tool" >/dev/null || missing+=("$tool")
done
# GNU systems have md5sum, macOS and the BSDs have md5
command -v md5sum >/dev/null || command -v md5 >/dev/null || missing+=("md5sum (or md5)")
(( ${#missing[@]} == 0 )) || die "Missing prerequisites: ${missing[*]}"

: "${LOINC_USER:?Set LOINC_USER to your loinc.org username}"
if [[ -z "${LOINC_PASSWORD:-}" ]]; then
  # Without a terminal read would get nothing and the API would just answer
  # 401, so say what is wrong instead
  [[ -t 0 ]] || die "LOINC_PASSWORD is not set and there is no terminal to ask for it on."
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

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

md5_of() {
  if command -v md5sum >/dev/null; then
    md5sum "$1" | cut -d' ' -f1
  else
    md5 -q "$1"
  fi
}

# Fields of a JSON file, one per line, in the order asked for. Anything that
# is not a JSON object (an HTML maintenance page, a half-written file) gives
# empty fields, so callers report it instead of Python printing a traceback.
json_fields() {
  python3 -I -c '
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
except (OSError, ValueError):
    data = None
if not isinstance(data, dict):
    data = {}
for key in sys.argv[2:]:
    value = data.get(key)
    print("" if value is None else str(value).replace("\n", " "))
' "$@"
}

# A release is complete once its metadata names the folder's own version and
# its zip matches the MD5 that metadata gives. Requiring the name to match
# keeps copies such as current/ or v2.83/ from passing for a version.
is_complete() {
  local dir="$1" name="${1##*/}" version md5
  local -a fields
  # The cheap checks come first, so most folders never start Python
  [[ -f "$dir/metadata.json" && -f "$dir/Loinc_$name.zip" && -d "$dir/files" ]] || return 1
  mapfile -t fields < <(json_fields "$dir/metadata.json" version downloadMD5Hash)
  version="${fields[0]:-}"
  md5="${fields[1]:-}"
  [[ "$version" == "$name" && -n "$md5" ]] || return 1
  [[ "$(md5_of "$dir/Loinc_$name.zip")" == "$(lower "$md5")" ]]
}

# The latest complete release already downloaded, if any. Folders are tried
# newest name first and the first complete one wins, so a normal run hashes
# one zip rather than every release kept.
latest_local() {
  local dir name
  local -a names=()
  shopt -s nullglob
  for dir in "$OUT"/*/; do
    dir="${dir%/}"
    names+=("${dir##*/}")
  done
  shopt -u nullglob
  (( ${#names[@]} )) || return 0
  while IFS= read -r name; do
    if is_complete "$OUT/$name"; then
      printf '%s\n' "$name"
      return 0
    fi
  done < <(printf '%s\n' "${names[@]}" | sort -V -r)
}

# What to remove if the script stops early, by error or Ctrl-C: the partial
# zip and a version folder this run created, when nothing else got into it
meta=""
part=""
new_dir=""
cleanup() {
  [[ -z "$meta" ]] || rm -f "$meta"
  [[ -z "$part" ]] || rm -f "$part"
  [[ -z "$new_dir" ]] || rmdir "$new_dir" 2>/dev/null || true
}
trap cleanup EXIT
# Exiting from the signal traps runs the EXIT trap, so cleanup always runs
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$OUT"
meta="$(mktemp)"
# mktemp makes its file private; metadata.json is not secret
chmod 644 "$meta"

echo "Asking LOINC for the current release..."
loinc_curl -H 'Accept: application/json' "$API/Loinc" -o "$meta"
mapfile -t fields < <(json_fields "$meta" version downloadMD5Hash releaseDate)
version="${fields[0]:-}"
md5="$(lower "${fields[1]:-}")"
released="${fields[2]:-}"
# The version becomes a folder name and the MD5 is compared as hex, so
# anything else means the answer is not what it should be
if [[ ! "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ || ! "$md5" =~ ^[0-9a-f]{32}$ ]]; then
  echo "The API's answer has no valid version or MD5:" >&2
  head -c 2000 "$meta" >&2
  echo >&2
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
if [[ ! -d "$dir" ]]; then
  mkdir "$dir"
  new_dir="$dir"
fi

echo "Downloading LOINC $version to $zip ..."
part="$zip.part"
# The version is named, so the file is the release the metadata describes
loinc_curl "$API/Loinc/Download?version=$version" -o "$part"

actual="$(md5_of "$part")"
if [[ "$actual" != "$md5" ]]; then
  echo "MD5 mismatch: expected $md5, got $actual. The download was thrown away." >&2
  exit 1
fi
# From here the folder is being replaced, so it must stop counting as
# complete until the new metadata.json is written; otherwise a stop during
# the unzip would leave old metadata vouching for half the files
rm -f "$dir/metadata.json"
mv "$part" "$zip"
part=""
echo "MD5 checks out."

echo "Unzipping..."
rm -rf "$dir/files"
unzip -q "$zip" -d "$dir/files"
# Written last: a release counts as downloaded only once it is all there
cp "$meta" "$dir/metadata.json"
new_dir=""

echo "Done: LOINC $version in $dir ($(du -sh "$dir/files" | cut -f1) unzipped)"
