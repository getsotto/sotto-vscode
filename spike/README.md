# Task execution spike

These fixtures record the PR 2 process-boundary experiment and continue to exercise the production task resolver. They do not replace Sotto CLI behaviour: `task-probe-cli.mjs` only simulates the CLI argument contract and injects a non-secret sentinel for terminal/process checks.

## Run the probe tasks

1. Run `npm ci && npm run compile` in the extension checkout.
2. Open `spike/task-probe.code-workspace` in a fresh Extension Development Host. It contains two valid project folders with the probe tasks already configured.
3. In the **Extension Development Host's** user settings, set `sotto.cliPath` to the absolute path of `scripts/task-probe-cli.mjs` (or `scripts/task-probe-cli.cmd` on Windows). This is only a local test override; task data cannot choose the CLI path.
4. Run each `Sotto Spike` task from **Tasks: Run Task**.

The output task checks stdout, stderr, environment presence without printing the sentinel value, the optional environment flag, and argument boundaries. The prompt task makes the fake CLI switch its task-terminal input to raw mode and read one line. Enter only a disposable test string. This confirms that input reaches the process; the automated test does not capture rendered terminal contents to independently verify echo suppression. The exit task should finish with status 17. The wait task should stop when cancelled.

## Real CLI check

Build or install a fresh Sotto CLI that supports `SOTTO_DATA_DIR`, then pass its absolute executable path to the optional real-CLI test: `SOTTO_REAL_CLI_PATH=/absolute/path/to/sotto npm test` (on Windows, use the platform's environment-variable syntax). The harness creates a new, disposable data directory and uses the included secret-free `sotto.toml`. The task should stop with its no-identity error before accessing the OS keychain. Do not run `sotto init` on a personal machine: the CLI stores its identity key in the operating-system keychain. The automated unlock-prompt test still uses a CLI-shaped probe, not Sotto itself. See [`RESULTS.md`](RESULTS.md) for what has and has not been run.

The exact Sotto hidden-password prompt still needs a separate test against a temporary operating-system keychain on each desktop OS. Never point the spike at a real vault or enter a real password.

## Record results

For each OS, record the desktop VS Code version, Sotto CLI version, CLI path source, each task outcome, and any terminal input, output, cancellation, or exit-status discrepancy in `RESULTS.md`. A passing extension-host test alone does not prove this behaviour.
