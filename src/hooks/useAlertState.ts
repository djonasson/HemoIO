/**
 * Shared alert acknowledgement/dismissal state. Must be used within an
 * AlertStateProvider so the nav badge and the alert views agree.
 */
import { createContext, useContext } from 'react';

export interface AlertState {
  /** Per test (trend code): alerts dated on or before this are acknowledged */
  acknowledgedThrough: Record<string, Date>;
  /** Per test (trend code): alerts dated on or before this are hidden until the next page load */
  dismissedThrough: Record<string, Date>;
  acknowledge(biomarkerKey: string, through: Date): Promise<void>;
  dismiss(biomarkerKey: string, through: Date): void;
  /** Read the stored acknowledgements again, e.g. after a backup restore */
  reload(): Promise<void>;
}

export const AlertStateContext = createContext<AlertState | null>(null);

export function useAlertState(): AlertState {
  const context = useContext(AlertStateContext);
  if (!context) {
    throw new Error('useAlertState must be used within an AlertStateProvider');
  }
  return context;
}
