# Security policy

## Reporting a vulnerability

Do not open a public issue for security problems. Email **layerum@layerum.com** with:

- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- the version or commit you tested

We will acknowledge your report and keep you informed while we work on a fix. Please give us reasonable time to release a fix before disclosing the issue publicly.

## Scope

This policy covers the code in this repository and the hosted service at layerum.com. For a self-hosted installation, problems caused by its own configuration (exposed ports, weak secrets, missing TLS) are the operator's responsibility, but we still want to hear about defaults that make such mistakes easy.

## Hardening a self-hosted installation

- Generate secrets with `docker/generate-secrets.sh` and never reuse the example values.
- Keep `docker/.env` private. It holds database passwords and signing keys.
- Expose only the web app, API, Supabase gateway and file storage, and only through a TLS reverse proxy.
- Set `DISABLE_SIGNUP=true` once your users have accounts, if you do not want open registration.
- Back up the database volume and `ENCRYPTION_KEY`. Encrypted provider keys cannot be recovered without it.
