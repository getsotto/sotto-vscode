# Sotto for Visual Studio Code

This repository contains the Sotto extension for desktop Visual Studio Code. The extension is under development; it does not yet add or run Sotto tasks. The `engines.vscode` minimum in `package.json` is provisional until the task execution prototype is tested.

The planned first release will connect VS Code tasks to a separately installed Sotto CLI. The extension is intended to delegate credential handling to the CLI and not bundle it; these boundaries will be verified as the extension is implemented.

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
