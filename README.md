# Limitless MCP Server - Enhanced

## Overview

A model context protocol (MCP) server that provides advanced analysis of conversations from Limitless Pendant recordings, with intelligent meeting detection, action item extraction, and comprehensive analytics.

### What's New in v0.13.0

- **Complete Pagination Support**: ALL tools now properly handle large datasets with pagination
- **Removed Legacy Features**: Cleaned up speech vitality tools to focus on core functionality
- **Fixed Remaining Tools**: Meeting detection, action items, transcripts, and detailed analysis all use pagination
- **Improved Performance**: Consistent 10-item API limit across all tools for optimal performance

### Previous Updates (v0.12.0)

- **Enhanced Token Limit Handling**: More aggressive truncation for oversized responses
- **Fixed Search Tool**: `limitless_search_lifelogs` now properly handles token limits
- **Improved Response Safety**: Pre-emptive array truncation before token estimation
- **Better Error Prevention**: All tools now use safe response wrapper consistently

### Previous Updates (v0.11.0)

- **Token Limit Solution**: Smart pagination and response chunking to handle large datasets
- **New Full Transcript Tool**: `limitless_get_full_transcript` fetches complete data with automatic pagination
- **Enhanced Pagination**: All list tools now support cursor-based pagination to avoid token limits
- **Intelligent Response Handling**: Automatic detection and handling of oversized responses
- **Multiple Output Formats**: Summary, full data, or transcript-only modes for flexibility

### Previous Updates (v0.9.0)

- **Starred Lifelog Support**: Filter and identify important conversations marked with stars
- **Enhanced Error Messages**: More specific error handling with detailed context
- **Improved Timezone Handling**: Robust fallback mechanism for timezone detection
- **Updated Timestamps**: Track when lifelogs were last modified with `updatedAt` field
- **Full API Parity**: Now supports 100% of official Limitless API parameters

## Key Features

- **Intelligent Meeting Detection**: Automatically identifies meetings from conversations
- **Action Item Extraction**: Finds tasks and commitments with context
- **Natural Language Time Queries**: Use expressions like "yesterday", "last week"  
- **Advanced Search**: Find conversations across all history with relevance scoring
- **Daily Summaries**: Comprehensive analysis with participants and key topics
- **Speaker Analytics**: Detailed analysis of conversations with specific people
- **Smart Pagination**: Handles large datasets without token limit issues
- **Raw Transcript Access**: Get exact transcripts for further AI processing

## Installation

```bash
npm install -g 199bio-mcp-limitless-server
```

## Usage

### Claude Desktop Configuration

Add to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "limitless": {
      "command": "npx",
      "args": ["199bio-mcp-limitless-server"],
      "env": {
        "LIMITLESS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Available Tools


#### Advanced Analysis Tools

- **Natural Time Queries**: `limitless_get_by_natural_time`
- **Meeting Detection**: `limitless_detect_meetings`
- **Action Item Extraction**: `limitless_extract_action_items`
- **Detailed Transcripts**: `limitless_get_raw_transcript`
- **Daily Summaries**: `limitless_get_daily_summary`
- **Full Transcript Fetcher**: `limitless_get_full_transcript` (NEW in v0.11.0)

### Handling Large Datasets (v0.11.0)

The MCP server now intelligently handles large datasets that would exceed Claude's token limits:

#### Pagination Support
All list tools now support cursor-based pagination:
```
# First request
limitless_list_lifelogs_by_date(date="2025-07-24", limit=10)
# Returns: 10 items + cursor

# Next page
limitless_list_lifelogs_by_date(date="2025-07-24", limit=10, cursor="next_page_cursor")
```

#### Full Transcript Tool
For complete data without manual pagination:
```
limitless_get_full_transcript(date="2025-07-24", format="transcript_only")
```

Formats available:
- `summary`: Key information only (default)
- `full`: Complete data including all fields
- `transcript_only`: Just the transcript text

## API Reference

### Core Types

```typescript
interface Lifelog {
  id: string;
  title?: string;
  markdown?: string;
  startTime: string;
  endTime: string;
  contents?: LifelogContentNode[];
  isStarred?: boolean;  // NEW: Whether this lifelog is starred
  updatedAt?: string;   // NEW: When this lifelog was last updated
}

interface LifelogParams {
  // ... existing params ...
  isStarred?: boolean;  // NEW: Filter for starred lifelogs only
  batch_size?: number;  // NEW: Configurable batch size for performance tuning
}

```


## Development

### Building from Source

```bash
git clone https://github.com/199-biotechnologies/mcp-limitless-enhanced.git
cd mcp-limitless-enhanced
npm install
npm run build
```

### Testing

```bash
# Test with real API data
LIMITLESS_API_KEY=your-key npm run dev
```

### Contributing

We welcome contributions that improve the functionality and reliability of this MCP server.

## License

MIT License - see LICENSE file for details.

## Troubleshooting

### Common Issues

#### "Claude hit max length" message
This message comes from Claude Desktop's UI when responses are too long or the conversation context is filling up. It's NOT related to:
- The MCP server functionality
- Your Claude account tier (free/paid)
- Limitless API limits

**Solution**: Start a new conversation or ask for shorter responses.

#### Server crashes with "Unexpected end of JSON input"
This happens when non-JSON data is sent to the server. MCP servers use JSON-RPC over stdio, not HTTP.

**Common mistake**: Trying to connect with HTTP clients, browsers, or curl.
**Solution**: Use Claude Desktop or a proper MCP client.

#### Cannot connect via HTTP/Browser/ngrok
MCP servers are NOT HTTP servers. They communicate via JSON-RPC over stdin/stdout.

**Wrong**: `curl http://localhost:8008`
**Right**: Configure in Claude Desktop's MCP settings

#### No data returned from queries
As of March 2025, the Limitless API primarily surfaces data from the Limitless Pendant. Ensure:
- Your Pendant is actively recording
- You have recent conversation data
- Your API key has proper permissions

### Understanding MCP Servers

**What MCP servers ARE:**
- JSON-RPC services that communicate over stdio
- Designed for Claude Desktop and MCP-compatible clients
- Tools that extend AI assistant capabilities

**What MCP servers are NOT:**
- HTTP/REST APIs
- Web servers
- Browser-accessible services
- Standalone applications with UIs

If you need HTTP access to Limitless data:
1. Use the Limitless API directly
2. Create a separate HTTP wrapper service
3. Use the official Limitless web interface

## Support

- **Issues**: [GitHub Issues](https://github.com/199-biotechnologies/mcp-limitless-enhanced/issues)
- **Documentation**: [Scientific Documentation](./docs/)
- **Contact**: boris@199longevity.com

