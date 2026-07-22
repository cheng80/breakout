#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
DEPLOY_URL="${BREAKOUT_DEPLOY_URL:-}"
DEPLOY_TOKEN="${BREAKOUT_DEPLOY_TOKEN:-}"
BASE_HREF="/breakout/"
PACKAGE_DIR="$ROOT_DIR/breakout"
ZIP_PATH="$ROOT_DIR/breakout.zip"
CURRENT_STEP="startup"
TOTAL_STEPS=6

usage() {
  cat <<'EOF'
Usage:
  tools/deploy_breakout_web.sh [options]

Options:
  --env-file <path>      Env file path. Default: .env
  --deploy-url <url>     Override BREAKOUT_DEPLOY_URL
  --token <token>        Override BREAKOUT_DEPLOY_TOKEN
  -h, --help             Show this help.

Required env:
  BREAKOUT_DEPLOY_URL=https://cheng80.myqnapcloud.com/deploy_breakout.php
  BREAKOUT_DEPLOY_TOKEN=<same token as /share/Web/.breakout_deploy.env>

Flow:
  1. Remove stale dist/, breakout/, and breakout.zip.
  2. Run npm run build -- --base=/breakout/.
  3. Rename dist/ to breakout/ and create breakout.zip.
  4. Upload the zip to the NAS deploy endpoint.
  5. The NAS extracts breakout/, verifies index.html, and removes its zip.
  6. Remove the local zip after a successful upload.
EOF
}

log_step() {
  local step_number="$1"
  local message="$2"
  CURRENT_STEP="$message"
  echo
  echo "[$step_number/$TOTAL_STEPS] $message"
}

log_info() {
  echo "  - $*"
}

fail() {
  local message="$1"
  echo >&2
  echo "ERROR at step: $CURRENT_STEP" >&2
  echo "$message" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  echo >&2
  echo "ERROR at step: $CURRENT_STEP" >&2
  echo "Command failed with exit code $exit_code." >&2
  exit "$exit_code"
}

trap on_error ERR

load_env_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    [[ "$line" == *"="* ]] || continue

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
      BREAKOUT_DEPLOY_URL)
        [[ -n "${BREAKOUT_DEPLOY_URL:-}" || -n "$DEPLOY_URL" ]] || DEPLOY_URL="$value"
        ;;
      BREAKOUT_DEPLOY_TOKEN)
        [[ -n "${BREAKOUT_DEPLOY_TOKEN:-}" || -n "$DEPLOY_TOKEN" ]] || DEPLOY_TOKEN="$value"
        ;;
    esac
  done < "$file_path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:?missing env file path}"
      shift 2
      ;;
    --deploy-url)
      DEPLOY_URL="${2:?missing deploy url}"
      shift 2
      ;;
    --token)
      DEPLOY_TOKEN="${2:?missing deploy token}"
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

load_env_file "$ENV_FILE"

log_step 1 "환경 설정과 도구 확인"
log_info "env file: $ENV_FILE"
[[ -n "$DEPLOY_URL" ]] || fail "BREAKOUT_DEPLOY_URL is required. Set it in $ENV_FILE or pass --deploy-url."
[[ -n "$DEPLOY_TOKEN" ]] || fail "BREAKOUT_DEPLOY_TOKEN is required. Set it in $ENV_FILE or pass --token."
[[ "$DEPLOY_TOKEN" != "replace_with_output_of_openssl_rand_hex_32" ]] || fail "BREAKOUT_DEPLOY_TOKEN still has the placeholder value. Generate one with: openssl rand -hex 32"
log_info "deploy URL: $DEPLOY_URL"
log_info "deploy token: configured (${#DEPLOY_TOKEN} chars)"

for command_name in npm zip unzip curl; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name command not found."
  log_info "$command_name: $(command -v "$command_name")"
done

log_step 2 "기존 웹 산출물 정리"
rm -rf "$ROOT_DIR/dist" "$PACKAGE_DIR"
rm -f "$ZIP_PATH"
log_info "removed dist/, breakout/, and breakout.zip"

log_step 3 "Vite 프로덕션 빌드"
npm run build -- --base="$BASE_HREF"
[[ -f "$ROOT_DIR/dist/index.html" ]] || fail "Build completed but dist/index.html was not created."

log_step 4 "dist를 breakout 폴더로 변경"
mv "$ROOT_DIR/dist" "$PACKAGE_DIR"
[[ -f "$PACKAGE_DIR/index.html" ]] || fail "Renamed package does not contain breakout/index.html."
log_info "package directory: $PACKAGE_DIR"

log_step 5 "zip 압축과 NAS 업로드"
zip -qry "$ZIP_PATH" "$(basename "$PACKAGE_DIR")"
unzip -tq "$ZIP_PATH"
log_info "zip size: $(du -h "$ZIP_PATH" | awk '{print $1}')"

response_file="$(mktemp -t breakout-deploy-response.XXXXXX)"
cleanup_response_file() {
  rm -f "$response_file"
}
trap cleanup_response_file EXIT

http_code="$(
  curl -sS \
    -o "$response_file" \
    -w "%{http_code}" \
    -X POST "$DEPLOY_URL" \
    -H "X-Deploy-Token: $DEPLOY_TOKEN" \
    -F "file=@$ZIP_PATH;type=application/zip"
)"

log_step 6 "업로드 결과와 로컬 zip 정리"
log_info "HTTP $http_code"
cat "$response_file"
echo
if [[ "$http_code" != "200" ]] || ! grep -Eq '"result"[[:space:]]*:[[:space:]]*"OK"' "$response_file"; then
  fail "Deploy failed. Review the HTTP response above."
fi

rm -f "$ZIP_PATH"
log_info "removed local breakout.zip"
echo
echo "Deploy complete. NAS removes its uploaded zip after extraction."
