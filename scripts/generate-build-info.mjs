import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtAt = new Date().toISOString();
const builtAtLabel = `${builtAt.slice(0, 19).replace('T', ' ')} UTC`;
const output = [
  'export const BUILD_INFO = {',
  `  commit: ${JSON.stringify(commit)},`,
  `  builtAt: ${JSON.stringify(builtAt)},`,
  `  builtAtLabel: ${JSON.stringify(builtAtLabel)},`,
  '} as const;',
  '',
].join('\n');

writeFileSync(resolve('src/app/build-info.generated.ts'), output, 'utf8');
