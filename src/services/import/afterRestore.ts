/**
 * The steps that follow a restore: once the data is replaced, a failing
 * step (say, reloading the preferences) must not report the restore as failed
 */
export interface AfterRestoreStep {
  /** What the step does, for the message to the user */
  name: string;
  run: () => Promise<unknown>;
  /** What the user can do when it fails; by default, reload the page */
  remedy?: string;
}

const RELOAD = 'Reload the page to see everything restored.';

/** Run every step, in order, and return the names of those that failed */
export async function runAfterRestore(steps: AfterRestoreStep[]): Promise<string[]> {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch {
      // The error itself is not logged: it may carry restored data
      console.error(`After restore, failed: ${step.name}`);
      failed.push(step.name);
    }
  }
  return failed;
}

/** What the user can do about the steps that failed, each said once */
export function afterRestoreAdvice(steps: AfterRestoreStep[], failed: string[]): string {
  const remedies = steps
    .filter((step) => failed.includes(step.name))
    .map((step) => step.remedy ?? RELOAD);
  return [...new Set(remedies)].join(' ');
}

/** "Failed: <steps>. <what to do>", for the notice that follows */
export function failedStepsMessage(steps: AfterRestoreStep[], failed: string[]): string {
  return `Failed: ${failed.join(', ')}. ${afterRestoreAdvice(steps, failed)}`;
}
