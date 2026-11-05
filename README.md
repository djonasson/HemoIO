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

| Command                  | Description                                            |
|--------------------------|--------------------------------------------------------|
| `npm run dev`            | Start development server                               |
| `npm run build`          | Build for production                                   |
| `npm run test`           | Run unit tests (watch mode)                            |
| `npm run test:run`       | Run unit tests once                                    |
| `npm run e2e`            | Run end-to-end tests                                   |
| `npm run loinc:download` | Download a newer LOINC release ([docs](docs/LOINC.md)) |

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
- [LOINC](docs/LOINC.md) - Downloading and updating LOINC

## Author

Daniel Jonasson

## Third-Party Notices

This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.

HemoIO uses LOINC version 2.83: the LOINC code and long common name of each test in its biomarker dictionary. The app shows the same notice under Settings → About.

HemoIO reads and converts units with the UCUM library @lhncbc/ucum-lhc (the version pinned in package.json, shown under Settings → About), developed by the Lister Hill National Center for Biomedical Communications (LHNCBC), U.S. National Library of Medicine, with the permission and based on the copyrighted content of the Regenstrief Institute. The UCUM table and UCUM codes are copyright © 1995-2009, Regenstrief Institute, Inc. and the Unified Codes for Units of Measures (UCUM) Organization. All rights reserved. They are used under the license at https://ucum.org/license. The library is provided "as is", without warranty, under the terms in its LICENSE.md. The app shows the same notice under Settings → About.

The UCUM library brings two small packages into the app. is-integer is used under the WTFPL, which asks for no notice. is-finite is used under the MIT license:

> Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The app shows this notice under Settings → About too.

## License

MIT
