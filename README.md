# Gloss

[中文说明](./README.zh-CN.md)

Gloss is a local-first macOS desktop app for multilingual parallel reading, passage alignment, and close textual comparison.

The current version is designed for scholar-facing reading workflows: you import two documents, extract text locally, build multilingual embeddings on-device, and click a passage on one side to retrieve the most likely corresponding passage on the other side.

## Why Gloss

Gloss is built for cases like:

- reading a Chinese translation alongside an English original
- comparing different translated editions of the same work
- locating likely source passages from a translated excerpt
- supporting close reading, annotation, and research-oriented bilingual study

The app does not rely on a backend service. PDF parsing, embedding generation, and similarity search all happen locally on your machine.

## Current Features

- Local macOS desktop app built with Electron, React, and TypeScript
- Import two documents for side-by-side comparison
- Extract text from PDF files locally
- Segment extracted text into sentence-like or short passage units
- Generate multilingual embeddings on-device
- Click a Chinese passage and retrieve the most likely English match
- Show top candidate matches instead of only one result
- Keep the heavy document-processing pipeline off the UI thread with a worker

## How It Works

Gloss currently follows this pipeline:

1. Import a source document and a target document.
2. Extract plain text from each PDF.
3. Reconstruct lines and split the text into smaller segments.
4. Encode segments with a multilingual sentence embedding model.
5. Compare vectors across languages.
6. Re-rank matches with lightweight neighborhood context.
7. Highlight and scroll to the best target-side match.

## Model

Gloss currently uses the multilingual embedding model `Xenova/paraphrase-multilingual-MiniLM-L12-v2` through `@huggingface/transformers`.

Important notes:

- the first run downloads model assets to local cache
- the full model repository contains multiple weight formats, but the app uses a quantized browser-compatible ONNX path
- this is a practical first-pass retrieval model, not a final scholarly alignment model

## Project Structure

```text
electron/                Electron main process and preload
src/App.tsx              Main desktop UI
src/lib/pdf.ts           Local PDF text extraction and segmentation
src/lib/embeddings.ts    Embedding model loading and vector generation
src/lib/alignment.ts     Cross-language similarity and lightweight reranking
src/workers/             Background worker for heavy document processing
```

## Development

Requirements:

- Node.js
- pnpm
- macOS

Install dependencies:

```bash
cd /Users/zhourongchang/self/gloss
pnpm install
```

Start the desktop app in development mode:

```bash
cd /Users/zhourongchang/self/gloss
pnpm dev
```

Run lint:

```bash
pnpm lint
```

Build production assets:

```bash
pnpm build
```

Preview the desktop build:

```bash
pnpm desktop:preview
```

## Current Limitations

This is still an early research prototype.

Current limitations include:

- alignment is performed on extracted text segments, not native PDF coordinates
- matching quality depends heavily on the quality of PDF text extraction
- highly free translations, aggressive paraphrases, or merged/split sentences reduce accuracy
- the current UX is optimized for Chinese-to-English lookup first
- there is no persistent local library or saved indexing layer yet

## Roadmap

Planned improvements include:

- bidirectional lookup
- stronger reranking with larger context windows
- support for more file formats beyond PDF
- persistent local document library and cached indexes
- page-level PDF viewer with visual highlighting
- scholar-friendly annotation and note-taking workflows

## Intended Audience

Gloss is especially aimed at:

- scholars
- translators
- students doing close bilingual reading
- researchers working with parallel texts

## Status

Gloss is usable as a local proof of concept for multilingual passage retrieval, but it is not yet a polished production reading environment.

## License

No license has been added yet.
