/**
 * The Web Locks HemoIO holds, so tabs of this origin take turns, and the one
 * order they are taken in when both are held: setup's, then folder sync's.
 * Taking them in that order everywhere is what keeps two tabs from each
 * holding one and waiting for the other.
 */

import { withWebLock } from './withWebLock';

/** Held while a tab sets up or clears for setup, so tabs take turns */
export const SETUP_LOCK = 'hemoio-setup';

/**
 * Held by folder syncs and the choices that write to the folder, so they run
 * one at a time across this origin's tabs; Start over waits for it too
 */
export const FOLDER_SYNC_LOCK = 'hemoio-folder-sync';

const LOCK_ORDER = [SETUP_LOCK, FOLDER_SYNC_LOCK] as const;

export type HemoIOLock = (typeof LOCK_ORDER)[number];

/** Runs `task` holding every named lock, taken in the one order allowed whatever order they are named in */
export function withLocks<T>(names: readonly HemoIOLock[], task: () => Promise<T>): Promise<T> {
  return LOCK_ORDER.filter((name) => names.includes(name)).reduceRight<() => Promise<T>>(
    (inner, name) => () => withWebLock(name, inner),
    task
  )();
}
