# Sotto for Visual Studio Code

This repository contains the Sotto extension for desktop Visual Studio Code. The current task provider is an execution spike: it resolves manually configured `sotto` tasks and runs them through the separately installed Sotto CLI. The provider is disabled in untrusted workspaces.

The extension delegates credential handling to the CLI and does not bundle it. The task contract and the limits of the current verification are recorded in [`spike/README.md`](spike/README.md) and [`spike/RESULTS.md`](spike/RESULTS.md). This spike does not establish full product readiness or verify the real Sotto unlock prompt.

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
