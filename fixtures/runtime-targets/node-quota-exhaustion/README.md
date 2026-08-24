# Runtime quota exhaustion fixture

This intentionally writes many individually small files. With the Phase 8 Docker fixture policy, each file is below the per-file limit but their aggregate exceeds the capped tmpfs workspace. A correct sandbox fails the step with `ENOSPC` and removes every container and volume.

`artifact-quota-exhaust.js` applies the same attack to the separate artifact-scratch filesystem.
