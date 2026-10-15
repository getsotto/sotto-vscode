export interface TaskFolderUri {
  scheme: string;
}

export function taskContextProblem(
  workspaceTrusted: boolean,
  folderUri: TaskFolderUri | undefined,
): string | undefined {
  if (!workspaceTrusted) {
    return 'Trust this workspace before running Sotto tasks.';
  }
  if (!folderUri) {
    return 'Put the Sotto task in a workspace-folder tasks.json file so its project is unambiguous.';
  }
  if (folderUri.scheme !== 'file') {
    return 'Sotto tasks currently require a local desktop workspace folder.';
  }
  return undefined;
}
