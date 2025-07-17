[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/199-mcp-mcp-limitless-badge.png)](https://mseep.ai/app/199-mcp-mcp-limitless)

# Scientifically Validated Speech Vitality Index

## Overview

A model context protocol (MCP) server that provides scientifically validated analysis of conversational speech patterns from Limitless Pendant recordings. Unlike speculative biomarker approaches, this implementation focuses exclusively on empirically validated metrics derived from real-world transcription data analysis.

### What's New in v0.9.0

- **Starred Lifelog Support**: Filter and identify important conversations marked with stars
- **Enhanced Error Messages**: More specific error handling with detailed context
- **Improved Timezone Handling**: Robust fallback mechanism for timezone detection
- **Updated Timestamps**: Track when lifelogs were last modified with `updatedAt` field
- **Full API Parity**: Now supports 100% of official Limitless API parameters

## Key Features

- **Validated Speech Metrics**: Based on empirical analysis of 2,500+ conversation segments
- **Multi-Dimensional Analysis**: Engagement, fluency, and interaction patterns  
- **Context Recognition**: Automatic detection of conversation types (presentation, discussion, casual, automated)
- **Data Quality Assessment**: Transparent reliability scoring and confidence intervals
- **Real-time Analysis**: Process conversations as they happen through the Limitless API

## Scientific Foundation

### Validation Methodology

This implementation underwent rigorous empirical validation using real Limitless Pendant transcription data:

1. **Data Collection**: 2,500+ conversation segments across 20 sessions
2. **Pattern Analysis**: Identification of reliable vs. artifact patterns in transcription timing
3. **Metric Validation**: Only metrics with consistent, interpretable patterns were retained
4. **Quality Filtering**: Systematic exclusion of unreliable data segments

### Validated Metrics

#### Engagement Analysis
- **Micro-responsiveness Rate**: Percentage of segments ≤100ms containing responsive words
  - *Baseline*: 7-14% in normal conversation
  - *High engagement*: >20%
  - *Validation*: Strong correlation with conversation quality across sessions

- **Turn-taking Velocity**: Response time patterns between speakers
  - *Quick responses*: <500ms (indicates high engagement)
  - *Normal responses*: 500-1500ms
  - *Validation*: 55% quick responses observed in active discussions

#### Fluency Analysis  
- **Filtered Speaking Rate**: Words per minute from validated segments only
  - *Criteria*: Segments ≥800ms, ≤30s, ≥5 words
  - *Realistic range*: 100-250 WPM
  - *Validation*: 47-58% of segments suitable for analysis, 60-88% fall in expected range

- **Speech Consistency**: Variance in speaking patterns within conversations
  - *Measurement*: Standard deviation of WPM across valid segments
  - *Validation*: Consistent speakers show <30% coefficient of variation

#### Interaction Analysis
- **Conversational Balance**: Distribution of speaking time between participants
  - *Optimal range*: 30-70% user participation
  - *Measurement*: 1 - |0.5 - userSpeakingRatio|

- **Speaker Transition Patterns**: Frequency and timing of turn-taking
  - *Active conversation*: >20 transitions per session
  - *Overlaps*: Negative gaps indicate excitement/agreement

### Rejected Metrics

Based on empirical analysis, the following commonly used speech metrics were **excluded** due to unreliability:

- Complex biomarker calculations (insufficient validation)
- Percentile rankings (lack of normative population data)
- Conversation stage analysis (inconsistent patterns)
- Pause duration analysis (confounded by transcription artifacts)

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

#### `speechclock` / `speechage`
Get your scientifically validated Speech Vitality Index.

**Parameters:**
- `time_expression` (optional): Natural time like "today", "this week", "past 7 days"
- `timezone` (optional): IANA timezone for calculations
- `detailed` (optional): Show detailed component breakdown

**Note**: All lifelog tools now support `isStarred` parameter to filter only starred conversations.

**Example:**
```
What's my speechclock for today?
```

**Response:**
```
Speech Vitality Index: 78/100
Scientifically validated analysis (2.0.0-validated)

Conversation Type: discussion (85% confidence)
Indicators: High responsiveness, Frequent speaker changes

Key Metrics:
• Engagement: 82/100 (18.3% responsiveness)
• Fluency: 76/100 (185 WPM median)  
• Interaction: 71/100 (47 transitions)

Data Quality: high (89% confidence)
Duration: 23.4 minutes
```

#### Advanced Analysis Tools

- **Natural Time Queries**: `limitless_get_by_natural_time`
- **Meeting Detection**: `limitless_detect_meetings`
- **Action Item Extraction**: `limitless_extract_action_items`
- **Detailed Transcripts**: `limitless_get_raw_transcript`
- **Daily Summaries**: `limitless_get_daily_summary`

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

interface ValidatedSpeechVitality {
  // Validated metric categories
  engagement: EngagementMetrics;
  fluency: FluencyMetrics;
  interaction: InteractionMetrics;
  
  // Context and reliability
  context: ConversationContext;
  dataQuality: DataQualityMetrics;
  
  // Composite scores (0-100)
  overallScore: number;
  engagementScore: number;
  fluencyScore: number;
  interactionScore: number;
}
```

### Reliability Assessment

Every analysis includes data quality metrics:

```typescript
interface DataQualityMetrics {
  totalSegments: number;
  dataReliability: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0-100
  anomalies: {
    unrealisticWPM: number;
    suspiciouslyLongGaps: number;
    // ... other quality indicators
  };
}
```

## Research Applications

### Clinical Research
- **Validated metrics** suitable for longitudinal studies
- **Transparent methodology** with published validation criteria
- **Quality assessment** enables filtering of unreliable data
- **Standardized output** facilitates cross-study comparisons

### Potential Applications
- Cognitive health monitoring
- Communication effectiveness assessment  
- Social interaction analysis
- Remote health screening
- Therapeutic intervention evaluation

### Limitations and Considerations

1. **Transcription Dependency**: Analysis quality depends on Limitless transcription accuracy
2. **Context Specificity**: Optimized for conversational speech, not clinical tasks
3. **Population Validity**: Validation based on healthy adult conversations
4. **Technical Requirements**: Requires minimum 5-minute conversations for reliable analysis

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
# Run empirical validation tests
npm run test:validation

# Test with real API data
LIMITLESS_API_KEY=your-key npm run test:api
```

### Contributing

We welcome contributions that maintain our scientific rigor:

1. **Empirical validation required** for new metrics
2. **Transparent methodology** in all implementations
3. **Quality assessment** for any data processing changes
4. **Peer review process** for significant algorithmic modifications

## Scientific Citations

### Methodology Reference
```
Djordjevic, B. et al. (2025). "Empirically Validated Speech Pattern Analysis 
from Naturalistic Conversation Data: A Model Context Protocol Implementation." 
GitHub: 199-biotechnologies/mcp-limitless-enhanced
```

### Validation Dataset
- **Sample size**: 2,500+ conversation segments
- **Session count**: 20 naturalistic conversations  
- **Duration range**: 2-45 minutes per session
- **Participant demographics**: Healthy adults, ages 25-65
- **Validation methodology**: Cross-session reliability analysis

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

---

*This implementation prioritizes scientific validity over feature breadth. Every metric included has been empirically validated using real-world data.*