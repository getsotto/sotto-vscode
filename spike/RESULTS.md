# Task execution spike results

This record separates automated process-boundary checks from real Sotto CLI and desktop validation. The probe CLI is deliberately fake and must not be cited as proof of actual Sotto unlock behaviour.

## macOS arm64

- Host: macOS arm64; desktop VS Code 1.138.0; extension test host downloaded VS Code 1.142.0; Node.js 22.
- CLI in automated task tests: `scripts/task-probe-cli.mjs`, selected via the machine-scoped `sotto.cliPath` setting. It is not Sotto.
- Automated VS Code extension-host tests: 4 passed. They exercised argument boundaries, stdout/stderr, child environment, raw-mode task-terminal input, exit code 17, and task cancellation.
- Real CLI build: Sotto 0.9.0 built from the local Sotto checkout. A direct invocation from the fixture with a fresh `SOTTO_DATA_DIR` and empty stdin returned the expected no-identity error (exit 4).
- Real CLI from VS Code task: not verified. An earlier attempt did not complete within 30 seconds; it was stopped before input or credentials were supplied. The installed user CLI was not used after its data-directory isolation behaviour proved unclear.
- Actual Sotto unlock prompt, visible terminal echo behaviour, and restricted-workspace runtime behaviour: not verified.
- The declared minimum VS Code version (`^1.85.0`) was not tested; the extension test host used 1.142.0.

## Windows and Linux

The `desktop-task-smoke` GitHub Actions matrix passed on 15 October 2026 for `macos-latest`, `windows-latest`, and `ubuntu-latest`. Each job used Node.js 22 and the VS Code 1.142.0 extension test host. The Windows job also confirmed that `ProcessExecution` launches the probe through its `.cmd` shim. See the [matrix run](https://github.com/getsotto/sotto-vscode/actions/runs/38719518388).

These are hosted extension-test environments running a fake CLI; they do not count as manual desktop checks or prove the real Sotto CLI's unlock flow. Windows/Linux desktop VS Code and CLI versions, GUI PATH lookup, keychain isolation, and actual prompt behaviour remain unverified.

## Acceptance gaps

This spike establishes a VS Code task provider shape and exercises a fake CLI process on macOS. It does not pass the planned real-CLI hidden-unlock gate. Before treating task execution as product-ready, verify the real CLI prompt against isolated temporary keychain state on each supported desktop OS, confirm terminal echo behaviour, and record Windows/Linux results. Never use a real vault, real Sotto identity, or personal master password for this check.
