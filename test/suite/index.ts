import Mocha from 'mocha';
import * as path from 'node:path';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30_000 });
  mocha.addFile(path.resolve(__dirname, 'tasks.test.js'));
  mocha.addFile(path.resolve(__dirname, 'task-config.test.js'));

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} extension host test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
