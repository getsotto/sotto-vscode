import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const extensionId = 'getsotto.sotto-vscode';
const labels = {
  output: 'Sotto Spike: output and argument boundaries',
  prompt: 'Sotto Spike: task-terminal input',
  exit: 'Sotto Spike: exit status',
  cancel: 'Sotto Spike: cancellation',
};

suite('Sotto task execution spike', () => {
  suiteSetup(async () => {
    assert.ok(vscode.workspace.isTrusted, 'the test workspace must be trusted');
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `extension ${extensionId} is installed in the test host`);
    await extension.activate();

    const markerRoot = process.env.SOTTO_PROBE_MARKER_ROOT;
    assert.ok(markerRoot, 'the test runner supplies an isolated marker directory');
    fs.mkdirSync(markerRoot, { recursive: true });
    assert.ok(process.env.SOTTO_PROBE_RESULT, 'the test runner supplies a result marker path');
    assert.ok(process.env.SOTTO_PROBE_PROMPT_MARKER, 'the test runner supplies a prompt marker path');

    const cliPath = path.resolve(
      extension.extensionPath,
      'scripts',
      process.platform === 'win32' ? 'task-probe-cli.cmd' : 'task-probe-cli.mjs',
    );
    await vscode.workspace.getConfiguration('sotto').update(
      'cliPath',
      cliPath,
      vscode.ConfigurationTarget.Global,
    );
  });

  suiteTeardown(async () => {
    await vscode.workspace.getConfiguration('sotto').update(
      'cliPath',
      undefined,
      vscode.ConfigurationTarget.Global,
    );
  });

  test('uses ProcessExecution with separate arguments and preserves ordinary output', async () => {
    const task = await findTask(labels.output);
    const ended = waitForEnd(labels.output);
    await vscode.tasks.executeTask(task);
    assert.equal(await ended, 0);

    const resultPath = process.env.SOTTO_PROBE_RESULT;
    assert.ok(resultPath && fs.existsSync(resultPath));
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
      args: string[];
      dataDirectory: string;
      environment: string;
      sentinelPresent: boolean;
    };
    assert.deepEqual(result.args, [
      'argument with spaces',
      "quote ' and shell ; characters",
    ]);
    assert.equal(result.dataDirectory, process.env.SOTTO_DATA_DIR);
    assert.equal(result.environment, 'spike');
    assert.equal(result.sentinelPresent, true);
    assert.equal(JSON.stringify(result).includes('local-test-only'), false);
  });

  test('forwards task-terminal input while the CLI uses raw mode', async () => {
    const marker = process.env.SOTTO_PROBE_PROMPT_MARKER;
    assert.ok(marker);
    fs.rmSync(marker, { force: true });

    const task = await findTask(labels.prompt);
    const ended = waitForEnd(labels.prompt);
    await vscode.tasks.executeTask(task);
    await waitForFile(marker);

    const terminal = vscode.window.activeTerminal;
    assert.ok(terminal, 'VS Code exposes the running task terminal');
    terminal.sendText('disposable-test-input');
    assert.equal(await ended, 0);
  });

  test('propagates the child process exit code', async () => {
    const task = await findTask(labels.exit);
    const ended = waitForEnd(labels.exit);
    await vscode.tasks.executeTask(task);
    assert.equal(await ended, 17);
  });

  test('terminates a running task when cancelled', async () => {
    const task = await findTask(labels.cancel);
    let execution: vscode.TaskExecution | undefined;
    const started = new Promise<void>((resolve) => {
      const subscription = vscode.tasks.onDidStartTaskProcess((event) => {
        if (event.execution.task.name === labels.cancel) {
          subscription.dispose();
          execution = event.execution;
          resolve();
        }
      });
    });
    const ended = waitForEnd(labels.cancel);

    await vscode.tasks.executeTask(task);
    await started;
    assert.ok(execution);
    execution.terminate();
    await ended;
  });

});

async function findTask(label: string): Promise<vscode.Task> {
  const tasks = await vscode.tasks.fetchTasks({ type: 'sotto' });
  const task = tasks.find((candidate) => candidate.name === label);
  assert.ok(task, `VS Code provides the manually configured task “${label}”`);
  return task;
}

function waitForEnd(label: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const subscription = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task.name === label) {
        subscription.dispose();
        resolve(event.exitCode);
      }
    });
  });
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('task did not reach its hidden-input prompt');
}
