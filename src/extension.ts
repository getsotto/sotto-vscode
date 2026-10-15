import * as vscodeApi from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { taskContextProblem } from './task-policy';

interface SottoTaskDefinition extends vscodeApi.TaskDefinition {
  command?: unknown;
  args?: unknown;
  environment?: unknown;
}

const reportedProblems = new Map<string, number>();

export function activate(context: vscodeApi.ExtensionContext): void {
  context.subscriptions.push(
    vscodeApi.tasks.registerTaskProvider('sotto', {
      provideTasks: () => [],
      resolveTask: (task) => resolveSottoTask(task),
    }),
  );
}

export function deactivate(): void {
  // VS Code disposes the registered task provider with the extension context.
}

async function resolveSottoTask(task: vscodeApi.Task): Promise<vscodeApi.Task | undefined> {
  const folder = getTaskFolder(task.scope);
  const workspaceTrusted = vscodeApi.workspace.isTrusted;
  const contextProblem = taskContextProblem(workspaceTrusted, folder?.uri);
  if (contextProblem) {
    return workspaceTrusted ? rejectTask(contextProblem) : undefined;
  }

  const definition = task.definition as SottoTaskDefinition;
  if (typeof definition.command !== 'string' || definition.command.trim().length === 0) {
    return rejectTask('Set a non-empty executable in the Sotto task “command” field.');
  }
  if (
    definition.args !== undefined &&
    (!Array.isArray(definition.args) || !definition.args.every((arg) => typeof arg === 'string'))
  ) {
    return rejectTask('The Sotto task “args” field must be a list of strings.');
  }
  if (
    definition.environment !== undefined &&
    (typeof definition.environment !== 'string' || definition.environment.trim().length === 0)
  ) {
    return rejectTask('The Sotto task “environment” field must be a non-empty string when set.');
  }

  if (!folder) {
    return undefined;
  }
  if (!existsSync(path.join(folder.uri.fsPath, 'sotto.toml'))) {
    return rejectTask(
      'Add a valid sotto.toml to the selected workspace folder. Sotto tasks do not search parent folders outside that folder.',
    );
  }

  const configuredCliPath = vscodeApi.workspace
    .getConfiguration('sotto')
    .get<string>('cliPath', '');
  const executable = configuredCliPath.trim() || 'sotto';
  const versionProblem = await checkCliVersion(executable);
  if (versionProblem) {
    return rejectTask(versionProblem);
  }

  const args: string[] = [];
  if (definition.environment !== undefined) {
    args.push('--env', definition.environment);
  }
  args.push('run', '--', definition.command, ...(definition.args ?? []));

  return new vscodeApi.Task(
    definition,
    folder,
    task.name,
    'Sotto',
    new vscodeApi.ProcessExecution(executable, args, { cwd: folder.uri.fsPath }),
  );
}

function getTaskFolder(
  scope: vscodeApi.TaskScope | vscodeApi.WorkspaceFolder | undefined,
): vscodeApi.WorkspaceFolder | undefined {
  if (isWorkspaceFolder(scope)) {
    return scope;
  }
  const folders = vscodeApi.workspace.workspaceFolders ?? [];
  return folders.length === 1 ? folders[0] : undefined;
}

function rejectTask(message: string): undefined {
  const lastReported = reportedProblems.get(message) ?? 0;
  if (Date.now() - lastReported > 5_000) {
    reportedProblems.set(message, Date.now());
    void vscodeApi.window.showErrorMessage(`Cannot run Sotto task: ${message}`);
  }
  return undefined;
}

function checkCliVersion(executable: string): Promise<string | undefined> {
  const versionCommand = getVersionCommand(executable);
  if (typeof versionCommand === 'string') {
    return Promise.resolve(versionCommand);
  }

  return new Promise((resolve) => {
    execFile(
      versionCommand.executable,
      versionCommand.args,
      {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
        windowsVerbatimArguments: versionCommand.windowsVerbatimArguments ?? false,
      },
      (error, stdout) => {
        if (error) {
          resolve(
            'Sotto CLI could not be started. Install Sotto 0.9.0 or newer and make sure it is on VS Code’s PATH, or set the machine setting `sotto.cliPath` to the CLI executable.',
          );
          return;
        }

        const version = parseCliVersion(stdout);
        if (!version) {
          resolve(
            'Sotto returned an unrecognised version. Reinstall Sotto CLI 0.9.0 or newer, or verify the machine setting `sotto.cliPath`.',
          );
          return;
        }

        const comparison = compareVersions(version.numbers, [0, 9, 0]);
        if (comparison < 0 || (comparison === 0 && version.prerelease)) {
          resolve(
            `Sotto CLI ${version.label} is too old. Task execution requires 0.9.0 or newer; upgrade Sotto or verify the machine setting \`sotto.cliPath\`.`,
          );
          return;
        }
        resolve(undefined);
      },
    );
  });
}

function getVersionCommand(
  executable: string,
): { executable: string; args: string[]; windowsVerbatimArguments?: boolean } | string {
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) {
    if (executable.includes('%')) {
      return 'The Sotto CLI path contains `%`, which cannot be safely checked when it is a Windows command script. Set `sotto.cliPath` to the Sotto executable instead.';
    }
    return {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `""${executable}" --version"`],
      windowsVerbatimArguments: true,
    };
  }
  return { executable, args: ['--version'] };
}

interface CliVersion {
  numbers: [number, number, number];
  prerelease: boolean;
  label: string;
}

function parseCliVersion(output: string): CliVersion | undefined {
  const match = /^sotto\s+v?(\d+)\.(\d+)\.(\d+)(-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i.exec(
    output.trim(),
  );
  if (!match) {
    return undefined;
  }
  const numbers: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return {
    numbers,
    prerelease: match[4] !== undefined,
    label: `${numbers.join('.')}${match[4] ?? ''}`,
  };
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function isWorkspaceFolder(
  scope: vscodeApi.TaskScope | vscodeApi.WorkspaceFolder | undefined,
): scope is vscodeApi.WorkspaceFolder {
  return typeof scope === 'object' && scope !== null && 'uri' in scope;
}
