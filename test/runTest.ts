import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // The editor may export this while launching its own Node helpers. VS Code must start as an app.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const testDataRoot = mkdtempSync(path.join(os.tmpdir(), 'sotto-vscode-task-spike-'));
  const markerRoot = path.join(testDataRoot, 'markers');
  const cliData = path.join(testDataRoot, 'cli-data');
  const userData = path.join(testDataRoot, 'user-data');
  const extensionsDir = path.join(testDataRoot, 'extensions');
  const extensionRoot = path.resolve(__dirname, '../..');
  const testEnvironment = {
    SOTTO_DATA_DIR: cliData,
    SOTTO_PROBE_MARKER_ROOT: markerRoot,
    SOTTO_PROBE_RESULT: path.join(markerRoot, 'output.json'),
    SOTTO_PROBE_PROMPT_MARKER: path.join(markerRoot, 'prompt-ready'),
    SOTTO_PROBE_CLI_VERSION: 'sotto 0.9.0',
    ...(process.env.SOTTO_REAL_CLI_PATH
      ? { SOTTO_REAL_CLI_PATH: process.env.SOTTO_REAL_CLI_PATH }
      : {}),
  };
  Object.assign(process.env, testEnvironment);

  try {
    const code = await runTests({
      extensionDevelopmentPath: extensionRoot,
      extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
      launchArgs: [
        `--file-uri=${pathToFileURL(path.join(extensionRoot, 'spike/task-test.code-workspace')).toString()}`,
        '--disable-gpu',
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensionsDir}`,
      ],
      extensionTestsEnv: testEnvironment,
    });

    if (code !== 0) {
      throw new Error(`VS Code extension test host exited with code ${code}`);
    }
  } finally {
    rmSync(testDataRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
