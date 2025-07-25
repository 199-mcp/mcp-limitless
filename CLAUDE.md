# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides scientifically validated analysis of conversational speech patterns from Limitless Pendant recordings. It implements empirically validated metrics derived from real-world transcription data analysis (2,500+ conversation segments).

Key capabilities:
- Speech Vitality Index with validated metrics (engagement, fluency, interaction)
- Meeting detection and action item extraction
- Natural language time queries
- Speaker analytics and daily summaries
- Transparent data quality assessment

## Common Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Development mode with auto-reload
npm run dev

# Start the built server
npm start

# Publish to npm (includes build)
npm publish
```

## Architecture Overview

### Core Components

1. **MCP Server Setup** (`src/server.ts`):
   - Entry point using MCP SDK
   - Tool registration and request handling
   - Environment variable validation for `LIMITLESS_API_KEY`

2. **Limitless API Client** (`src/limitless-client.ts`):
   - HTTP client for Limitless API
   - Pagination handling
   - Error management with specific error classes

3. **Speech Vitality Index** (`src/speech-vitality-index.ts`):
   - Scientifically validated metrics calculation
   - Data quality assessment
   - Conversation context detection

4. **Advanced Features** (`src/advanced-features.ts`):
   - Natural time expression parsing
   - Meeting detection algorithms
   - Action item extraction

5. **Search & Analytics** (`src/search-and-analytics.ts`):
   - Advanced search with filters
   - Daily summary generation
   - Speaker analytics

6. **Transcript Extraction** (`src/transcript-extraction.ts`):
   - Raw transcript processing
   - Speaker identification
   - Timeline reconstruction

### Key Design Patterns

- **Modular Architecture**: Each feature is isolated in its own module
- **Type Safety**: Extensive use of TypeScript interfaces and Zod schemas
- **Error Handling**: Custom error classes with context preservation
- **Pagination**: Automatic handling of API pagination limits
- **Token Management**: Response size control to prevent Claude Desktop issues

### Important Considerations

1. **MCP Protocol**: This is NOT an HTTP server - it uses JSON-RPC over stdio
2. **API Limits**: Limitless API has a 10-item limit per request
3. **Response Size**: Keep responses under 20,000 tokens to avoid Claude Desktop issues
4. **Timezone Handling**: Defaults to America/Los_Angeles with fallback mechanisms
5. **Data Quality**: All metrics include reliability assessments

## Adding New Features

When adding new tools:
1. Define the tool schema in `server.ts` using Zod
2. Implement the core logic in a separate module
3. Add error handling with specific error messages
4. Include data quality/reliability metrics where applicable
5. Update tool registration in the server's tool list

## Testing Approach

Currently no automated tests are configured. When implementing tests:
- Focus on validation logic in `speech-vitality-index.ts`
- Test pagination handling in `limitless-client.ts`
- Verify time parsing edge cases in `advanced-features.ts`

## Deployment

This package is published to npm as `199bio-mcp-limitless-server`. The build process:
1. TypeScript compilation to `dist/`
2. Only `dist/`, `README.md`, and `LICENSE` are included in the package
3. The main entry point is `dist/server.js` with a shebang for direct execution