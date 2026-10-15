import { open, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscodeApi from 'vscode';
import { upsertSottoTask, type SottoTaskConfig } from './task-config';

interface FolderChoice extends vscodeApi.QuickPickItem {
  folder: vscodeApi.WorkspaceFolder;
}

type TaskEditResult = 'added' | 'updated';

export async function addSottoTask(): Promise<void> {
  const agreed = await vscodeApi.window.showWarningMessage(
    'Sotto task labels, commands, arguments, and environment names are saved in workspace configuration. Do not enter secrets. Child commands can print decrypted environment values.',
    { modal: true },
    'Continue',
  );
  if (agreed !== 'Continue') return;

  const folder = await chooseWorkspaceFolder();
  if (!folder) return;

  const label = await vscodeApi.window.showInputBox({
    title: 'Add a Sotto task',
    prompt: 'Task label',
    placeHolder: 'For example, Run checks',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Enter a task label.'),
  });
  if (label === undefined) return;

  const command = await vscodeApi.window.showInputBox({
    title: 'Add a Sotto task',
    prompt: 'Executable to run through Sotto',
    placeHolder: 'For example, npm',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Enter an executable.'),
  });
  if (command === undefined) return;

  const args: string[] = [];
  while (true) {
    const choice = await vscodeApi.window.showQuickPick(
      [
        { label: 'Add an argument', description: 'Each entry stays one argument, including spaces.' },
        { label: 'Finish arguments' },
      ],
      { title: 'Add a Sotto task', placeHolder: 'Add arguments or continue without more' },
    );
    if (!choice) return;
    if (choice.label === 'Finish arguments') break;

    const argument = await vscodeApi.window.showInputBox({
      title: 'Add a Sotto task',
      prompt: `Argument ${args.length + 1}`,
      placeHolder: 'Spaces are kept within this argument',
      ignoreFocusOut: true,
    });
    if (argument === undefined) return;
    args.push(argument);
  }

  const environmentChoice = await vscodeApi.window.showQuickPick(
    [
      { label: 'Use the project default', description: 'Do not add an environment override.' },
      { label: 'Set a fixed environment' },
    ],
    { title: 'Add a Sotto task', placeHolder: 'Choose the Sotto environment' },
  );
  if (!environmentChoice) return;

  let environment: string | undefined;
  if (environmentChoice.label === 'Set a fixed environment') {
    environment = await vscodeApi.window.showInputBox({
      title: 'Add a Sotto task',
      prompt: 'Fixed Sotto environment name',
      placeHolder: 'For example, staging',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : 'Enter an environment name.'),
    });
    if (environment === undefined) return;
  }

  const task: SottoTaskConfig = {
    label: label.trim(),
    type: 'sotto',
    command: command.trim(),
    args,
    ...(environment === undefined ? {} : { environment: environment.trim() }),
  };

  try {
    const result = await saveTask(folder, task);
    await vscodeApi.window.showInformationMessage(
      `${result === 'added' ? 'Added' : 'Updated'} Sotto task “${task.label}”. Review .vscode/tasks.json before running it.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update the Sotto task file.';
    void vscodeApi.window.showErrorMessage(message);
  }
}

async function chooseWorkspaceFolder(): Promise<vscodeApi.WorkspaceFolder | undefined> {
  const folders = vscodeApi.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscodeApi.window.showErrorMessage('Open a workspace folder before adding a Sotto task.');
    return undefined;
  }
  if (folders.length === 1) return folders[0];

  const selected = await vscodeApi.window.showQuickPick(
    folders.map((folder): FolderChoice => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    { title: 'Add a Sotto task', placeHolder: 'Choose the workspace folder for this task' },
  );
  return selected?.folder;
}

async function saveTask(
  folder: vscodeApi.WorkspaceFolder,
  task: SottoTaskConfig,
): Promise<TaskEditResult> {
  const directory = vscodeApi.Uri.joinPath(folder.uri, '.vscode');
  const target = vscodeApi.Uri.joinPath(directory, 'tasks.json');
  await vscodeApi.workspace.fs.createDirectory(directory);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await createTasksFileIfMissing(target, task)) {
      const document = await vscodeApi.workspace.openTextDocument(target);
      await vscodeApi.window.showTextDocument(document, { preview: false, preserveFocus: false });
      return 'added';
    }
    const document = await vscodeApi.workspace.openTextDocument(target);
    const editor = await vscodeApi.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
    });
    const version = document.version;
    const original = document.getText();
    if (!document.isDirty) {
      const onDisk = await readFile(target.fsPath, 'utf8');
      if (document.version !== version) continue;
      if (onDisk !== original) {
        throw new Error('The tasks.json file changed while you were adding a task. Run Add Task again.');
      }
    }
    const edit = upsertSottoTask(original, task);
    if (document.version !== version) continue;

    if (edit.document !== original) {
      const applied = await editor.edit((builder) => {
        builder.replace(
          new vscodeApi.Range(document.positionAt(0), document.positionAt(original.length)),
          edit.document,
        );
      });
      if (!applied) continue;
      if (!(await document.save())) {
        throw new Error('Could not save .vscode/tasks.json. Review the open file and save it manually.');
      }
    }
    return edit.updated ? 'updated' : 'added';
  }

  throw new Error('The tasks.json file kept changing. Review it and run Add Task again.');
}

async function createTasksFileIfMissing(
  target: vscodeApi.Uri,
  task: SottoTaskConfig,
): Promise<boolean> {
  try {
    await vscodeApi.workspace.fs.stat(target);
    return false;
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  await mkdir(path.dirname(target.fsPath), { recursive: true });
  const initialDocument = upsertSottoTask('', task).document;
  try {
    const file = await open(target.fsPath, 'wx');
    try {
      await file.writeFile(initialDocument, 'utf8');
    } finally {
      await file.close();
    }
    return true;
  } catch (error) {
    if (isFileExistsError(error)) return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return isFileSystemError(error, 'FileNotFound');
}

function isFileExistsError(error: unknown): boolean {
  return isFileSystemError(error, 'EEXIST');
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
