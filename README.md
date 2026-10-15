# Sotto for Visual Studio Code

Sotto adds a task type for running a program through the separately installed Sotto CLI. Create tasks from the Command Palette or edit `.vscode/tasks.json` yourself, then run them through the VS Code task interface.

> [!WARNING]
> Sotto is pre-1.0 and has not undergone a third-party cryptographic audit. It is intended for development and staging use. Keep critical production secrets elsewhere until an audit has been completed. Read the [Sotto security guidance](https://github.com/getsotto/sotto/blob/main/SECURITY.md).

## Requirements and compatibility

- Desktop Visual Studio Code 1.85 or newer. The extension declares `^1.85.0` as its engine range.
- Sotto CLI 0.9.0 or newer, installed separately.
- A trusted, local workspace folder containing its own `sotto.toml`.

The extension targets desktop VS Code on macOS, Windows and Linux. Hosted extension tests pass on all three platforms with VS Code 1.142.0 and a probe CLI. A real Sotto CLI check has run on macOS only, and stopped at the expected missing-identity error before keychain access. The declared VS Code minimum, desktop Windows and Linux behaviour, and the real CLI unlock prompt and terminal echo have not been verified. See the [platform test record](https://github.com/getsotto/sotto-vscode/blob/main/spike/RESULTS.md).

Remote SSH, WSL, dev containers and VS Code for the Web are not supported.

## Install

The extension is not yet published to the Visual Studio Marketplace. Until the first Marketplace release, you can build and install a local preview:

1. Install Node.js 22 and clone this repository.
2. From the repository directory, run `npm ci` and `npm run package`.
3. In VS Code, run **Extensions: Install from VSIX...** and select `sotto-vscode-0.0.1.vsix`.

Install the Sotto CLI separately using its [installation instructions](https://github.com/getsotto/sotto#install). After the extension is published, search the Marketplace for **Sotto** by **getsotto**.

## Set up and add a task

1. Check that `sotto --version` reports 0.9.0 or newer. If VS Code cannot find the CLI on its `PATH`, set the absolute path in the machine-scoped `sotto.cliPath` setting. For example, add this to your user `settings.json`:

   ```json
   {
     "sotto.cliPath": "/absolute/path/to/sotto"
   }
   ```

   On Windows, use an absolute path to the installed CLI and escape backslashes in JSON strings.

2. Open a trusted local workspace folder containing `sotto.toml`. Each folder in a multi-root workspace needs its own project file.
3. Run **Sotto: Add Task** from the Command Palette. In a multi-root workspace, select the folder for the task. Enter a label and executable, add arguments one at a time, then choose the project default environment or enter a fixed environment.
4. Review the generated `.vscode/tasks.json`. Run the task with **Tasks: Run Task** and select its label.

The command updates an existing Sotto task with the same label. If another task already uses that label, it reports the conflict. It preserves JSONC comments and unrelated task entries, and leaves malformed task files unchanged.

You can also write the task by hand:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Run checks with Sotto",
      "type": "sotto",
      "command": "npm",
      "args": ["run", "checks"],
      "environment": "staging",
      "problemMatcher": []
    }
  ]
}
```

Omit `environment` to use the environment configured as the project default in `sotto.toml`. Arguments are passed as separate values, so an argument containing spaces remains one argument.

## Security and workspace trust

Task labels, executable names, arguments and environment names are saved in `.vscode/tasks.json`. That file may be committed and read by collaborators and workspace tools. Do not put passwords, secret values or other credentials in task fields.

The extension does not read the vault or handle passwords. It starts the Sotto CLI, which owns identity, unlocking, decryption and environment injection. Decrypted values are passed to the task program as ordinary environment variables. The extension passes normal task output through without redaction, so a program can print or log those values.

Sotto commands and tasks are unavailable in Restricted Mode. Trust a workspace only when you understand and trust its contents.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| VS Code cannot start Sotto, or reports an old version | Run `sotto --version` in a terminal. Install CLI 0.9.0 or newer. A GUI-launched VS Code may have a different `PATH`; set the local absolute executable path in the machine-scoped `sotto.cliPath` setting. |
| The task cannot find `sotto.toml` | Select the workspace folder that contains the project file. Each selected folder needs its own `sotto.toml`; task discovery does not search parent folders. Use `sotto init` only when creating a new project. |
| The CLI reports that no local identity exists | Run `sotto status` in the project folder. For a new identity, follow the CLI's `sotto init` guidance and keep the printed Emergency Kit safe. To restore an existing identity on a device, follow the CLI's `sotto setup` guidance and use its Emergency Kit. |
| The vault is locked or task-terminal input does not work | The CLI owns the unlock prompt. Stop the task if the prompt cannot be completed, then check the same CLI command in a regular terminal. The real unlock prompt and terminal echo have not yet been verified in desktop VS Code. Never put a password in task arguments, environment names or settings. |
| The command or task is unavailable | Check that the workspace is trusted and is a local desktop VS Code workspace. Restricted Mode disables Sotto task execution and task creation. |

## Scope

This extension runs configured local tasks. It does not install the CLI, browse or edit vault contents, integrate directly with the debugger, or support remote workspace hosts.

The Sotto project is pre-1.0 and its cryptography has not received a third-party audit. Read the project's [security guidance](https://github.com/getsotto/sotto/blob/main/SECURITY.md) before relying on it.
