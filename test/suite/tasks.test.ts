import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'jsonc-parser';
import * as vscode from 'vscode';
import { taskAuthoringProblem, taskContextProblem } from '../../src/task-policy';

const extensionId = 'getsotto.sotto-vscode';
const labels = {
  invalid: 'Sotto PR3: invalid task definition',
  parentProject: 'Sotto PR3: parent project must not be used',
  invalidEnvironment: 'Sotto PR3: blank environment',
  output: 'Sotto Spike: output and argument boundaries',
  prompt: 'Sotto Spike: task-terminal input',
  exit: 'Sotto Spike: exit status',
  cancel: 'Sotto Spike: cancellation',
  secondFolder: 'Sotto PR3: second workspace folder',
};

suite('Sotto task execution', () => {
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

  test('rejects invalid task data and projects outside the selected folder', async () => {
    const { messages, result: tasks } = await captureErrors(() =>
      Promise.resolve(vscode.tasks.fetchTasks({ type: 'sotto' })),
    );
    const names = tasks.map((task) => task.name);

    assert.ok(messages.some((message) => /non-empty executable/.test(message)));
    assert.ok(messages.some((message) => /environment.*non-empty string/.test(message)));
    assert.ok(messages.some((message) => /sotto\.toml.*outside that folder/.test(message)));
    assert.equal(names.includes(labels.invalid), false);
    assert.equal(names.includes(labels.invalidEnvironment), false);
    assert.equal(names.includes(labels.parentProject), false);
    assert.ok(
      names.includes(labels.output),
      `valid task resolves with the configured CLI; notifications: ${messages.join(' | ')}`,
    );
  });

  test('blocks task resolution in untrusted and non-local workspaces', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionPath(), 'package.json'), 'utf8'),
    ) as {
      capabilities: { untrustedWorkspaces: { supported: boolean } };
      contributes: {
        commands: Array<{
          command: string;
          title?: string;
          category?: string;
          enablement: string;
        }>;
        configuration: { properties: { 'sotto.cliPath': { scope: string } } };
        menus: { commandPalette: Array<{ command: string; when: string }> };
      };
    };

    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
    assert.equal(manifest.contributes.configuration.properties['sotto.cliPath'].scope, 'machine');
    assert.equal(taskAuthoringProblem(false), 'Trust this workspace before adding a Sotto task.');
    assert.equal(taskAuthoringProblem(true), undefined);
    assert.deepEqual(
      {
        command: manifest.contributes.commands[0].command,
        title: manifest.contributes.commands[0].title,
        category: manifest.contributes.commands[0].category,
        enablement: manifest.contributes.commands[0].enablement,
      },
      {
        command: 'sotto.addTask',
        title: 'Add Task',
        category: 'Sotto',
        enablement: 'isWorkspaceTrusted',
      },
    );
    assert.deepEqual(manifest.contributes.menus.commandPalette[0], {
      command: 'sotto.addTask',
      when: 'isWorkspaceTrusted',
    });
    assert.match(taskContextProblem(false, { scheme: 'file' }) ?? '', /Trust this workspace/);
    assert.equal(taskContextProblem(true, { scheme: 'file' }), undefined);
    assert.match(taskContextProblem(true, { scheme: 'vscode-remote' }) ?? '', /local desktop/);
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

  test('uses the selected workspace folder for project discovery and child cwd', async () => {
    const task = await findTask(labels.secondFolder);
    const ended = waitForEnd(labels.secondFolder);
    await vscode.tasks.executeTask(task);
    assert.equal(await ended, 0);

    const resultPath = process.env.SOTTO_PROBE_RESULT;
    assert.ok(resultPath && fs.existsSync(resultPath));
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
      args: string[];
      cwd: string;
      environment: string;
    };
    assert.deepEqual(result.args, ['folder-scope']);
    assert.equal(result.environment, '');
    assert.equal(
      path.resolve(result.cwd),
      path.resolve(extensionPath(), 'spike/workspace-two'),
    );
  });

  test('runs the real CLI with isolated data before reporting missing identity', async function () {
    const realCliPath = process.env.SOTTO_REAL_CLI_PATH;
    if (!realCliPath) this.skip();

    const configuration = vscode.workspace.getConfiguration('sotto');
    const previousPath = configuration.get<string>('cliPath', '');
    await configuration.update('cliPath', realCliPath, vscode.ConfigurationTarget.Global);
    try {
      const task = await findTask(labels.output);
      const started = waitForTaskStart(labels.output);
      const ended = waitForEnd(labels.output);
      await vscode.tasks.executeTask(task);
      const execution = await started;
      assert.equal(await waitForEndOrTerminate(ended, execution, 5_000), 4);
    } finally {
      await configuration.update('cliPath', previousPath, vscode.ConfigurationTarget.Global);
    }
  });

  test('explains how to configure Sotto when the CLI cannot be started', async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension);
    const missingCli = path.join(extension.extensionPath, 'scripts', 'missing-sotto-cli');
    await vscode.workspace.getConfiguration('sotto').update(
      'cliPath',
      missingCli,
      vscode.ConfigurationTarget.Global,
    );

    try {
      const { messages, result: tasks } = await captureErrors(async () => {
        return vscode.tasks.fetchTasks({ type: 'sotto' });
      });

      assert.ok(
        messages.some((message) => /sotto\.cliPath/.test(message) && /PATH/.test(message)),
      );
      assert.equal(tasks.length, 0);
    } finally {
      const probeCli = path.resolve(
        extension.extensionPath,
        'scripts',
        process.platform === 'win32' ? 'task-probe-cli.cmd' : 'task-probe-cli.mjs',
      );
      await vscode.workspace.getConfiguration('sotto').update(
        'cliPath',
        probeCli,
        vscode.ConfigurationTarget.Global,
      );
    }
  });

  test('rejects a CLI version below the supported minimum with upgrade guidance', async () => {
    process.env.SOTTO_PROBE_CLI_VERSION = 'sotto 0.8.9';
    try {
      const { messages, result: tasks } = await captureErrors(() =>
        Promise.resolve(vscode.tasks.fetchTasks({ type: 'sotto' })),
      );
      assert.equal(tasks.length, 0);
      const versionMessage = messages.find((message) => /requires 0\.9\.0 or newer/.test(message));
      assert.ok(versionMessage, `shows the minimum version guidance; notifications: ${messages.join(' | ')}`);
      assert.equal(versionMessage.includes('local-test-only'), false);
    } finally {
      process.env.SOTTO_PROBE_CLI_VERSION = 'sotto 0.9.0';
    }
  });

  test('does not accept a prerelease of the minimum CLI version', async () => {
    process.env.SOTTO_PROBE_CLI_VERSION = 'sotto 0.9.0-rc.1';
    try {
      const { messages, result: tasks } = await captureErrors(() =>
        Promise.resolve(vscode.tasks.fetchTasks({ type: 'sotto' })),
      );
      assert.equal(tasks.length, 0);
      assert.ok(messages.some((message) => /Sotto CLI 0\.9\.0-rc\.1 is too old/.test(message)));
    } finally {
      process.env.SOTTO_PROBE_CLI_VERSION = 'sotto 0.9.0';
    }
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

  test('adds a task to the chosen folder while preserving edits made during prompts', async () => {
    const root = path.join(extensionPath(), 'spike', 'workspace-two');
    const tasksPath = path.join(root, '.vscode', 'tasks.json');
    const originalTasks = fs.readFileSync(tasksPath, 'utf8');

    try {
      const information: string[] = [];
      await runAddTaskCommand({
        folderPath: root,
        values: ['Run checks', 'npm', 'run checks with spaces'],
        argumentCount: 1,
        beforeEnvironmentChoice: async () => {
          const userDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(tasksPath));
          const userEditor = await vscode.window.showTextDocument(userDocument);
          const concurrentEdit = [
            '{',
            '  // Added while the prompts were open.',
            '  "version": "2.1.0",',
            '  "tasks": [{"label":"Keep this task","type":"shell","command":"echo keep"}]',
            '}',
            '',
          ].join('\n');
          const applied = await userEditor.edit((builder) => {
            builder.replace(
              new vscode.Range(userDocument.positionAt(0), userDocument.positionAt(userDocument.getText().length)),
              concurrentEdit,
            );
          });
          assert.equal(applied, true);
          assert.equal(await userDocument.save(), true);
        },
        information,
      });

      const document = fs.readFileSync(tasksPath, 'utf8');
      const configuration = parse(document) as {
        version: string;
        tasks: Array<Record<string, unknown>>;
      };
      assert.match(document, /Added while the prompts were open/);
      assert.equal(configuration.version, '2.1.0');
      assert.equal(configuration.tasks.length, 2);
      assert.equal(configuration.tasks[0].label, 'Keep this task');
      assert.equal(configuration.tasks[1].label, 'Run checks');
      assert.equal(configuration.tasks[1].type, 'sotto');
      assert.equal(configuration.tasks[1].command, 'npm');
      assert.deepEqual(configuration.tasks[1].args, ['run checks with spaces']);
      assert.equal('environment' in configuration.tasks[1], false);
      assert.ok(information.some((message) => message.startsWith('Added Sotto task')));
      assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, tasksPath);

      await runAddTaskCommand({
        folderPath: root,
        values: ['Run checks', 'pnpm', 'staging'],
        argumentCount: 0,
        environment: 'staging',
        information,
      });

      const updatedDocument = fs.readFileSync(tasksPath, 'utf8');
      const updatedConfiguration = parse(updatedDocument) as {
        tasks: Array<Record<string, unknown>>;
      };
      assert.equal(updatedConfiguration.tasks.length, 2);
      assert.equal(updatedConfiguration.tasks[1].command, 'pnpm');
      assert.deepEqual(updatedConfiguration.tasks[1].args, []);
      assert.equal(updatedConfiguration.tasks[1].environment, 'staging');
      assert.ok(information.some((message) => message.startsWith('Updated Sotto task')));

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      const malformed = '{ "tasks": [ ';
      const errors: string[] = [];
      await runAddTaskCommand({
        folderPath: root,
        values: ['Run checks', 'npm'],
        argumentCount: 0,
        errors,
        beforeEnvironmentChoice: async () => {
          const userDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(tasksPath));
          const userEditor = await vscode.window.showTextDocument(userDocument);
          const applied = await userEditor.edit((builder) => {
            builder.replace(
              new vscode.Range(userDocument.positionAt(0), userDocument.positionAt(userDocument.getText().length)),
              malformed,
            );
          });
          assert.equal(applied, true);
          assert.equal(await userDocument.save(), true);
        },
      });
      assert.equal(fs.readFileSync(tasksPath, 'utf8'), malformed);
      assert.ok(
        errors.some((message) => /malformed and was left unchanged/.test(message)),
        `reports the malformed file; notifications: ${errors.join(' | ')}`,
      );
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      fs.writeFileSync(tasksPath, originalTasks);
    }
  });

});

