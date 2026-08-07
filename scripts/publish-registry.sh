#!/usr/bin/env bash
#
# Publish the server card to the official MCP registry, and assert the result.
#
#   scripts/publish-registry.sh --verify    # read-only: is the entry live?
#   scripts/publish-registry.sh             # validate, log in, publish, verify
#
# The card at public/.well-known/mcp.json is the only source. mcp-publisher
# takes a path, so nothing is copied to the repo root; a duplicate there would
# be the drift this file exists to prevent.
#
# Authentication is DNS-based: a TXT record at the untype.me apex carries the
# ECDSA P-384 public key, and the matching private key proves ownership of the
# me.untype/* namespace. The key is looked for in three places, in order:
#
#   MCP_PUBLISHER_KEY        the raw scalar as 96 hex characters
#   MCP_PUBLISHER_KEY_FILE   a PEM (defaults to key.pem at the repo root)
#   the login keychain       security add-generic-password -s mcp-publisher-untype -a untype.me -w
#
# From a PEM the script derives the hex itself and checks the matching public
# key against the TXT record before contacting the registry, so a wrong or
# rotated key fails here with a clear message instead of as an opaque auth
# error two steps later.
#
# Two notes on handling. mcp-publisher accepts the key only as a command-line
# flag, so it is briefly visible to `ps` on this machine while login runs; it
# never reaches the shell history or a file, and the session is closed with
# `logout`. And macOS ships LibreSSL, whose Ed25519 `genpkey` fails, so P-384
# is the codepath here; `login` defaults to ed25519, so the algorithm is
# passed explicitly below.
#
# To rotate: generate a new key (`openssl ecparam -genkey -name secp384r1`),
# publish its public key as the apex TXT record, then run this script.
set -euo pipefail

readonly DOMAIN="untype.me"
readonly SERVER_NAME="me.untype/aboard"
readonly ENDPOINT="https://aboard.untype.me/mcp"
readonly KEYCHAIN_SERVICE="mcp-publisher-untype"
readonly REGISTRY="https://registry.modelcontextprotocol.io"

ROOT="$(git rev-parse --show-toplevel)"
readonly CARD="$ROOT/public/.well-known/mcp.json"

die() { echo "error: $*" >&2; exit 1; }

# The registry entry the world sees, matched on name and remote URL. Prints the
# published version on success. Exit 1 means "not published", not "failed".
verify() {
  local body
  body="$(curl -fsS --max-time 30 --get "$REGISTRY/v0/servers" \
    --data-urlencode "search=$SERVER_NAME")" || die "registry unreachable"

  # The single quotes are load-bearing: this is a JavaScript program, and its
  # `${...}` and `$env` must reach node unexpanded. The values it needs arrive
  # through the environment on the line below, not through shell interpolation.
  # shellcheck disable=SC2016
  name="$SERVER_NAME" endpoint="$ENDPOINT" node -e '
    const { name, endpoint } = process.env
    const servers = JSON.parse(process.argv[1]).servers ?? []
    const hit = servers.find((s) => (s.server ?? s).name === name)
    if (!hit) {
      console.error(`not published: registry has no ${name} (${servers.length} search hits)`)
      process.exit(1)
    }
    const server = hit.server ?? hit
    const remotes = (server.remotes ?? []).map((r) => r.url)
    if (!remotes.includes(endpoint)) {
      console.error(`published, but points at ${remotes.join(", ") || "no remote"} instead of ${endpoint}`)
      process.exit(1)
    }
    console.log(`published: ${name} ${server.version} -> ${endpoint}`)
  ' "$body"
}

if [[ "${1:-}" == "--verify" ]]; then
  verify
  exit $?
fi

[[ -f "$CARD" ]] || die "no server card at $CARD"
command -v mcp-publisher >/dev/null || die "mcp-publisher is not on PATH"

# Publishing a card that production does not serve would put a lie in the
# registry, so the two are compared before anything is sent.
echo "Comparing the card against production..."
deployed="$(curl -fsS --max-time 30 "https://aboard.untype.me/.well-known/mcp.json")" ||
  die "could not fetch the deployed card"
node -e '
  const canon = (v) =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
        : v
  const [local, deployed] = process.argv.slice(1).map((s) => canon(JSON.parse(s)))
  if (JSON.stringify(local) !== JSON.stringify(deployed)) {
    console.error("the local card and the deployed card differ; deploy first")
    process.exit(1)
  }
' "$(cat "$CARD")" "$deployed"

echo "Validating the card..."
mcp-publisher validate "$CARD"

echo "Checking DNS verification at the $DOMAIN apex..."
dns_record="$(dig +short TXT "$DOMAIN" | tr -d '"' | grep '^v=MCPv1' || true)"
[[ -n "$dns_record" ]] || die "no v=MCPv1 TXT record at the $DOMAIN apex"
echo "  $dns_record"
dns_pub="${dns_record##*p=}"

pem="${MCP_PUBLISHER_KEY_FILE:-$ROOT/key.pem}"
key="${MCP_PUBLISHER_KEY:-}"
if [[ -z "$key" && -f "$pem" ]]; then
  # A compressed P-384 point is 49 bytes, and the DER public key ends with it.
  derived="$(openssl ec -in "$pem" -pubout -conv_form compressed -outform DER 2>/dev/null |
    tail -c 49 | base64)"
  [[ "$derived" == "$dns_pub" ]] ||
    die "$pem does not match the TXT record; rotate the record or find the right key"
  echo "  $pem matches the record"
  # openssl prints the scalar as colon-separated hex, sometimes with a leading
  # zero byte the registry does not want.
  key="$(openssl ec -in "$pem" -noout -text 2>/dev/null |
    sed -n '/priv:/,/pub:/{/priv:/d; /pub:/d; p;}' | tr -cd '0-9a-f')"
  [[ ${#key} -eq 98 && "$key" == 00* ]] && key="${key:2}"
  [[ ${#key} -eq 96 ]] || die "expected a 96-character P-384 scalar from $pem, got ${#key}"
fi
if [[ -z "$key" ]]; then
  key="$(security find-generic-password -w -s "$KEYCHAIN_SERVICE" 2>/dev/null || true)"
fi
[[ -n "$key" ]] || die "no signing key: set MCP_PUBLISHER_KEY, put a PEM at $pem, or add $KEYCHAIN_SERVICE to the keychain"

echo "Logging in..."
trap 'mcp-publisher logout >/dev/null 2>&1 || true' EXIT
mcp-publisher login dns --domain "$DOMAIN" --algorithm ecdsap384 --private-key "$key"

echo "Publishing..."
mcp-publisher publish "$CARD"

# The registry is read-through cached, so the entry can lag the write by a few
# seconds. Believing the publish command alone is how session 30 ended up with
# an unverified claim.
echo "Verifying the entry is live..."
for attempt in 1 2 3 4 5; do
  if verify; then exit 0; fi
  [[ $attempt -lt 5 ]] && sleep 5
done
die "publish reported success but the registry does not serve the entry"
