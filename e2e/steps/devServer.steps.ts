/**
 * Steps for the development reload feature
 *
 * The scenarios edit source files and reload the page, so they never touch
 * the shared E2E dev server or the real files: tests running in parallel use
 * that server, and every open tab would be reloaded with it. Instead the
 * project is copied to a temp folder and gets its own dev server on a free
 * port. Deleting the folder afterwards is the only cleanup needed.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { createServer, type ViteDevServer } from 'vite';
import { expect, type ConsoleMessage, type Page } from '@playwright/test';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

/** What the dev server needs to serve the app, as the real checkout has it */
const PROJECT_FILES = [
  'src',
  'public',
  'index.html',
  'vite.config.ts',
  'ocrCache.config.ts',
  'package.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
];

/** How long a change takes to reach the page, at most */
const CHANGE_TIMEOUT = 15_000;

/** A port no other server is using: the OS picks one from its free range */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** A copy of the project with its own development server */
export class DevServerCopy {
  private server: ViteDevServer | undefined;
  private constructor(readonly root: string) {}

  static async start(): Promise<DevServerCopy> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hemoio-dev-reload-'));
    const copy = new DevServerCopy(root);
    try {
      for (const file of PROJECT_FILES) {
        fs.cpSync(path.join(PROJECT_ROOT, file), path.join(root, file), { recursive: true });
      }
      fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'));
      copy.server = await createServer({
        root,
        configFile: path.join(root, 'vite.config.ts'),
        // Not in the shared node_modules/.vite, which the E2E dev server uses;
        // under a node_modules folder so the React plugin skips the bundles
        cacheDir: path.join(root, 'cache', 'node_modules', '.vite'),
        server: { port: await freePort(), strictPort: true, host: '127.0.0.1' },
        logLevel: 'error',
        clearScreen: false,
      });
      await copy.server.listen();
    } catch (error) {
      await copy.stop();
      throw error;
    }
    return copy;
  }

  get url(): string {
    const url = this.server?.resolvedUrls?.local[0];
    if (!url) throw new Error('The development server is not running');
    return url;
  }

  /** Change a source file the way an editor saves it: new content, same code */
  editFile(relativePath: string): void {
    const file = path.join(this.root, relativePath);
    fs.appendFileSync(file, `\n// Edited by the development reload test at ${Date.now()}\n`);
  }

  async stop(): Promise<void> {
    await this.server?.close();
    this.server = undefined;
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

declare global {
  interface Window {
    /** Set by the test on the open page; a full reload clears it */
    __hemoioReloadMarker?: boolean;
  }
}

/** Watches one tab of the app for full reloads and hot updates */
export class ReloadWatcherPage {
  private loads = 0;
  private readonly logs: string[] = [];

  constructor(private readonly page: Page) {
    page.on('load', () => {
      this.loads += 1;
    });
    page.on('console', (message: ConsoleMessage) => {
      this.logs.push(message.text());
    });
  }

  /** Open the app and wait until the dev server can send it updates */
  async open(url: string): Promise<void> {
    await this.page.goto(url);
    await expect.poll(() => this.logs.includes('[vite] connected.')).toBe(true);
    await this.page.evaluate(() => {
      window.__hemoioReloadMarker = true;
    });
  }

  /** Run a change and wait for the page to load again */
  async expectFullReload(change: () => void): Promise<void> {
    const loadsBefore = this.loads;
    change();
    await expect.poll(() => this.loads, { timeout: CHANGE_TIMEOUT }).toBeGreaterThan(loadsBefore);
    expect(await this.page.evaluate(() => window.__hemoioReloadMarker)).toBeUndefined();
  }

  /** Run a change to `relativePath` and wait for it to be updated in place */
  async expectHotUpdate(relativePath: string, change: () => void): Promise<void> {
    const loadsBefore = this.loads;
    const updated = `[vite] hot updated: /${relativePath}`;
    change();
    await expect.poll(() => this.logs.includes(updated), { timeout: CHANGE_TIMEOUT }).toBe(true);
    expect(this.loads).toBe(loadsBefore);
    expect(await this.page.evaluate(() => window.__hemoioReloadMarker)).toBe(true);
  }
}
