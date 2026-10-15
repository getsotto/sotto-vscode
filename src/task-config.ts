import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';

export interface SottoTaskConfig {
  label: string;
  type: 'sotto';
  command: string;
  args: string[];
  environment?: string;
}

export interface TaskConfigEdit {
  document: string;
  updated: boolean;
}

export function upsertSottoTask(document: string, task: SottoTaskConfig): TaskConfigEdit {
  const source = document.trim().length > 0 ? document : '{\n  "version": "2.0.0",\n  "tasks": []\n}\n';
  const errors: ParseError[] = [];
  const configuration: unknown = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !isRecord(configuration)) {
    throw new Error('The tasks.json file is malformed and was left unchanged.');
  }

  const rawTasks = configuration.tasks;
  if (rawTasks !== undefined && !Array.isArray(rawTasks)) {
    throw new Error('The tasks.json tasks field must be an array and was left unchanged.');
  }

  const tasks: unknown[] = rawTasks ?? [];
  const sameLabel = tasks.flatMap((candidate, index) => {
    if (isRecord(candidate) && candidate.label === task.label) return [{ candidate, index }];
    return [];
  });
  if (sameLabel.some(({ candidate }) => !isRecord(candidate) || candidate.type !== 'sotto')) {
    throw new Error(`The label “${task.label}” is already used by another task.`);
  }
  if (sameLabel.length > 1) {
    throw new Error(`More than one Sotto task uses the label “${task.label}”; rename one first.`);
  }

  const formattingOptions = getFormattingOptions(source);
  if (sameLabel.length === 1) {
    const index = sameLabel[0].index;
    const nextDocument = setJsoncValue(source, ['tasks', index, 'label'], task.label, formattingOptions);
    const withCommand = setJsoncValue(
      nextDocument,
      ['tasks', index, 'command'],
      task.command,
      formattingOptions,
    );
    const withArgs = setJsoncValue(withCommand, ['tasks', index, 'args'], task.args, formattingOptions);
    const withEnvironment = setJsoncValue(
      withArgs,
      ['tasks', index, 'environment'],
      task.environment,
      formattingOptions,
    );
    return { document: withEnvironment, updated: true };
  }

  if (rawTasks === undefined) {
    return {
      document: setJsoncValue(source, ['tasks'], [task], formattingOptions),
      updated: false,
    };
  }

  const edits = modify(source, ['tasks', tasks.length], task, {
    isArrayInsertion: true,
    formattingOptions,
  });
  return { document: applyEdits(source, edits), updated: false };
}

function setJsoncValue(
  document: string,
  path: (string | number)[],
  value: unknown,
  formattingOptions: { insertSpaces: boolean; tabSize: number; eol: string },
): string {
  const edits = modify(document, path, value, { formattingOptions });
  return applyEdits(document, edits);
}

function getFormattingOptions(document: string): {
  insertSpaces: boolean;
  tabSize: number;
  eol: string;
} {
  const indent = document.match(/(?:^|\r?\n)([\t ]+)\S/);
  const indentation = indent?.[1] ?? '  ';
  return {
    insertSpaces: !indentation.includes('\t'),
    tabSize: indentation.includes('\t') ? 1 : Math.max(1, indentation.length),
    eol: document.includes('\r\n') ? '\r\n' : '\n',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
