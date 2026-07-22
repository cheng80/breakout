---
name: nas-web-build
description: Build and deploy the Breakout Vite web output to NAS, then verify remote hashes and zip cleanup. Trigger phrases: "나스웹빌드 해줘", "나스 웹 빌드", "NAS 웹 배포".
---

# NAS Web Build

Use this skill only from the Breakout repository root.

## Workflow

1. Keep deployment secrets in `.env` (ignored by Git) or pass them as command-line options. `.env.local` can also be selected with `--env-file`. Required values are:

```dotenv
BREAKOUT_DEPLOY_URL=https://cheng80.myqnapcloud.com/deploy_breakout.php
BREAKOUT_DEPLOY_TOKEN=the_same_token_as_/share/Web/.breakout_deploy.env
BREAKOUT_PUBLIC_URL=https://cheng80.myqnapcloud.com/breakout/
BREAKOUT_ZIP_URL=https://cheng80.myqnapcloud.com/breakout.zip
```

2. Run the deployment script:

```bash
tools/deploy_breakout_web.sh
```

The script runs `npm run build -- --base=/breakout/`, renames `dist/` to `breakout/`, creates `breakout.zip`, uploads it, and removes the local zip after a successful response. The NAS endpoint extracts `breakout/`, checks `breakout/index.html`, and removes `/share/Web/breakout.zip`.

3. Verify the public entrypoint, every local package file, and remote zip cleanup:

```bash
tools/verify_breakout_web.sh
```

The verifier prints `OK`, `MISS`, or `DIFF` for every file under `breakout/`, checks that `/breakout/` responds with HTTP 200, and expects the uploaded zip URL to return HTTP 404.

4. The server-side endpoint is `server/deploy_breakout.php`. Upload it to `/share/Web/deploy_breakout.php` and store the matching token in `/share/Web/.breakout_deploy.env` with restrictive permissions.

## Reporting

Report the build/deploy result, public entrypoint status, hash comparison summary, and zip cleanup result. Never print env files, tokens, or passwords.
