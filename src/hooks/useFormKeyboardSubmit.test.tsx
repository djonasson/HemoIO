import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFormKeyboardSubmit } from './useFormKeyboardSubmit';

// Test component that uses the hook
function TestForm({
  onSubmit,
  canSubmit = true,
  enabled = true,
  onBeforeSubmit,
  children,
}: {
  onSubmit: () => void;
  canSubmit?: boolean;
  enabled?: boolean;
  onBeforeSubmit?: () => boolean | void;
  children?: React.ReactNode;
}) {
  const { formRef } = useFormKeyboardSubmit({
    canSubmit,
    enabled,
    onBeforeSubmit,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} data-testid="test-form">
      {children}
    </form>
  );
}

describe('useFormKeyboardSubmit', () => {
  let submitHandler: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    submitHandler = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits form on Enter key from non-input elements', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Enter' });

    expect(submitHandler).toHaveBeenCalled();
  });

  it('submits form on Enter key when focus is on document body', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    // Focus body (simulate what happens after step transition in wizard)
    document.body.focus();

    // Fire keydown on document body
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(submitHandler).toHaveBeenCalled();
  });

  it('does not submit when canSubmit is false', () => {
    render(
      <TestForm onSubmit={submitHandler} canSubmit={false}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Enter' });

    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not submit when enabled is false', () => {
    render(
      <TestForm onSubmit={submitHandler} enabled={false}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Enter' });

    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not interfere with textarea Enter key', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <textarea data-testid="textarea-element" />
      </TestForm>
    );

    const textarea = screen.getByTestId('textarea-element');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // Textarea should handle Enter itself (newline), not submit form
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not interfere with button Enter key', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <button type="button" data-testid="button-element">
          Click me
        </button>
      </TestForm>
    );

    const button = screen.getByTestId('button-element');
    fireEvent.keyDown(button, { key: 'Enter' });

    // Button should handle Enter itself
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not submit on other keys', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Space' });

    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not submit when modifier keys are pressed', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');

    // Test with Ctrl+Enter
    fireEvent.keyDown(div, { key: 'Enter', ctrlKey: true });
    expect(submitHandler).not.toHaveBeenCalled();

    // Test with Alt+Enter
    fireEvent.keyDown(div, { key: 'Enter', altKey: true });
    expect(submitHandler).not.toHaveBeenCalled();

    // Test with Meta+Enter
    fireEvent.keyDown(div, { key: 'Enter', metaKey: true });
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('calls onBeforeSubmit callback before submitting', () => {
    const onBeforeSubmit = vi.fn();
    render(
      <TestForm onSubmit={submitHandler} onBeforeSubmit={onBeforeSubmit}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Enter' });

    expect(onBeforeSubmit).toHaveBeenCalled();
    expect(submitHandler).toHaveBeenCalled();
  });

  it('does not submit if onBeforeSubmit returns false', () => {
    const onBeforeSubmit = vi.fn(() => false);
    render(
      <TestForm onSubmit={submitHandler} onBeforeSubmit={onBeforeSubmit}>
        <div data-testid="div-element">Content</div>
      </TestForm>
    );

    const div = screen.getByTestId('div-element');
    fireEvent.keyDown(div, { key: 'Enter' });

    expect(onBeforeSubmit).toHaveBeenCalled();
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('submits from radio button inputs', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <input type="radio" data-testid="radio-element" />
      </TestForm>
    );

    const radio = screen.getByTestId('radio-element');
    fireEvent.keyDown(radio, { key: 'Enter' });

    expect(submitHandler).toHaveBeenCalled();
  });

  it('submits from checkbox inputs', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <input type="checkbox" data-testid="checkbox-element" />
      </TestForm>
    );

    const checkbox = screen.getByTestId('checkbox-element');
    fireEvent.keyDown(checkbox, { key: 'Enter' });

    expect(submitHandler).toHaveBeenCalled();
  });

  it('does not interfere with text input Enter (lets browser handle)', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <input type="text" data-testid="text-input" />
      </TestForm>
    );

    const textInput = screen.getByTestId('text-input');
    fireEvent.keyDown(textInput, { key: 'Enter' });

    // Hook should let browser handle text input Enter (for native form submission)
    // Our hook doesn't call onSubmit directly, it just doesn't prevent default
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not interfere with password input Enter', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <input type="password" data-testid="password-input" />
      </TestForm>
    );

    const passwordInput = screen.getByTestId('password-input');
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    // Hook should let browser handle password input Enter (for native form submission)
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('does not interfere with select Enter key', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <select data-testid="select-element">
          <option value="1">Option 1</option>
          <option value="2">Option 2</option>
        </select>
      </TestForm>
    );

    const select = screen.getByTestId('select-element');
    fireEvent.keyDown(select, { key: 'Enter' });

    // Select should handle Enter itself
    expect(submitHandler).not.toHaveBeenCalled();
  });

  it('submits from span elements', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <span data-testid="span-element">Text content</span>
      </TestForm>
    );

    const span = screen.getByTestId('span-element');
    fireEvent.keyDown(span, { key: 'Enter' });

    expect(submitHandler).toHaveBeenCalled();
  });

  it('does not interfere with links', () => {
    render(
      <TestForm onSubmit={submitHandler}>
        <a href="#" data-testid="link-element">
          Link
        </a>
      </TestForm>
    );

    const link = screen.getByTestId('link-element');
    fireEvent.keyDown(link, { key: 'Enter' });

    // Links should handle Enter themselves
    expect(submitHandler).not.toHaveBeenCalled();
  });
});
