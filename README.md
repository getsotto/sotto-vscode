# Sotto for Visual Studio Code

This repository contains the Sotto extension for desktop Visual Studio Code. It runs manually configured `sotto` tasks through the separately installed Sotto CLI in trusted, local workspace folders. Each selected folder must contain its own `sotto.toml`; tasks do not borrow a project file from a parent outside that folder. Sotto CLI 0.9.0 or newer is required.

The extension delegates credential handling to the CLI and does not bundle it. Set the machine-scoped `sotto.cliPath` setting if the CLI is not on the PATH inherited by desktop VS Code.

Add a task to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start app with Sotto",
      "type": "sotto",
      "command": "npm",
      "args": ["run", "start"],
      "problemMatcher": []
    }
  ]
}
```

Use the optional `environment` field to select a fixed environment. Keep secrets out of task labels, commands, arguments, and committed workspace files. Sotto passes decrypted values to the child process as ordinary environment variables, and that program can print or log them.

The [task execution probe](spike/README.md) and [recorded results](spike/RESULTS.md) describe platform evidence and the remaining real-CLI unlock-flow limitation.

## Development

Requirements: Node.js 22 and npm.

```sh
npm ci
npm run lint
npm run check-types
npm run compile
npm run package
```

The packaged VSIX is a build artifact and is not a supported release until Marketplace publication.
