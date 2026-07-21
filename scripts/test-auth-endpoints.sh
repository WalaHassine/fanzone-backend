#!/usr/bin/env bash
#
# Task — Auth endpoint black-box tests.
#
# Exercises POST /auth/register, POST /auth/login and GET /auth/profile against a
# RUNNING server and checks status codes, response bodies and JWT correctness.
#
# Usage:
#   npm run start:dev                 # in one terminal (uses .env.development)
#   bash scripts/test-auth-endpoints.sh
#   BASE_URL=http://localhost:3000 bash scripts/test-auth-endpoints.sh
#
# Self-contained and repeatable: registers a unique email each run, so it never
# collides with existing data. Exits non-zero if any case fails.

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.development"

PASS=0
FAIL=0

# ----- helpers ---------------------------------------------------------------

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }

# pass/fail recorder: ok <label> <condition-result:0/1> [detail]
ok() {
  local label="$1" cond="$2" detail="${3:-}"
  if [ "$cond" -eq 0 ]; then
    printf '  [%s] %s\n' "$(green PASS)" "$label"
    PASS=$((PASS + 1))
  else
    printf '  [%s] %s%s\n' "$(red FAIL)" "$label" "${detail:+ — $detail}"
    FAIL=$((FAIL + 1))
  fi
}

# req <METHOD> <PATH> [json-body] [auth-header] -> prints body then status on last line
req() {
  local method="$1" path="$2" data="${3:-}" auth="${4:-}"
  local args=(-s -X "$method" -w $'\n%{http_code}' -H 'Content-Type: application/json' --max-time 15)
  [ -n "$auth" ] && args+=(-H "$auth")
  [ -n "$data" ] && args+=(--data "$data")
  curl "${args[@]}" "$BASE_URL$path"
}

status_of() { printf '%s' "$1" | tail -n1; }
body_of()   { printf '%s' "$1" | sed '$d'; }

# body_has <json> <substring>  (substring match over the serialized body)
body_has() {
  JSON_IN="$1" NEEDLE="$2" node -e '
    const raw = process.env.JSON_IN || "";
    let s = raw;
    try { s = JSON.stringify(JSON.parse(raw)); } catch (_) {}
    process.exit(s.includes(process.env.NEEDLE) ? 0 : 1);
  '
}

# json_field <json> <js-expr on d>  -> prints value ("" if undefined)
json_field() {
  JSON_IN="$1" EXPR="$2" node -e '
    let d = {};
    try { d = JSON.parse(process.env.JSON_IN || "{}"); } catch (_) {}
    const v = eval(process.env.EXPR);
    process.stdout.write(v === undefined || v === null ? "" : String(v));
  '
}

# jwt_mint <email> <expiresIn> <secret>  -> prints a signed token
jwt_mint() {
  ( cd "$ROOT" && TOK_EMAIL="$1" TOK_EXP="$2" TOK_SECRET="$3" node -e '
    const jwt = require("jsonwebtoken");
    process.stdout.write(jwt.sign(
      { sub: "00000000-0000-0000-0000-000000000000", email: process.env.TOK_EMAIL, role: "USER" },
      process.env.TOK_SECRET,
      { expiresIn: process.env.TOK_EXP },
    ));
  ' )
}

# jwt_probe <token>  -> prints JSON {valid, sub, email, role, ttl}
jwt_probe() {
  TOK="$1" node -e '
    const parts = (process.env.TOK || "").split(".");
    if (parts.length !== 3) { console.log(JSON.stringify({ valid: false })); process.exit(0); }
    let p;
    try { p = JSON.parse(Buffer.from(parts[1], "base64url").toString()); }
    catch (_) { console.log(JSON.stringify({ valid: false })); process.exit(0); }
    console.log(JSON.stringify({
      valid: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(process.env.TOK),
      sub: p.sub, email: p.email, role: p.role,
      ttl: (typeof p.exp === "number" && typeof p.iat === "number") ? p.exp - p.iat : null,
    }));
  '
}

# ----- preflight -------------------------------------------------------------

echo "== Auth endpoint tests =="
echo "Base URL: $BASE_URL"

probe="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/" || true)"
if [ "$probe" = "000" ] || [ -z "$probe" ]; then
  echo
  red "Server not reachable at $BASE_URL"; echo
  echo "Start it first:  npm run start:dev   (needs Postgres up)"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  red "Missing $ENV_FILE (needed for JWT_SECRET to mint expired/forged tokens)"; echo
  exit 1
