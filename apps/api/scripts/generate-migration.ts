import { spawn } from 'child_process';
import { join } from 'path';

const name = process.argv[2];
const basePath = './src/migrations';
const path = name ? join(basePath, name) : join(basePath, 'migration');

const args = [
  'ts-node',
  '-P',
  './tsconfig.json',
  '-r',
  'tsconfig-paths/register',
  './node_modules/typeorm/cli.js',
  'migration:generate',
  path,
  '-d',
  './typeorm.config.ts'
];

const child = spawn('npx', args, { stdio: 'inherit' });

child.on('exit', (code) => {
  process.exit(code ?? 0);
}); 