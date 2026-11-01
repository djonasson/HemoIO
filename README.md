# HemoIO

A client-side application for analyzing, cataloging, and tracking laboratory test results.

**[Try HemoIO](https://djonasson.github.io/HemoIO/)** - No installation required, runs entirely in your browser.

## Overview

HemoIO helps individuals manage their health data by:

- Importing lab results from PDF documents or images
- Extracting test values using OCR and AI-powered analysis
- Tracking biomarker trends over time
- Visualizing health data with interactive charts
- Exporting reports to share with healthcare providers

All data is encrypted and stored locally. No server required.

## Getting Started

```sh
npm install
npm run dev
```

## Scripts

| Command            | Description                 |
|--------------------|-----------------------------|
| `npm run dev`      | Start development server    |
| `npm run build`    | Build for production        |
| `npm run test`     | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once         |
| `npm run e2e`      | Run end-to-end tests        |

## AI Providers

HemoIO uses AI to extract values from lab report documents. You can choose from:

- **OpenAI** - Cloud-based, requires API key
- **Anthropic** - Cloud-based, requires API key
- **Ollama** - Local, no API key required, data stays on your device

### Using Ollama

[Ollama](https://ollama.com) runs AI models locally on your computer, ensuring your health data never leaves your device.

1. Install Ollama from https://ollama.com
2. Pull a model: `ollama pull llama3.2:8b`
3. Start Ollama: `ollama serve`

#### CORS Configuration for Hosted Deployments

If you're using HemoIO from https://djonasson.github.io/HemoIO/ (or any non-localhost URL), your browser will block requests to your local Ollama server due to CORS restrictions.

**Option 1: Run HemoIO locally**

```sh
git clone https://github.com/djonasson/HemoIO
cd HemoIO
npm install
npm run dev
```

**Option 2: Configure Ollama to allow the hosted origin**

```sh
OLLAMA_ORIGINS=https://djonasson.github.io ollama serve
```

Or to allow all origins (less secure):

```sh
OLLAMA_ORIGINS=* ollama serve
```

## Documentation

- [Concept](docs/CONCEPT.md) - Product vision and features
- [Architecture](docs/ARCHITECTURE.md) - Technical design

## Author

Daniel Jonasson

## Third-Party Notices

This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.

HemoIO uses LOINC version 2.83: the LOINC code and long common name of each test in its biomarker dictionary. The app shows the same notice under Settings → About.

## License

MIT
