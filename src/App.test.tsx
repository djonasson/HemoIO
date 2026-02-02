import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OCR services to avoid loading pdf.js in tests
vi.mock('./services/ocr', () => ({
  isSupportedDocument: vi.fn().mockReturnValue(true),
  getAcceptString: vi.fn().mockReturnValue('application/pdf,image/jpeg,image/png'),
  SUPPORTED_MIME_TYPES: {
    pdf: 'application/pdf',
    jpeg: 'image/jpeg',
    png: 'image/png',
  },
  detectDocumentType: vi.fn(),
  extractTextFromPDF: vi.fn(),
  recognizeImage: vi.fn(),
}));

vi.mock('./services/analysis', () => ({
  analyzeLabReport: vi.fn(),
}));

import App from './App';

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('App', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('shows setup wizard when no credentials exist', async () => {
    render(<App />);

    // Should show the setup wizard for first-time users
    expect(await screen.findByText('Welcome to HemoIO')).toBeInTheDocument();
    expect(
      screen.getByText("Let's set up your secure lab results tracker")
    ).toBeInTheDocument();
  });

  it('shows login screen when credentials exist', async () => {
    // Set up existing credentials
    localStorageMock.store['hemoio_credentials'] = JSON.stringify({
      salt: 'dGVzdHNhbHQ=',
      verificationSalt: 'dGVzdHNhbHQy',
      verificationHash: 'dGVzdGhhc2g=',
    });

    render(<App />);

    // Should show login screen for returning users
    expect(
      await screen.findByText('Enter your password to unlock your lab data')
    ).toBeInTheDocument();
  });
});