async function findTask(label: string): Promise<vscode.Task> {
  const tasks = await vscode.tasks.fetchTasks({ type: 'sotto' });
  const task = tasks.find((candidate) => candidate.name === label);
  assert.ok(task, `VS Code provides the manually configured task “${label}”`);
  return task;
}

function extensionPath(): string {
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension);
  return extension.extensionPath;
}

interface TaskAuthoringUiOptions {
  folderPath: string;
  values: string[];
  argumentCount: number;
  environment?: string;
  beforeEnvironmentChoice?: () => void | Promise<void>;
  information?: string[];
  errors?: string[];
}

async function runAddTaskCommand(options: TaskAuthoringUiOptions): Promise<void> {
  const windowApi = vscode.window as unknown as {
    showWarningMessage: (...args: unknown[]) => Promise<unknown>;
    showInputBox: (options: { prompt?: string }) => Promise<string | undefined>;
    showQuickPick: (
      items: readonly vscode.QuickPickItem[],
      options?: { placeHolder?: string },
    ) => Promise<vscode.QuickPickItem | undefined>;
    showInformationMessage: (...args: unknown[]) => Promise<unknown>;
    showErrorMessage: (...args: unknown[]) => Promise<unknown>;
  };
  const original = {
    showWarningMessage: windowApi.showWarningMessage,
    showInputBox: windowApi.showInputBox,
    showQuickPick: windowApi.showQuickPick,
    showInformationMessage: windowApi.showInformationMessage,
    showErrorMessage: windowApi.showErrorMessage,
  };
  let argumentsAdded = 0;
  const information = options.information ?? [];
  const errors = options.errors ?? [];

  windowApi.showWarningMessage = async () => 'Continue';
  windowApi.showInputBox = async () => options.values.shift();
  windowApi.showQuickPick = async (items, quickPickOptions) => {
    const placeholder = quickPickOptions?.placeHolder ?? '';
    if (placeholder.startsWith('Choose the workspace folder')) {
      return items.find((item) => item.description === options.folderPath);
    }
    if (placeholder.startsWith('Add arguments')) {
      if (argumentsAdded < options.argumentCount) {
        argumentsAdded += 1;
        return items.find((item) => item.label === 'Add an argument');
      }
      return items.find((item) => item.label === 'Finish arguments');
    }
    if (placeholder.startsWith('Choose the Sotto environment')) {
      await options.beforeEnvironmentChoice?.();
      return items.find((item) =>
        item.label === (options.environment ? 'Set a fixed environment' : 'Use the project default'),
      );
    }
    return undefined;
  };
  windowApi.showInformationMessage = async (message: unknown) => {
    information.push(String(message));
    return undefined;
  };
  windowApi.showErrorMessage = async (message: unknown) => {
    errors.push(String(message));
    return undefined;
  };

  try {
    await vscode.commands.executeCommand('sotto.addTask');
  } finally {
    windowApi.showWarningMessage = original.showWarningMessage;
    windowApi.showInputBox = original.showInputBox;
    windowApi.showQuickPick = original.showQuickPick;
    windowApi.showInformationMessage = original.showInformationMessage;
    windowApi.showErrorMessage = original.showErrorMessage;
  }
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

function waitForTaskStart(label: string): Promise<vscode.TaskExecution> {
  return new Promise((resolve) => {
    const subscription = vscode.tasks.onDidStartTaskProcess((event) => {
      if (event.execution.task.name === label) {
        subscription.dispose();
        resolve(event.execution);
      }
    });
  });
}

async function waitForEndOrTerminate(
  ended: Promise<number | undefined>,
  execution: vscode.TaskExecution,
  timeoutMs: number,
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      execution.terminate();
      resolve(undefined);
    }, timeoutMs);
    void ended.then((exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
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

async function captureErrors<T>(
  operation: () => Promise<T>,
): Promise<{ messages: string[]; result: T }> {
  const windowApi = vscode.window as unknown as {
    showErrorMessage: (...args: unknown[]) => Promise<unknown>;
  };
  const original = windowApi.showErrorMessage;
  const messages: string[] = [];
  let result!: T;
  windowApi.showErrorMessage = async (message: unknown) => {
    messages.push(String(message));
    return undefined;
  };
  try {
    result = await operation();
  } finally {
    windowApi.showErrorMessage = original;
  }
  return { messages, result };
}