fi
# Read JWT_SECRET without echoing it.
JWT_SECRET="$(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
if [ -z "$JWT_SECRET" ]; then
  red "JWT_SECRET not found in $ENV_FILE"; echo
  exit 1
fi

EMAIL="test+$(date +%s)@worldcup.com"
PASSWORD='Passw0rd!'
echo "Test account: $EMAIL"
echo

# ============================================================================
echo "-- Registration --"

# R1: valid register -> 201 + token
r="$(req POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "R1 valid register -> 201" "$([ "$s" = 201 ] && echo 0 || echo 1)" "got $s"
TOKEN="$(json_field "$b" 'd.accessToken')"
ok "R1 body: accessToken present"           "$([ -n "$TOKEN" ] && echo 0 || echo 1)"
ok "R1 body: expiresIn == 3600"             "$([ "$(json_field "$b" 'd.expiresIn')" = 3600 ] && echo 0 || echo 1)" "got $(json_field "$b" 'd.expiresIn')"
ok "R1 body: tokenType == Bearer"           "$([ "$(json_field "$b" 'd.tokenType')" = Bearer ] && echo 0 || echo 1)"

# R2: invalid email format -> 400
r="$(req POST /auth/register "{\"email\":\"not-an-email\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "R2 invalid email -> 400" "$([ "$s" = 400 ] && echo 0 || echo 1)" "got $s"
ok "R2 body mentions email validation" "$(body_has "$b" 'valid email' && echo 0 || echo 1)"

# R3: weak password (missing uppercase) -> 400
r="$(req POST /auth/register "{\"email\":\"weak1+$EMAIL\",\"password\":\"passw0rd!\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "R3 weak pw (no uppercase) -> 400" "$([ "$s" = 400 ] && echo 0 || echo 1)" "got $s"
ok "R3 body has password-strength message" "$(body_has "$b" 'special character' && echo 0 || echo 1)"

# R4: too short password -> 400
r="$(req POST /auth/register "{\"email\":\"weak2+$EMAIL\",\"password\":\"Pw0rd!\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "R4 too-short pw -> 400" "$([ "$s" = 400 ] && echo 0 || echo 1)" "got $s"
ok "R4 body has min-length message" "$(body_has "$b" 'at least 8 characters' && echo 0 || echo 1)"

# R5: duplicate email -> 400
r="$(req POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "R5 duplicate email -> 400" "$([ "$s" = 400 ] && echo 0 || echo 1)" "got $s"
ok "R5 body: 'Email already registered'" "$(body_has "$b" 'Email already registered' && echo 0 || echo 1)"

# R6: registration token is valid JWT
probe_json="$(jwt_probe "$TOKEN")"
ok "R6 register token is valid JWT format" "$([ "$(json_field "$probe_json" 'd.valid')" = true ] && echo 0 || echo 1)"
ok "R6 register token has sub/email/role"  "$([ -n "$(json_field "$probe_json" 'd.sub')" ] && [ -n "$(json_field "$probe_json" 'd.role')" ] && echo 0 || echo 1)"

echo
echo "-- Login --"

# L1: valid login -> 200 + token
r="$(req POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "L1 valid login -> 200" "$([ "$s" = 200 ] && echo 0 || echo 1)" "got $s"
LOGIN_TOKEN="$(json_field "$b" 'd.accessToken')"
ok "L1 body: accessToken present"  "$([ -n "$LOGIN_TOKEN" ] && echo 0 || echo 1)"
ok "L1 body: expiresIn == 3600"    "$([ "$(json_field "$b" 'd.expiresIn')" = 3600 ] && echo 0 || echo 1)"

# L2: wrong password -> 401
r="$(req POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"WrongPass9!\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "L2 wrong password -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"
ok "L2 body: 'Invalid credentials'" "$(body_has "$b" 'Invalid credentials' && echo 0 || echo 1)"

# L3: non-existent email -> 401 (same message, no user enumeration)
r="$(req POST /auth/login "{\"email\":\"nobody+$(date +%s)@worldcup.com\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "L3 non-existent email -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"
ok "L3 body: 'Invalid credentials' (no enumeration)" "$(body_has "$b" 'Invalid credentials' && echo 0 || echo 1)"

# L4: invalid email format -> 400
r="$(req POST /auth/login "{\"email\":\"not-an-email\",\"password\":\"$PASSWORD\"}")"
s="$(status_of "$r")"
ok "L4 invalid email format -> 400" "$([ "$s" = 400 ] && echo 0 || echo 1)" "got $s"

# L5: login token is valid JWT
ok "L5 login token is valid JWT" "$([ "$(json_field "$(jwt_probe "$LOGIN_TOKEN")" 'd.valid')" = true ] && echo 0 || echo 1)"

echo
echo "-- Profile --"

# P1: valid token -> 200 + {userId,email}
r="$(req GET /auth/profile "" "Authorization: Bearer $LOGIN_TOKEN")"
s="$(status_of "$r")"; b="$(body_of "$r")"
ok "P1 valid token -> 200" "$([ "$s" = 200 ] && echo 0 || echo 1)" "got $s"
ok "P1 body: email matches account" "$([ "$(json_field "$b" 'd.email')" = "$EMAIL" ] && echo 0 || echo 1)"
ok "P1 body: userId present"         "$([ -n "$(json_field "$b" 'd.userId')" ] && echo 0 || echo 1)"
ok "P1 body: role NOT leaked"        "$(body_has "$b" '"role"' && echo 1 || echo 0)"

# P2: missing Authorization header -> 401
s="$(status_of "$(req GET /auth/profile)")"
ok "P2 missing header -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"

# P3: invalid token -> 401
s="$(status_of "$(req GET /auth/profile "" "Authorization: Bearer garbage.token.xyz")")"
ok "P3 invalid token -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"

# P4: expired token -> 401
EXPIRED="$(jwt_mint "$EMAIL" '-1h' "$JWT_SECRET")"
s="$(status_of "$(req GET /auth/profile "" "Authorization: Bearer $EXPIRED")")"
ok "P4 expired token -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"

# P5: wrong-secret token -> 401
FORGED="$(jwt_mint "$EMAIL" '1h' 'the-wrong-secret')"
s="$(status_of "$(req GET /auth/profile "" "Authorization: Bearer $FORGED")")"
ok "P5 wrong-secret token -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"

# P6: malformed Authorization header -> 401
s="$(status_of "$(req GET /auth/profile "" "Authorization: Bearer")")"
ok "P6 malformed header -> 401" "$([ "$s" = 401 ] && echo 0 || echo 1)" "got $s"

echo
echo "-- Token validation --"

# T1: decode login token claims + 1h expiry
pj="$(jwt_probe "$LOGIN_TOKEN")"
ok "T1 token email claim correct" "$([ "$(json_field "$pj" 'd.email')" = "$EMAIL" ] && echo 0 || echo 1)"
ok "T1 token has sub (userId)"    "$([ -n "$(json_field "$pj" 'd.sub')" ] && echo 0 || echo 1)"
ok "T1 token has role"            "$([ -n "$(json_field "$pj" 'd.role')" ] && echo 0 || echo 1)"
ok "T1 token TTL == 3600 (1h)"    "$([ "$(json_field "$pj" 'd.ttl')" = 3600 ] && echo 0 || echo 1)" "got $(json_field "$pj" 'd.ttl')"

# ============================================================================
echo
echo "============================================"
printf 'Result: %s passed, %s failed\n' "$(green "$PASS")" "$([ "$FAIL" -eq 0 ] && green 0 || red "$FAIL")"
echo "============================================"
[ "$FAIL" -eq 0 ]
