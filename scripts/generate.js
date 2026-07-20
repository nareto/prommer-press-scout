#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generationConfig } from '../src/config.js';
import { generateLatest } from '../src/pipeline.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const result = await generateLatest(generationConfig(rootDir));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[press-scout] generation failed: ${error.message}`);
  process.exitCode = 1;
}
