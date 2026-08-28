# Least-Privilege Shared-Service Deployment

This guide is for a small trusted team running one Tethermark Community Edition instance. Community Edition does not provide per-user identity, tenant isolation, or role-based access control. Anyone who knows the instance API key is a Tethermark administrator and can start audits, change settings, and read locally retained audit data. Use a Cloud deployment or a separate instance when users are not mutually trusted.

The checked-in examples preserve the existing web UI and provider choices. They change only process identity, storage paths, and operating-system containment. A personal OpenAI Codex/ChatGPT session remains the default for an interactive workstation. Do not copy a person's Codex session cache into a service account or use it for unattended jobs; configure an API-key model provider for a continuously running shared service.

## Filesystem and process contract

Use one dedicated, non-administrator operating-system account. No human should sign in as that account.

| Path | Owner | Access | Purpose |
| --- | --- | --- | --- |
| `/opt/tethermark` or `C:\Program Files\Tethermark` | root/Administrators | service account read/execute only | Verified release checkout, dependencies, compiled application, managed tools. |
| `/var/lib/tethermark` or `C:\ProgramData\Tethermark` | service account | service account and OS administrators only | SQLite, audit artifacts, sandboxes, maintenance state, and protected configuration. |
| `.../config/tethermark.env` | service account | owner read/write only; administrators retain recovery access on Windows | API/model credentials and service settings. |

Set these variables for every service process:

```text
HARNESS_ENV_FILE=<protected-data-root>/config/tethermark.env
HARNESS_ARTIFACT_ROOT=<protected-data-root>/artifacts
HARNESS_LOCAL_DB_ROOT=<protected-data-root>/state/local-db
```

`HARNESS_ARTIFACT_ROOT` moves run artifacts, sandboxes, the run index, benchmarks, runtime-readiness evidence, and maintenance state together. `HARNESS_LOCAL_DB_ROOT` may be placed separately, but it should stay under the same protected data root unless an operator has a documented reason. Tethermark creates Unix data directories and files with owner-only modes; the installation commands below establish the parent boundary and Windows ACL.

Keep the checkout immutable while the service runs. Stop the process before updates, run the ref-pinned updater as an administrator, verify the release, and start the process again. Do not make the service account an Administrator, add it to `sudo`, or grant it write access to the application checkout.

## Network boundary

The examples keep the API and UI on `127.0.0.1`. For team access, place a separately maintained TLS reverse proxy on the same host, require the Tethermark API key, and restrict ingress with a firewall or private network. Do not expose ports 8787 or 8788 directly to the Internet.

Generate a unique random API key of at least 32 characters and store it only in the protected environment file. Set `HARNESS_API_AUTH_MODE=api_key`. Every key holder is an administrator; use a password manager and rotate the key when a holder leaves the team.

If the application itself must bind to a non-loopback interface, the existing fail-closed policy also requires the exact `HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT` documented in [Installation](./installation.md). The acknowledgement does not add TLS or authorization roles.

## Ubuntu systemd example

The unit in [`deploy/systemd/tethermark.service`](../deploy/systemd/tethermark.service) runs without Linux capabilities, keeps the release checkout read-only, gives the process one owner-only state directory, and enables systemd's filesystem, device, namespace, kernel, and privilege-escalation protections. It is intentionally a static-audit baseline and does not expose a Docker socket.

After installing a verified release at `/opt/tethermark`, create the account and protected data tree:

```bash
sudo useradd --system --home-dir /var/lib/tethermark --shell /usr/sbin/nologin tethermark
sudo install -d -o root -g tethermark -m 0750 /opt/tethermark
sudo chown -R root:tethermark /opt/tethermark
sudo chmod -R u=rwX,g=rX,o= /opt/tethermark
sudo install -d -o tethermark -g tethermark -m 0700 /var/lib/tethermark/config
sudo install -o tethermark -g tethermark -m 0600 deploy/systemd/tethermark.env.example /var/lib/tethermark/config/tethermark.env
sudo install -o root -g root -m 0644 deploy/systemd/tethermark.service /etc/systemd/system/tethermark.service
sudoedit /var/lib/tethermark/config/tethermark.env
sudo systemctl daemon-reload
sudo systemctl enable --now tethermark.service
sudo systemctl status tethermark.service
```

