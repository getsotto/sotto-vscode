import { writeFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);

if (mode === 'output') {
  const hasProbeValue = process.env.SOTTO_PROBE_SENTINEL === 'local-test-only';
  process.stdout.write('probe child stdout\n');
  process.stderr.write('probe child stderr\n');
  process.stdout.write(`test environment value present: ${hasProbeValue}\n`);
  process.stdout.write(`received arguments: ${JSON.stringify(args)}\n`);
  if (process.env.SOTTO_PROBE_RESULT) {
    writeFileSync(
      process.env.SOTTO_PROBE_RESULT,
      JSON.stringify({
        args,
        dataDirectory: process.env.SOTTO_DATA_DIR,
        environment: process.env.SOTTO_PROBE_ENVIRONMENT,
        sentinelPresent: hasProbeValue,
      }),
    );
  }
} else if (mode === 'prompt') {
  process.stdout.write('prompt child started after CLI input\n');
} else if (mode === 'exit') {
  process.stdout.write('probe child exiting with status 17\n');
  process.exitCode = 17;
} else if (mode === 'wait') {
  process.stdout.write('probe child waiting; cancel this task\n');
  setTimeout(() => process.stdout.write('probe child finished\n'), 60_000);
} else {
  process.stderr.write('unknown probe child mode\n');
  process.exitCode = 64;
}
