# Security CI

The `.github/workflows/security-scan.yml` workflow runs on every pull request to `main`, on pushes to `main`, and on a weekly schedule. Any failing job blocks the merge.

## Jobs

1. **Dependency Vulnerability Audit** — `npm audit --omit=dev --audit-level=high`. Fails on any high or critical vulnerability in production dependencies.
2. **CodeQL Static Analysis** — GitHub's CodeQL engine with the `security-extended` + `security-and-quality` query suites for JavaScript/TypeScript. Results are uploaded to the repository's Security tab.
3. **Secret Leak Scan** — Gitleaks scans the diff for committed secrets (API keys, tokens, private keys). Fails on any finding.
4. **ESLint** — Runs the project's lint rules.

## Making it a required check

To actually block merges, mark these jobs as **required status checks** on the `main` branch:

1. Open the repository on GitHub → **Settings** → **Branches**.
2. Edit (or add) the branch protection rule for `main`.
3. Enable **Require status checks to pass before merging**.
4. Select: `Dependency Vulnerability Audit`, `CodeQL Static Analysis`, `Secret Leak Scan`, `ESLint (security rules)`.
5. Save.

Without that rule, the workflow still runs and reports red on PRs but GitHub will allow the merge. With it, failing scans block the merge until fixed.

## Tuning

- To allow moderate-severity dependency findings, change `--audit-level=high` to `critical`.
- To suppress a Gitleaks false positive, add an entry to `.gitleaks.toml` at the repo root.
- CodeQL findings can be dismissed from the Security tab with a justification.
