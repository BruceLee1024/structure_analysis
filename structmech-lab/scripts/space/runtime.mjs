import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function loadSpaceRuntime() {
  const bundle = await build({ stdin: { contents: "export * from './utils/spaceSolver'; export * from './utils/spaceModel';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

export async function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const path of ['utils/spaceSolver.ts', 'utils/sparseMatrix.ts', 'utils/spaceModel.ts', 'utils/spaceResponse.ts', 'utils/spaceStability.ts']) hash.update(path).update(await readFile(path));
  return hash.digest('hex');
}
