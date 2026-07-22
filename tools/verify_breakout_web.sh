#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/breakout"
ENV_FILE="$ROOT_DIR/.env"
PUBLIC_URL="${BREAKOUT_PUBLIC_URL:-}"
ZIP_URL="${BREAKOUT_ZIP_URL:-}"

load_env_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "${line:0:1}" == "#" || "$line" != *"="* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    case "$key" in
      BREAKOUT_PUBLIC_URL) [[ -n "$PUBLIC_URL" ]] || PUBLIC_URL="$value" ;;
      BREAKOUT_ZIP_URL) [[ -n "$ZIP_URL" ]] || ZIP_URL="$value" ;;
    esac
  done < "$file_path"
}

load_env_file "$ENV_FILE"
PUBLIC_URL="${PUBLIC_URL:-https://cheng80.myqnapcloud.com/breakout/}"
ZIP_URL="${ZIP_URL:-https://cheng80.myqnapcloud.com/breakout.zip}"
BASE_URL="$PUBLIC_URL"
BASE_URL="${BASE_URL%/}"

usage() {
  cat <<'EOF'
Usage:
  tools/verify_breakout_web.sh [options]

Options:
  --env-file <path>      Env file path. Default: .env.
  --base-url <url>       Public breakout URL. Default: BREAKOUT_PUBLIC_URL.
  --zip-url <url>        Uploaded zip URL. Default: BREAKOUT_ZIP_URL.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:?missing env file path}"
      PUBLIC_URL=""
      ZIP_URL=""
      load_env_file "$ENV_FILE"
      BASE_URL="${PUBLIC_URL:-https://cheng80.myqnapcloud.com/breakout/}"
      ZIP_URL="${ZIP_URL:-https://cheng80.myqnapcloud.com/breakout.zip}"
      BASE_URL="${BASE_URL%/}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:?missing base url}"
      BASE_URL="${BASE_URL%/}"
      shift 2
      ;;
    --zip-url)
      ZIP_URL="${2:?missing zip url}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ -d "$PACKAGE_DIR" ]] || { echo "Missing local package: $PACKAGE_DIR" >&2; exit 1; }

tmp_dir="$(mktemp -d -t breakout-verify.XXXXXX)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

status="$(curl -L -sS -o "$tmp_dir/index.html" -w '%{http_code}' "$BASE_URL/")"
[[ "$status" == "200" ]] || { echo "ENTRY DIFF status=$status"; exit 1; }
echo "ENTRY OK $BASE_URL/"

failed=0
while IFS= read -r relative_path; do
  [[ -n "$relative_path" ]] || continue
  local_path="$PACKAGE_DIR/$relative_path"
  remote_path="$tmp_dir/${relative_path//\//_}"
  if ! curl -L -sS --fail -o "$remote_path" "$BASE_URL/$relative_path"; then
    echo "MISS $relative_path"
    failed=1
    continue
  fi

  local_sha="$(shasum -a 256 "$local_path" | awk '{print $1}')"
  remote_sha="$(shasum -a 256 "$remote_path" | awk '{print $1}')"
  if [[ "$local_sha" == "$remote_sha" ]]; then
    echo "OK   $relative_path $local_sha"
  else
    echo "DIFF $relative_path local=$local_sha remote=$remote_sha"
    failed=1
  fi
done < <(cd "$PACKAGE_DIR" && find . -type f -not -name '.DS_Store' -print | sed 's#^\./##' | sort)

zip_status="$(curl -L -sS -o /dev/null -w '%{http_code}' "$ZIP_URL")"
if [[ "$zip_status" == "404" ]]; then
  echo "ZIP OK $ZIP_URL removed (404)"
else
  echo "ZIP WARN $ZIP_URL status=$zip_status"
  failed=1
fi

exit "$failed"
