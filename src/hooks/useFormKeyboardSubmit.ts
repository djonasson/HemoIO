/**
 * useFormKeyboardSubmit Hook
 *
 * Enables Enter key form submission for forms that may contain
 * non-text inputs (like radio buttons, checkboxes, or informational content).
 *
 * Standard HTML forms only submit on Enter when focus is on a text input.
 * This hook extends that behavior to work from any element within the form.
 */

import { useEffect, useRef, useCallback, type RefObject } from 'react';

export interface UseFormKeyboardSubmitOptions {
  /** Whether keyboard submission is enabled (default: true) */
  enabled?: boolean;
  /** Whether the form can be submitted (e.g., validation passed) */
  canSubmit?: boolean;
  /** Optional callback to run before form submission */
  onBeforeSubmit?: () => boolean | void;
}

export interface UseFormKeyboardSubmitResult {
  /** Ref to attach to the form element */
  formRef: RefObject<HTMLFormElement | null>;
}

/**
 * Elements that should handle Enter key themselves (not trigger form submit)
 */
const ELEMENTS_WITH_OWN_ENTER_HANDLING = new Set([
  'TEXTAREA', // Enter creates new line
  'BUTTON', // Enter clicks the button
  'A', // Enter activates the link
  'SELECT', // Enter may open/close dropdown
]);

/**
 * Check if an element is a text-type input that normally triggers form submission
 */
function isTextInput(element: Element): boolean {
  if (element.tagName !== 'INPUT') return false;
  const input = element as HTMLInputElement;
  const textTypes = ['text', 'password', 'email', 'search', 'tel', 'url', 'number'];
  return textTypes.includes(input.type);
}

/**
 * Hook that enables Enter key form submission from any element within the form,
 * or from BODY/HTML when no specific element is focused.
 */
export function useFormKeyboardSubmit(
  options: UseFormKeyboardSubmitOptions = {}
): UseFormKeyboardSubmitResult {
  const { enabled = true, canSubmit = true, onBeforeSubmit } = options;
  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle Enter key
      if (event.key !== 'Enter') return;

      // Don't interfere if modifier keys are pressed (except Shift for completeness)
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as Element;
      const form = formRef.current;

      // If no form, nothing to do
      if (!form) return;

      // Check if the event target is inside our form, or is BODY/HTML (no specific focus)
      const isInsideForm = form.contains(target);
      const isBodyOrHtml = target.tagName === 'BODY' || target.tagName === 'HTML';

      // Only handle if inside our form or if focus is on body/html
      if (!isInsideForm && !isBodyOrHtml) return;

      // If target is inside a different form, don't interfere
      if (!isInsideForm && !isBodyOrHtml) return;
      if (isBodyOrHtml) {
        // Check if there are other forms on the page that might want this event
        // For now, we'll assume our form should handle it if focus is on body
      }

      // If it's a text input inside our form, let the browser's default form submission work
      if (isInsideForm && isTextInput(target)) return;

      // If target handles Enter key itself, don't interfere
      if (isInsideForm && ELEMENTS_WITH_OWN_ENTER_HANDLING.has(target.tagName)) return;

      // Check if target is inside a contenteditable
      if (isInsideForm && target.closest('[contenteditable="true"]')) return;

      // Prevent default (might scroll or do other things)
      event.preventDefault();

      // Check if submission is allowed
      if (!canSubmit) return;

      // Run before submit callback
      if (onBeforeSubmit) {
        const result = onBeforeSubmit();
        if (result === false) return;
      }

      // Submit the form
      // Create and dispatch a submit event so onSubmit handlers work
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    },
    [canSubmit, onBeforeSubmit]
  );

  useEffect(() => {
    if (!enabled) return;

    const form = formRef.current;
    if (!form) return;

    // Listen at document level to capture Enter when focus is on BODY
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return { formRef };
}