Use `journalctl -u tethermark.service`; do not redirect logs into the checkout. Run `systemd-analyze security tethermark.service` after local unit changes. Distribution-specific hardening scores are advisory; the checked-in regression enforces the required directives.

The service has no access to user home directories. Audit repository URLs through Tethermark's bounded clone path, or place administrator-reviewed local source under a separate read-only service-readable directory. Never grant the service access to SSH private keys or a personal Codex cache.

## macOS launchd example

Real macOS service execution is not release-certified yet. [`deploy/launchd/dev.tethermark.community.plist`](../deploy/launchd/dev.tethermark.community.plist) is a reviewed least-privilege template, not evidence of a passing native macOS service test.

Create a hidden `_tethermark` service account with a non-login shell using your organization's macOS account-management process. Install the release at `/opt/tethermark`, place an administrator-approved Node binary at `/opt/tethermark/bin/node`, make the checkout `root:_tethermark` and read/execute-only to the service account, and create `/var/lib/tethermark` as `_tethermark:_tethermark` mode `0700`. Copy the protected environment example from `deploy/systemd`, set it to mode `0600`, and install the plist as `/Library/LaunchDaemons/dev.tethermark.community.plist` owned by `root:wheel` mode `0644`.

Validate and load only after replacing configuration values:

```bash
sudo plutil -lint /Library/LaunchDaemons/dev.tethermark.community.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/dev.tethermark.community.plist
sudo launchctl print system/dev.tethermark.community
```

Do not run this as a LaunchAgent in a maintainer's login session: that would inherit broader user access and blur the service credential boundary.

## Windows scheduled-task example

Tethermark is a normal foreground Node process, not a native Windows Service executable. The supported no-cost example uses Task Scheduler under a dedicated standard local account. Do not point Service Control Manager directly at `node.exe`; Node does not implement the Windows service control protocol.

Create a non-administrator `tethermark-svc` account with a random managed password. Install the verified checkout at `C:\Program Files\Tethermark`, create `C:\ProgramData\Tethermark`, and run these ACL commands from an elevated PowerShell terminal after resolving the exact paths:

```powershell
icacls "C:\Program Files\Tethermark" /inheritance:r
icacls "C:\Program Files\Tethermark" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "tethermark-svc:(OI)(CI)RX"
icacls "C:\ProgramData\Tethermark" /inheritance:r
icacls "C:\ProgramData\Tethermark" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "tethermark-svc:(OI)(CI)M"
```

Copy [`deploy/windows/tethermark.env.example`](../deploy/windows/tethermark.env.example) to `C:\ProgramData\Tethermark\config\tethermark.env`, replace the blank key/model values, and confirm with `icacls` that ordinary `Users` and `Authenticated Users` have no inherited access.

Create an **At startup** task whose executable is `powershell.exe` and whose argument list is equivalent to:

```text
-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Program Files\Tethermark\deploy\windows\start-tethermark.ps1" -InstallDir "C:\Program Files\Tethermark" -DataDir "C:\ProgramData\Tethermark" -NodePath "C:\Program Files\nodejs\node.exe"
```

Configure the task to run as `tethermark-svc` whether or not the account is logged on, use **Run with highest privileges: off**, restart on failure, and stop cleanly on shutdown. Task Scheduler protects the stored account password. The launcher validates its exact install, Node, entrypoint, and configuration paths before starting and does not invoke a command shell.

## Runtime validation and privileges

Do not grant a shared service access to a rootful Docker socket; membership in the Docker administrators/group boundary is effectively host-administrator authority. The checked-in systemd unit therefore blocks device and namespace access and is for static audits by default.

If runtime validation is required, use a separately reviewed rootless Podman account and policy, keep its writable runtime state outside the release checkout, and rerun `runtime-doctor` plus the native fixture gate under the exact service identity. Windows Docker Desktop and macOS Docker Desktop are interactive desktop boundaries and are not part of this unattended service example. Continue to use the normal interactive application for subscription-backed Codex runtime work.

## Verification

From the release checkout, run:

```bash
npm run test:service-deployment
npm run scan -- doctor --json
```

The regression checks the external artifact/environment path contract and statically enforces the dedicated identities, read-only checkout boundary, owner-only masks, no-capability systemd baseline, launchd account, and limited Windows launcher. On the target host, independently inspect effective ownership/ACLs, the actual service identity, listening addresses, and reverse-proxy policy before allowing team access.
