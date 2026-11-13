/**
 * A stand-in for PDF.js: documents of text or scanned pages, configured per
 * test through `__setMockConfig`
 */
import { vi } from 'vitest';

export function createPdfjsMock(): Record<string, unknown> {
  const mockTextContent = {
    items: [
      { str: 'Patient Name: John Doe' },
      { str: 'Lab Report' },
      { str: 'Glucose: 95 mg/dL' },
      { str: 'Reference Range: 70-100 mg/dL' },
      { str: 'Hemoglobin: 14.5 g/dL' },
      { str: 'Reference Range: 12-17 g/dL' },
    ],
  };

  const mockEmptyTextContent = {
    items: [],
  };

  const mockOperatorList = {
    fnArray: [],
  };

  const mockOperatorListWithImages = {
    fnArray: [85], // OPS.paintImageXObject
  };

  // Store mock configuration
  let mockConfig = {
    numPages: 1,
    isScanned: false,
    throwError: false,
    pageErrors: [] as number[],
    /** Pages that are scans, when only some are */
    scannedPages: [] as number[],
    /** Pages with nothing on them */
    blankPages: [] as number[],
    /** Scans with a few words of text of their own, as a page number stamped on */
    stampedPages: [] as number[],
    pageSize: [100, 150] as [number, number],
  };

  const createMockPage = (pageNum: number) => {
    const scanned = mockConfig.isScanned || mockConfig.scannedPages.includes(pageNum);
    const blank = mockConfig.blankPages.includes(pageNum);
    const stamped = mockConfig.stampedPages.includes(pageNum);
    const [width, height] = mockConfig.pageSize;
    const fullText = { items: mockTextContent.items.map((item) => ({ str: `${item.str} (page ${pageNum})` })) };
    return {
      rotate: 0,
      getTextContent: vi
        .fn()
        .mockResolvedValue(stamped ? { items: [{ str: `Page ${pageNum}` }] } : scanned || blank ? mockEmptyTextContent : fullText),
      getOperatorList: vi.fn().mockResolvedValue(scanned || stamped ? mockOperatorListWithImages : mockOperatorList),
      getViewport: vi.fn(({ scale, rotation = 0 }: { scale: number; rotation?: number }) =>
        rotation % 180 === 0 ? { width: width * scale, height: height * scale } : { width: height * scale, height: width * scale }
      ),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn(),
    };
  };

  // Every document a call opens; each must be destroyed, or its worker leaks
  const openedDocuments: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];

  const createMockDocument = () => {
    const doc = {
    destroy: vi.fn().mockResolvedValue(undefined),
    numPages: mockConfig.numPages,
    getPage: vi.fn().mockImplementation((pageNum: number) => {
      if (mockConfig.pageErrors.includes(pageNum)) {
        return Promise.reject(new Error(`Page ${pageNum} error`));
      }
      return Promise.resolve(createMockPage(pageNum));
    }),
    };
    openedDocuments.push(doc);
    return doc;
  };

  return {
    GlobalWorkerOptions: { workerSrc: '' },
    OPS: {
      paintImageXObject: 85,
      paintJpegXObject: 86,
      paintImageMaskXObject: 87,
    },
    getDocument: vi.fn().mockImplementation(() => {
      if (mockConfig.throwError) {
        return {
          promise: Promise.reject(new Error('PDF load error')),
        };
      }
      return {
        promise: Promise.resolve(createMockDocument()),
      };
    }),
    // Expose mock control
    __openedDocuments: openedDocuments,
    __setMockConfig: (config: Partial<typeof mockConfig>) => {
      mockConfig = { ...mockConfig, ...config };
    },
    __resetMockConfig: () => {
      mockConfig = {
        numPages: 1,
        isScanned: false,
        throwError: false,
        pageErrors: [],
        scannedPages: [],
        blankPages: [],
        stampedPages: [],
        pageSize: [100, 150],
      };
    },
  };
}

/** The controls of the PDF.js stand-in, read from the mocked module */
export interface PdfjsMockControls {
  __openedDocuments: Array<{ destroy: ReturnType<typeof vi.fn> }>;
  __setMockConfig: (config: {
    numPages?: number;
    isScanned?: boolean;
    throwError?: boolean;
    pageErrors?: number[];
    scannedPages?: number[];
    blankPages?: number[];
    stampedPages?: number[];
    pageSize?: [number, number];
  }) => void;
  __resetMockConfig: () => void;
}
