# Rotating the MCP registry signing key

The playbook for rotating the ECDSA P-384 key that proves ownership of
the `me.untype/*` namespace on the official MCP registry. Use it when
the key is lost or compromised. Identity is anchored in DNS, not in key
continuity: the TXT record at the `untype.me` apex carries the public
key, so a rotation is one keygen, one DNS edit, and one keychain write.
The published entry (`me.untype/aboard`) stays live throughout; the key
is only needed for the next publish.

Written 2026-08-19, after the first key was lost (see the issues entry
of the same date). Every command below was rehearsed with throwaway
keys before being written down; the ordering rules exist because the
loss came from violating them, not from caution in general.

Two rules the steps encode:

- **Nothing is deleted until its replacement is verified.** The
  original key died because `rm key.pem` rode in the same paste as an
  unverified keychain write.
- **The secret never goes through an interactive prompt or the shell
  history.** It moves only through shell variables; history records the
  literal text `"$scalar"`, never the value. (The value is briefly
  visible to `ps` during the `security` and `mcp-publisher` calls,
  which the script's header already accepts on this machine.)

## Prerequisites

`openssl` (LibreSSL is fine; P-384 is the codepath precisely because
LibreSSL's Ed25519 `genpkey` fails), `node`, `mcp-publisher` on PATH
(`brew install mcp-publisher`), and access to the Spaceship DNS panel
for `untype.me`.

## Step 1 — generate the new key, outside the repo

```bash
(umask 077; openssl genpkey -algorithm EC \
  -pkeyopt ec_paramgen_curve:secp384r1 -out ~/mcp-publisher-rotation.pem)
```

Not at the repo root: `key.pem` there is gitignored but was the
load-bearing single copy last time. The home-directory file is
temporary and dies in step 6.

## Step 2 — extract the private scalar into a variable

```bash
scalar="$(openssl ec -in ~/mcp-publisher-rotation.pem -noout -text 2>/dev/null |
  sed -n '/priv:/,/pub:/{/priv:/d; /pub:/d; p;}' | tr -cd '0-9a-f')"
[[ ${#scalar} -eq 98 && "$scalar" == 00* ]] && scalar="${scalar:2}"
[[ ${#scalar} -eq 96 ]] && echo "scalar ok" || echo "BAD scalar: ${#scalar} chars"
```

The same extraction `scripts/publish-registry.sh` uses on its PEM
branch, leading-zero strip included: openssl sometimes prints a 49-byte
scalar with a `00` prefix, and the registry wants exactly 96 hex
characters. Do not continue past a `BAD scalar` line.

## Step 3 — derive the new TXT record value, twice

```bash
pub_pem="$(openssl ec -in ~/mcp-publisher-rotation.pem -pubout \
  -conv_form compressed -outform DER 2>/dev/null | tail -c 49 | base64)"
pub_scalar="$(printf '%s' "$scalar" | node -e '
  let hex = "";
  process.stdin.on("data", (d) => (hex += d));
  process.stdin.on("end", () => {
    const ecdh = require("crypto").createECDH("secp384r1");
    ecdh.setPrivateKey(Buffer.from(hex.trim(), "hex"));
    process.stdout.write(ecdh.getPublicKey(null, "compressed").toString("base64"));
  });')"
[[ "$pub_pem" == "$pub_scalar" ]] && echo "derivations agree" || echo "MISMATCH"
echo "v=MCPv1; k=ecdsap384; p=$pub_pem"
```

Two independent derivations (openssl from the PEM, node from the
scalar — the same reconstruction the publish script uses at run time)
must agree before the record is trusted. The last line prints the
complete TXT value to paste into DNS.

## Step 4 — store the scalar in the keychain

```bash
security add-generic-password -U -s mcp-publisher-untype -a untype.me -w "$scalar"
[[ "$(security find-generic-password -w -s mcp-publisher-untype)" == "$scalar" ]] &&
  echo "keychain readback ok" || echo "keychain readback FAILED"
```

`-U` updates in place — a plain add fails against an existing entry,
which is how the placeholder survived a retry last time. The readback
line is the step the original loss skipped: it proves the stored value
is the scalar, not whatever an interactive prompt happened to receive.

## Step 5 — the DNS edit (operator, Spaceship panel)

Replace the value of the existing TXT record at the `untype.me` apex
that begins `v=MCPv1` with the line step 3 printed. Leave the SPF TXT
record alone. Then wait out the TTL and confirm the world sees it:

```bash
dig +short TXT untype.me | tr -d '"' | grep '^v=MCPv1'
```

The output must end with the new `p=` value. Until it does, the publish
script will fail its own keychain-vs-record check — by design, that is
the fail-early guard, not a bug.

## Step 6 — only now, delete the PEM

```bash
rm ~/mcp-publisher-rotation.pem
```

Preconditions, both from the steps above: "keychain readback ok" was
printed, and `dig` shows the new record. The keychain entry is now the
only private-key copy, which is the intended end state.

## Step 7 — prove the rotation end to end

```bash
scripts/publish-registry.sh
```

The script shape-checks the keychain entry, reconstructs its public
point, compares it against the TXT record, logs in with
`--algorithm ecdsap384`, republishes the card, and verifies the entry
is live. `login` succeeding is the proof the rotation worked. One
caveat: if the card version has not changed since the last publish, the
registry may reject the republish as a duplicate — that arrives after
login, so it does not undermine the proof; the next real publish bumps
the version anyway. `scripts/publish-registry.sh --verify` remains the
read-only check that the entry is intact.

## Machines without a keychain

Skip step 4 and export `MCP_PUBLISHER_KEY="$scalar"` instead; it is the
first source the script consults. `MCP_PUBLISHER_KEY_FILE` pointing at
a PEM is the third and last.
