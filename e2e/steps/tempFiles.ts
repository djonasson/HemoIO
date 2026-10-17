/**
 * Temp files for E2E tests
 *
 * Tests run in parallel, so every file gets its own directory: a shared
 * fixed path lets one test delete or overwrite another test's file. The file
 * name itself is preserved because tests assert on it in the UI.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function tempFilePath(filename: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hemoio-e2e-'));
  return path.join(dir, filename);
}

export function writeTempFile(filename: string, content: string | Buffer): string {
  const filePath = tempFilePath(filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function removeTempFile(filePath: string): void {
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
}
