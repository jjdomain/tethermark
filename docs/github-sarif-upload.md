# Upload Tethermark SARIF To GitHub Code Scanning

Tethermark Community Edition can export SARIF so GitHub can display audit findings in the repository Security tab. This is the recommended Community Edition GitHub path because it does not require Tethermark to hold a GitHub token or post issues/comments directly.

GitHub's supported integration path for third-party scanners is SARIF upload through code scanning. See GitHub's official guide: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github

## Export SARIF Locally

After running an audit, download SARIF from the run `Exports` tab, or call the API:

```powershell
$runId = "run_example"
Invoke-RestMethod "http://127.0.0.1:8787/runs/$runId/report-sarif" |
  ConvertTo-Json -Depth 50 |
  Set-Content ".artifacts\tethermark.sarif.json"
```

The response envelope contains `report_sarif`. If your upload command expects raw SARIF, write only that property:

```powershell
$payload = Invoke-RestMethod "http://127.0.0.1:8787/runs/$runId/report-sarif"
$payload.report_sarif |
  ConvertTo-Json -Depth 50 |
  Set-Content ".artifacts\tethermark.sarif.json"
```

## GitHub Actions Upload

Add a workflow like this to upload an already generated SARIF file:

```yaml
name: Tethermark SARIF Upload

on:
  workflow_dispatch:

permissions:
  security-events: write
  contents: read

jobs:
  upload-tethermark-sarif:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Upload Tethermark SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .artifacts/tethermark.sarif.json
```

If the SARIF is produced outside the workflow, place it in the repository workspace before the upload step. For CI-generated SARIF, run the audit first, save `report_sarif` to `.artifacts/tethermark.sarif.json`, then call `github/codeql-action/upload-sarif`.

## Product Boundary

Community Edition does not create GitHub issues, post PR comments, or listen for GitHub webhooks. Use SARIF upload, manual issue/PR links in remediation items, and assistant-drafted payloads for local workflows.

Tethermark Cloud owns GitHub App installation, repository verification, issue/comment/label/check delivery, webhook sync, and automatic remediation state transitions from GitHub events.
