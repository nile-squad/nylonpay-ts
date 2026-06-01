# Dev Notes

Internal notes for SDK maintainers. Not part of the public API.

## Pending: standalone signing-conformance test

**Status:** deferred.

The test that proves the SDK signs exactly what the backend verifies currently
lives in the **backend** repo (`packages/backend/src/services/sdk/signing-conformance.test.ts`),
because it imports both the SDK signer and the server verifier. This standalone
repo therefore has no self-contained guarantee that its request signing stays
compatible with the server.

**What to add here:** a test that pins the canonical payload + HMAC bytes so the
signing contract can't silently drift, without needing the backend.

It should assert:

- The signature is computed over the **inner payload** (operation input +
  `_fingerprint`), NOT the Nile envelope (`{ intent, service, action, payload }`).
- `createCanonicalPayload` sorts keys recursively, so insertion order does not
  change the signature (nested objects, arrays, unicode values).
- A frozen known-answer vector: fixed `{ secret, fingerprint, nonce, timestamp,
  payload }` → a hard-coded expected hex signature. If the algorithm changes,
  this fails loudly.
- Response verification: `verifyResponseSignature` accepts a correct signature
  and rejects a tampered payload / wrong secret (constant-time compare).

Keep it dependency-free (Node `crypto` only), matching the rest of `src`.

## Pushing changes to this repo

This repo is published from the `nylon-pay` monorepo at
`packages/sdks/typescript` via `git subtree`. From the **monorepo root**:

```sh
pnpm sdk:push
# equivalently:
git subtree push --prefix=packages/sdks/typescript sdk main
```

The `sdk` remote points at `git@github.com:nile-squad/nylonpay-ts.git`. The
subtree split filters to SDK-only changes automatically, so backend/docs commits
in the monorepo do not leak here. Commit in the monorepo first, then run the
command above.
