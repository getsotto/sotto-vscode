import * as assert from 'node:assert/strict';
import { parse } from 'jsonc-parser';
import { upsertSottoTask, type SottoTaskConfig } from '../../src/task-config';

suite('Sotto task configuration edits', () => {
  const task: SottoTaskConfig = {
    label: 'Run checks',
    type: 'sotto',
    command: 'npm',
    args: ['run', 'checks with spaces'],
    environment: 'staging',
  };

  test('creates a standard tasks file when none exists', () => {
    const result = upsertSottoTask('', task);
    const configuration = parse(result.document) as {
      version: string;
      tasks: unknown[];
    };

    assert.equal(result.updated, false);
    assert.equal(configuration.version, '2.0.0');
    assert.deepEqual(configuration.tasks, [task]);
  });

  test('preserves JSONC comments, unrelated tasks, and existing version fields', () => {
    const original = [
      '{',
      '  // Keep this note.',
      '  "version": "2.1.0",',
      '  "tasks": [',
      '    { "label": "Build", "type": "shell", "command": "npm run build" }',
      '  ]',
      '}',
      '',
    ].join('\n');

    const result = upsertSottoTask(original, task);
    const configuration = parse(result.document) as {
      version: string;
      tasks: Array<Record<string, unknown>>;
    };

    assert.equal(result.updated, false);
    assert.match(result.document, /Keep this note/);
    assert.equal(configuration.version, '2.1.0');
    assert.equal(configuration.tasks[0].label, 'Build');
    assert.deepEqual(configuration.tasks[1], task);
  });

  test('updates a Sotto task with the same label and keeps its other properties', () => {
    const original = [
      '{',
      '  "version": "2.0.0",',
      '  "tasks": [',
      '    {',
      '      // This task-specific note stays with the task.',
      '      "label": "Run checks",',
      '      "type": "sotto",',
      '      "command": "old-command",',
      '      "args": ["old"],',
      '      "environment": "old-environment",',
      '      "problemMatcher": []',
      '    }',
      '  ]',
      '}',
      '',
    ].join('\n');

    const result = upsertSottoTask(original, {
      label: task.label,
      type: task.type,
      command: task.command,
      args: task.args,
    });
    const configuration = parse(result.document) as {
      tasks: Array<Record<string, unknown>>;
    };

    assert.equal(result.updated, true);
    assert.match(result.document, /task-specific note stays/);
    assert.equal(configuration.tasks.length, 1);
    assert.equal(configuration.tasks[0].command, 'npm');
    assert.deepEqual(configuration.tasks[0].args, ['run', 'checks with spaces']);
    assert.equal('environment' in configuration.tasks[0], false);
    assert.deepEqual(configuration.tasks[0].problemMatcher, []);
  });

  test('rejects malformed JSONC and duplicate labels without changing the input', () => {
    const malformed = '{ "version": "2.0.0", "tasks": [ ';
    assert.throws(() => upsertSottoTask(malformed, task), /malformed/);
    assert.equal(malformed, '{ "version": "2.0.0", "tasks": [ ');

    const conflicting = '{"version":"2.0.0","tasks":[{"label":"Run checks","type":"shell"}]}';
    assert.throws(() => upsertSottoTask(conflicting, task), /already used by another task/);
  });
});
