# Task execution spike

This is feasibility code for PR 2. It verifies the VS Code task process boundary before the task provider is redesigned for product use. It does not replace Sotto CLI behavior: `task-probe-cli.mjs` only simulates the CLI argument contract and injects a non-secret sentinel for terminal/process checks.

## Run the probe tasks

1. Run `npm ci && npm run compile` in the extension checkout.
2. Copy `spike/tasks.example.json` to `.vscode/tasks.json` in the checkout.
3. In the **Extension Development Host's** user settings, set `sotto.cliPath` to the absolute path of `scripts/task-probe-cli.mjs`. This is only a local test override; the task itself cannot choose the CLI path.
4. Start a fresh Extension Development Host for this checkout and run each `Sotto Spike` task from **Tasks: Run Task**.

The output task checks stdout, stderr, environment presence without printing the sentinel value, the optional environment flag, and argument boundaries. The prompt task makes the fake CLI switch its task-terminal input to raw mode and read one line. Enter only a disposable test string. This confirms that input reaches the process; the automated test does not capture rendered terminal contents to independently verify echo suppression. The exit task should finish with status 17. The wait task should stop when cancelled.

## Real CLI check

Use a fresh Sotto CLI build that supports `SOTTO_DATA_DIR`, and run it from a test task with `sotto.cliPath` cleared. Set `SOTTO_DATA_DIR` to a new, disposable directory and use the included secret-free `sotto.toml`. The CLI should stop with its no-identity error before accessing the OS keychain. Do not run `sotto init` on a personal machine: the CLI stores its identity key in the operating-system keychain. The automated prompt test uses a small CLI-shaped probe, not Sotto itself. See [`RESULTS.md`](RESULTS.md) for what has and has not been run.

The exact Sotto hidden-password prompt still needs a separate test against a temporary operating-system keychain on each desktop OS. Never point the spike at a real vault or enter a real password.

## Record results

For each OS, record the desktop VS Code version, Sotto CLI version, CLI path source, each task outcome, and any terminal input, output, cancellation, or exit-status discrepancy in `RESULTS.md`. A passing extension-host test alone does not prove this behavior.
