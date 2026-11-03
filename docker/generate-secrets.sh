#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
fi

random_hex() { openssl rand -hex "$1"; }
base64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

sign_jwt() {
  role=$1
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | base64url)
  issued_at=$(date +%s)
  expires_at=$((issued_at + 10 * 365 * 24 * 3600))
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$issued_at" "$expires_at" | base64url)
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

current() { sed -n "s/^$1=//p" .env | head -n 1; }

set_if_empty() {
  name=$1
  value=$2
  if [ -n "$(current "$name")" ]; then
    return
  fi
  tmp=$(mktemp)
  awk -v name="$name" -v value="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" name "=" && !done { print name "=" value; done = 1; next }
    { print }
    END { if (!done) print name "=" value }
  ' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

set_if_empty POSTGRES_PASSWORD "$(random_hex 24)"
set_if_empty JWT_SECRET "$(random_hex 32)"
JWT_SECRET=$(current JWT_SECRET)
set_if_empty ANON_KEY "$(sign_jwt anon)"
set_if_empty SERVICE_ROLE_KEY "$(sign_jwt service_role)"
set_if_empty REALTIME_SECRET_KEY_BASE "$(random_hex 32)"
set_if_empty ENCRYPTION_KEY "$(random_hex 32)"
set_if_empty API_KEY_HASH_SECRET "$(random_hex 32)"
set_if_empty QDRANT_API_KEY "$(random_hex 24)"
set_if_empty S3_ACCESS_KEY_ID "layerum"
set_if_empty S3_SECRET_ACCESS_KEY "$(random_hex 24)"

chmod 600 .env
echo "Secrets written to docker/.env. Existing values were kept."
