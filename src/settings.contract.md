# Settings UI contract (Task 7)

Settings screen for provider API keys. Values are never displayed back.

## Providers (5)

Per-provider rows for `anthropic` (Anthropic), `openai` (OpenAI),
`groq` (Groq), `nvidia` (NVIDIA), `fish` (Fish Audio).

## Badge

Each row shows a Set/Unset badge sourced ONLY from the Rust command
`key_has{provider}` (boolean). The badge flips to Set after a successful
`key_set`, and back to Unset after a successful `key_remove` (verified by
re-running `key_has`).

## Test button

Each row has a Test button that calls `key_test{provider}` and renders the
boolean result as a check/cross display (`✓` on true, `✗` on false or
transport error). A dummy key is expected to FAIL (auth-fail/unreachable),
which proves the Rust provider path executes without leaking.

## Key entry rules

- The key entry is a password input with `autocomplete="new-password"`.
- The input is cleared immediately after submit (success or failure).
- The entered value is passed to exactly one `invoke("key_set")` call site
  (`key_set{provider,key}`); no other invoke carries key material.
- Keys are never rendered, never logged, never stored in JS state beyond the
  submit call.

## Zero localStorage key storage

No key material touches `localStorage` (reads or writes). Proof command:

```powershell
Select-String localStorage src/
```

must show no key writes (no matches in `src/settings.ts` or elsewhere in
`src/`).

## Command names (VERBATIM from Tasks 4–5)

- `key_set{provider,key}` — store a provider key in the OS keyring.
- `key_has{provider}` — boolean: is a key stored?
- `key_remove{provider}` — delete the stored key.
- `key_test{provider}` — boolean probe (true = valid, false = auth-fail,
  Err = transport failure).
