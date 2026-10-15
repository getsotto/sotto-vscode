#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(`${process.env.SOTTO_PROBE_CLI_VERSION ?? 'sotto 0.9.0'}\n`);
  process.exit(0);
}

let environment;
if (args[0] === '--env') {
  environment = args[1];
  args.splice(0, 2);
}

if (args.shift() !== 'run' || args.shift() !== '--') {
  process.stderr.write('probe CLI received an unexpected Sotto argument shape\n');
  process.exit(64);
}

const [command, ...commandArgs] = args;
if (!command) {
  process.stderr.write('probe CLI received no child command\n');
  process.exit(64);
}

if (commandArgs[1] === 'prompt') {
  if (process.env.SOTTO_PROBE_PROMPT_MARKER) {
    writeFileSync(process.env.SOTTO_PROBE_PROMPT_MARKER, 'prompt-ready');
  }
  await readHiddenLine();
  process.stdout.write('probe hidden input received\n');
}

process.stdout.write(`probe environment: ${environment ?? '(project default)'}\n`);
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SOTTO_PROBE_SENTINEL: 'local-test-only',
    SOTTO_PROBE_ENVIRONMENT: environment ?? '',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  process.stderr.write(`probe child failed to start: ${error.message}\n`);
  process.exitCode = 127;
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exitCode = code ?? 1;
});

function readHiddenLine() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      process.stderr.write('probe unlock prompt requires a task terminal\n');
      reject(new Error('stdin is not a TTY'));
      return;
    }

    process.stderr.write('Probe unlock prompt (hidden): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let receivedInput = false;
    const restore = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          restore();
          process.stderr.write('\n');
          reject(new Error('probe prompt cancelled'));
          return;
        }
        if (byte === 10 || byte === 13) {
          restore();
          process.stderr.write('\n');
          resolve(receivedInput);
          return;
        }
        receivedInput = true;
      }
    };
    process.stdin.on('data', onData);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
