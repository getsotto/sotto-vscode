import * as vscodeApi from 'vscode';

interface SottoTaskDefinition extends vscodeApi.TaskDefinition {
  command?: unknown;
  args?: unknown;
  environment?: unknown;
}

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

function resolveSottoTask(task: vscodeApi.Task): vscodeApi.Task | undefined {
  if (!vscodeApi.workspace.isTrusted) {
    return undefined;
  }

  const definition = task.definition as SottoTaskDefinition;
  if (typeof definition.command !== 'string' || definition.command.length === 0) {
    return undefined;
  }
  if (
    definition.args !== undefined &&
    (!Array.isArray(definition.args) || !definition.args.every((arg) => typeof arg === 'string'))
  ) {
    return undefined;
  }
  if (definition.environment !== undefined && typeof definition.environment !== 'string') {
    return undefined;
  }

  const args: string[] = [];
  if (definition.environment) {
    args.push('--env', definition.environment);
  }
  args.push('run', '--', definition.command, ...(definition.args ?? []));

  const configuredCliPath = vscodeApi.workspace
    .getConfiguration('sotto')
    .get<string>('cliPath', '');
  const executable = configuredCliPath.trim() || 'sotto';
  const folder = isWorkspaceFolder(task.scope) ? task.scope : undefined;
  const scope = folder ?? vscodeApi.TaskScope.Workspace;
  const options: vscodeApi.ProcessExecutionOptions = folder
    ? { cwd: folder.uri.fsPath }
    : {};

  return new vscodeApi.Task(
    definition,
    scope,
    task.name,
    'Sotto',
    new vscodeApi.ProcessExecution(executable, args, options),
  );
}

function isWorkspaceFolder(
  scope: vscodeApi.TaskScope | vscodeApi.WorkspaceFolder | undefined,
): scope is vscodeApi.WorkspaceFolder {
  return typeof scope === 'object' && scope !== null && 'uri' in scope;
}
