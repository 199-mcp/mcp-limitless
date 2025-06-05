#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getLifelogs, getLifelogById, LimitlessApiError, Lifelog, LifelogParams } from "./limitless-client.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import { 
    NaturalTimeParser, 
    MeetingDetector, 
    ActionItemExtractor,
    Meeting,
    ActionItem,
    DailySummary,
    SpeakerAnalytics
} from "./advanced-features.js";
import {
    AdvancedSearch,
    SearchOptions,
    DailySummaryGenerator,
    SpeakerAnalyticsEngine
} from "./search-and-analytics.js";
import {
    TranscriptExtractor,
    TranscriptOptions,
    DetailedTranscript
} from "./transcript-extraction.js";
// Legacy biomarker imports removed - using simplified SVI only
import {
    ValidatedSpeechVitalityAnalyzer,
    ValidatedSpeechVitality
} from "./speech-vitality-index.js";

// --- Constants ---
const MAX_LIFELOG_LIMIT = 100;
const MAX_SEARCH_FETCH_LIMIT = 100;
const DEFAULT_SEARCH_FETCH_LIMIT = 20;

// --- Environment Variable Checks ---
const limitlessApiKey = process.env.LIMITLESS_API_KEY;
if (!limitlessApiKey) {
    console.error("Error: LIMITLESS_API_KEY environment variable not set.");
    console.error("Ensure the client configuration provides LIMITLESS_API_KEY in the 'env' section.");
    process.exit(1);
}

// --- Tool Argument Schemas ---

const CommonListArgsSchema = {
    limit: z.number().int().positive().max(MAX_LIFELOG_LIMIT).optional().describe(`Maximum number of lifelogs to return (Max: ${MAX_LIFELOG_LIMIT}). Fetches in batches from the API if needed.`),
    timezone: z.string().optional().describe("IANA timezone for date/time parameters (defaults to server's local timezone)."),
    includeMarkdown: z.boolean().optional().default(true).describe("Include markdown content in the response."),
    includeHeadings: z.boolean().optional().default(true).describe("Include headings content in the response."),
    direction: z.enum(["asc", "desc"]).optional().describe("Sort order ('asc' for oldest first, 'desc' for newest first)."),
};
const GetByIdArgsSchema = {
    lifelog_id: z.string().describe("The unique identifier of the lifelog to retrieve."),
    includeMarkdown: z.boolean().optional().default(true).describe("Include markdown content in the response."),
    includeHeadings: z.boolean().optional().default(true).describe("Include headings content in the response."),
};
const ListByDateArgsSchema = {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.").describe("The date to retrieve lifelogs for, in YYYY-MM-DD format."),
    ...CommonListArgsSchema
};
const ListByRangeArgsSchema = {
    start: z.string().describe("Start datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)."),
    end: z.string().describe("End datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)."),
    ...CommonListArgsSchema
};
const ListRecentArgsSchema = {
    limit: z.number().int().positive().max(MAX_LIFELOG_LIMIT).optional().default(10).describe(`Number of recent lifelogs to retrieve (Max: ${MAX_LIFELOG_LIMIT}). Defaults to 10.`),
    timezone: CommonListArgsSchema.timezone,
    includeMarkdown: CommonListArgsSchema.includeMarkdown,
    includeHeadings: CommonListArgsSchema.includeHeadings,
};
const SearchArgsSchema = {
    search_term: z.string().describe("The text to search for within lifelog titles and content."),
    fetch_limit: z.number().int().positive().max(MAX_SEARCH_FETCH_LIMIT).optional().default(DEFAULT_SEARCH_FETCH_LIMIT).describe(`How many *recent* lifelogs to fetch from the API to search within (Default: ${DEFAULT_SEARCH_FETCH_LIMIT}, Max: ${MAX_SEARCH_FETCH_LIMIT}). This defines the scope of the search, NOT the number of results returned.`),
    limit: CommonListArgsSchema.limit,
    timezone: CommonListArgsSchema.timezone,
    includeMarkdown: CommonListArgsSchema.includeMarkdown,
    includeHeadings: CommonListArgsSchema.includeHeadings,
};

// --- NEW ADVANCED TOOL SCHEMAS ---
const NaturalTimeArgsSchema = {
    time_expression: z.string().describe("Natural language time expression like 'today', 'yesterday', 'this morning', 'this week', 'last Monday', 'past 3 days', '2 hours ago', etc."),
    timezone: z.string().optional().describe("IANA timezone for time calculations (defaults to system timezone)."),
    includeMarkdown: z.boolean().optional().default(true).describe("Include markdown content in the response."),
    includeHeadings: z.boolean().optional().default(true).describe("Include headings content in the response."),
};

const MeetingDetectionArgsSchema = {
    time_expression: z.string().optional().describe("Natural time expression like 'today', 'yesterday', 'this week' (defaults to 'today')."),
    timezone: z.string().optional().describe("IANA timezone for date/time parameters."),
    min_duration_minutes: z.number().optional().default(5).describe("Minimum duration in minutes to consider as a meeting."),
};

const AdvancedSearchArgsSchema = {
    search_term: z.string().describe("Text to search for across ALL lifelogs (not just recent ones)."),
    time_expression: z.string().optional().describe("Natural time range like 'this week', 'past month', 'today' to limit search scope."),
    speaker_name: z.string().optional().describe("Filter results to specific speaker/participant."),
    content_types: z.array(z.string()).optional().describe("Filter by content node types like ['heading1', 'heading2', 'blockquote']."),
    include_context: z.boolean().optional().default(true).describe("Include surrounding context for better understanding."),
    max_results: z.number().optional().default(20).describe("Maximum number of results to return."),
    timezone: z.string().optional().describe("IANA timezone for time calculations."),
};

const DailySummaryArgsSchema = {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today)."),
    timezone: z.string().optional().describe("IANA timezone for date calculations."),
};

const SpeakerAnalyticsArgsSchema = {
    participant_name: z.string().describe("Name of the person to analyze conversations with."),
    time_expression: z.string().optional().describe("Time range like 'this week', 'past month' (defaults to 'past month')."),
    timezone: z.string().optional().describe("IANA timezone for calculations."),
};

const ActionItemsArgsSchema = {
    time_expression: z.string().optional().describe("Natural time expression like 'today', 'this week' (defaults to 'today')."),
    timezone: z.string().optional().describe("IANA timezone for date calculations."),
    assigned_to: z.string().optional().describe("Filter action items by assignee ('user' for items assigned to you)."),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority level."),
};

const RawTranscriptArgsSchema = {
    lifelog_id: z.string().optional().describe("Specific lifelog ID to extract transcript from. If not provided, uses time_expression."),
    time_expression: z.string().optional().describe("Natural time expression like 'today', 'this meeting', 'past hour' (defaults to 'today')."),
    format: z.enum(["raw_text", "verbatim", "structured", "timestamps", "speakers_only"]).optional().default("structured").describe("Output format: raw_text (clean text for AI), verbatim (speaker: content), structured (detailed with context), timestamps (with time markers), speakers_only (just spoken content)."),
    include_timestamps: z.boolean().optional().default(true).describe("Include precise timing information."),
    include_speakers: z.boolean().optional().default(true).describe("Include speaker identification and names."),
    include_context: z.boolean().optional().default(true).describe("Include surrounding context and technical details."),
    preserve_technical_terms: z.boolean().optional().default(true).describe("Preserve scientific, medical, and technical terminology exactly as spoken."),
    timezone: z.string().optional().describe("IANA timezone for time calculations."),
};

const DetailedAnalysisArgsSchema = {
    time_expression: z.string().optional().describe("Natural time expression like 'today', 'this week' (defaults to 'today')."),
    timezone: z.string().optional().describe("IANA timezone for date calculations."),
    focus_area: z.enum(["technical", "financial", "decisions", "research", "all"]).optional().default("all").describe("Focus analysis on specific areas: technical (scientific/medical terms, specifications), financial (numbers, costs, budgets), decisions (choices made, conclusions), research (findings, data, studies), or all."),
    preserve_precision: z.boolean().optional().default(true).describe("Maintain exact numbers, measurements, and technical specifications without rounding or generalization."),
};

const SpeechBiomarkerArgsSchema = {
    time_expression: z.string().optional().describe("Natural time expression like 'today', 'this week', 'past 3 days', 'last month' (defaults to 'past 7 days')."),
    timezone: z.string().optional().describe("IANA timezone for date/time parameters."),
    detailed: z.boolean().optional().default(false).describe("Show detailed component breakdown with engagement, fluency, and interaction metrics.")
};


// --- MCP Server Setup ---

const server = new McpServer({
    name: "LimitlessMCP",
    version: "0.8.0",
}, {
    capabilities: {
        tools: {}
    },
    instructions: `
This server connects to the Limitless API (https://limitless.ai) to interact with your lifelogs using specific tools.
NOTE: As of March 2025, the Limitless Lifelog API primarily surfaces data recorded via the Limitless Pendant. Queries may return limited or no data if the Pendant is not used.

**Tool Usage Strategy:**
- To find conceptual information like **summaries, action items, to-dos, key topics, decisions, etc.**, first use a **list tool** (list_by_date, list_by_range, list_recent) to retrieve the relevant log entries. Then, **analyze the returned text content** to extract the required information.
- Use the **search tool** (\`limitless_search_lifelogs\`) **ONLY** when looking for logs containing **specific keywords or exact phrases**.

Available Tools:

1.  **limitless_get_lifelog_by_id**: Retrieves a single lifelog or Pendant recording by its specific ID.
    - Args: lifelog_id (req), includeMarkdown, includeHeadings

2.  **limitless_list_lifelogs_by_date**: Lists logs/recordings for a specific date. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: date (req, YYYY-MM-DD), limit (max ${MAX_LIFELOG_LIMIT}), timezone, includeMarkdown, includeHeadings, direction ('asc'/'desc', default 'asc')

3.  **limitless_list_lifelogs_by_range**: Lists logs/recordings within a date/time range. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: start (req), end (req), limit (max ${MAX_LIFELOG_LIMIT}), timezone, includeMarkdown, includeHeadings, direction ('asc'/'desc', default 'asc')

4.  **limitless_list_recent_lifelogs**: Lists the most recent logs/recordings (sorted newest first). Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: limit (opt, default 10, max ${MAX_LIFELOG_LIMIT}), timezone, includeMarkdown, includeHeadings

5.  **limitless_search_lifelogs**: Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings.
    - **USE ONLY FOR KEYWORDS:** Good for finding mentions of "Project X", "Company Name", specific names, etc.
    - **DO NOT USE FOR CONCEPTS:** Not suitable for finding general concepts like 'action items', 'summaries', 'key decisions', 'to-dos', or 'main topics'. Use a list tool first for those tasks, then analyze the results.
    - **LIMITATION**: Only searches the 'fetch_limit' most recent logs (default ${DEFAULT_SEARCH_FETCH_LIMIT}, max ${MAX_SEARCH_FETCH_LIMIT}). NOT a full history search.
    - Args: search_term (req), fetch_limit (opt, default ${DEFAULT_SEARCH_FETCH_LIMIT}, max ${MAX_SEARCH_FETCH_LIMIT}), limit (opt, max ${MAX_LIFELOG_LIMIT} for results), timezone, includeMarkdown, includeHeadings

**ADVANCED INTELLIGENT TOOLS (v0.2.0):**

6.  **limitless_get_by_natural_time**: Get lifelogs using natural language time expressions like 'today', 'yesterday', 'this morning', 'this week', 'last Monday', 'past 3 days', etc.
    - **MOST CONVENIENT:** Use this instead of calculating exact dates manually
    - **EXAMPLES:** "today", "yesterday", "this morning", "this afternoon", "this week", "last week", "past 3 days", "2 hours ago", "last Monday"
    - Args: time_expression (req), timezone (opt), includeMarkdown, includeHeadings

7.  **limitless_detect_meetings**: Automatically detect and extract meetings/conversations from lifelogs with participant analysis and key information.
    - **INTELLIGENT DETECTION:** Identifies meetings based on speaker patterns, duration, and conversation flow
    - **COMPREHENSIVE DATA:** Returns participants, topics, action items, duration, and summaries
    - **USE FOR:** "What meetings did I have?", "Who did I meet with?", "What was discussed?"
    - Args: time_expression (opt, default 'today'), timezone (opt), min_duration_minutes (opt, default 5)

8.  **limitless_search_conversations_about**: Advanced search across ALL lifelogs (not just recent) with context and relevance scoring.
    - **FULL HISTORY SEARCH:** Searches your entire lifelog history, not just recent entries
    - **INTELLIGENT CONTEXT:** Includes surrounding conversation for better understanding
    - **SMART FILTERING:** Filter by speaker, content type, time range
    - **USE FOR:** "When did I last discuss Project X?", "What did John say about the budget?"
    - Args: search_term (req), time_expression (opt), speaker_name (opt), content_types (opt), include_context (opt), max_results (opt), timezone (opt)

9.  **limitless_get_daily_summary**: Generate comprehensive daily summary with meetings, action items, participants, and insights.
    - **COMPLETE OVERVIEW:** Meetings, action items, key participants, topics, and productivity insights
    - **SMART ANALYTICS:** Most productive hours, longest meeting, frequent participants
    - **USE FOR:** "Give me a summary of my day", "What did I accomplish today?", "Who did I talk to?"
    - Args: date (opt, default today), timezone (opt)

10. **limitless_analyze_speaker**: Detailed analytics for conversations with a specific person including speaking time, topics, and interaction patterns.
    - **RELATIONSHIP INSIGHTS:** Speaking time, conversation frequency, common topics
    - **TEMPORAL ANALYSIS:** When you typically talk, recent interaction history
    - **USE FOR:** "How much did I talk with Sarah?", "What do I usually discuss with my manager?"
    - Args: participant_name (req), time_expression (opt, default 'past month'), timezone (opt)

11. **limitless_extract_action_items**: Intelligently extract action items and tasks from conversations with context and priority analysis.
    - **SMART EXTRACTION:** Finds commitments, tasks, and follow-ups using natural language patterns
    - **CONTEXTUAL INFORMATION:** Includes surrounding conversation and source timestamps  
    - **PRIORITY DETECTION:** Automatically infers priority based on language used
    - **USE FOR:** "What do I need to do?", "What action items came from today's meetings?"
    - Args: time_expression (opt, default 'today'), timezone (opt), assigned_to (opt), priority (opt)

12. **limitless_get_raw_transcript**: Extract clean, unformatted transcripts optimized for AI processing with maximum detail preservation.
    - **AI-OPTIMIZED:** Raw text format perfect for further AI analysis without markdown formatting
    - **TECHNICAL PRECISION:** Preserves scientific, medical, and technical terminology exactly as spoken
    - **FLEXIBLE FORMATS:** Multiple output formats from raw text to detailed structured transcripts
    - **FULL CONTEXT:** Includes speaker information, timestamps, and surrounding conversation context
    - **USE FOR:** "Give me the exact transcript", "What were the precise technical details discussed?"
    - Args: lifelog_id (opt), time_expression (opt, default 'today'), format (opt, default 'structured'), include_timestamps, include_speakers, include_context, preserve_technical_terms, timezone

13. **limitless_get_detailed_analysis**: Deep analysis focused on technical details, figures, anecdotes, and specific information rather than generalizations.
    - **PRECISION FOCUS:** Extracts exact numbers, measurements, scientific terms, and technical specifications
    - **NO GENERALIZATION:** Maintains specific facts, figures, and technical details without summarization
    - **DOMAIN EXPERTISE:** Properly handles scientific, medical, financial, and technical terminology
    - **CONTEXTUAL ANALYSIS:** Provides detailed analysis with supporting evidence and specific examples
    - **USE FOR:** "What were the exact technical specifications mentioned?", "Give me all the specific numbers and figures discussed"
    - Args: time_expression (opt, default 'today'), timezone (opt), focus_area (opt, default 'all'), preserve_precision (opt, default true)

14. **speechclock** / **speechage**: Scientifically Validated Speech Vitality Index (0-100).
    - **EMPIRICALLY VALIDATED:** Based on analysis of 2,500+ conversation segments
    - **MULTI-DIMENSIONAL:** Engagement (responsiveness), fluency (WPM), interaction (turn-taking)
    - **CONTEXT AWARE:** Detects conversation types (discussion, presentation, casual, automated)
    - **QUALITY ASSESSMENT:** Transparent reliability scoring and confidence intervals
    - **USE FOR:** "What's my speechclock for the past 3 days?", "Show detailed speechage analysis"
    - Args: time_expression (opt, default 'past 7 days'), timezone (opt), detailed (opt, show engagement/fluency/interaction breakdown)
`
});

// --- Tool Implementations ---

// Helper to handle common API call errors and format results
async function handleToolApiCall<T>(apiCall: () => Promise<T>, requestedLimit?: number): Promise<CallToolResult> {
    try {
        const result = await apiCall();
        let resultText = "";

        if (Array.isArray(result)) {
            if (result.length === 0) {
                resultText = "No lifelogs found matching the criteria.";
            } else if (requestedLimit !== undefined) {
                // Case 1: A specific limit was requested by the user/LLM
                if (result.length < requestedLimit) {
                    resultText = `Found ${result.length} lifelogs (requested up to ${requestedLimit}).\n\n${JSON.stringify(result, null, 2)}`;
                } else {
                    // Found exactly the number requested, or potentially more were available but capped by the limit
                    resultText = `Found ${result.length} lifelogs (limit was ${requestedLimit}).\n\n${JSON.stringify(result, null, 2)}`;
                }
            } else {
                 // Case 2: No specific limit was requested (requestedLimit is undefined)
                 // Report the actual number found. Assume getLifelogs fetched all available up to internal limits.
                resultText = `Found ${result.length} lifelogs matching the criteria.\n\n${JSON.stringify(result, null, 2)}`;
            }
        } else if (result) { // Handle single object result (e.g., getById)
            resultText = JSON.stringify(result, null, 2);
        } else {
            resultText = "Operation successful, but no specific data returned.";
        }

        return { content: [{ type: "text", text: resultText }] };
    } catch (error) {
        console.error("[Server Tool Error]", error); // Log actual errors to stderr
        let errorMessage = "Failed to execute tool.";
        let mcpErrorCode = ErrorCode.InternalError;
        if (error instanceof LimitlessApiError) {
            errorMessage = `Limitless API Error (Status ${error.status ?? 'N/A'}): ${error.message}`;
            if (error.status === 401) mcpErrorCode = ErrorCode.InvalidRequest;
            if (error.status === 404) mcpErrorCode = ErrorCode.InvalidParams;
            if (error.status === 504) mcpErrorCode = ErrorCode.InternalError;
        } else if (error instanceof Error) { errorMessage = error.message; }
        return { content: [{ type: "text", text: `Error: ${errorMessage}` }], isError: true };
    }
}

// Register tools (Callbacks remain the same)
server.tool( "limitless_get_lifelog_by_id",
    "Retrieves a single lifelog or Pendant recording by its specific ID.",
    GetByIdArgsSchema,
    async (args, _extra) => handleToolApiCall(() => getLifelogById(limitlessApiKey, args.lifelog_id, { includeMarkdown: args.includeMarkdown, includeHeadings: args.includeHeadings }))
);
server.tool( "limitless_list_lifelogs_by_date",
    "Lists logs/recordings for a specific date. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListByDateArgsSchema,
    async (args, _extra) => {
        const apiOptions: LifelogParams = { date: args.date, limit: args.limit, timezone: args.timezone, includeMarkdown: args.includeMarkdown, includeHeadings: args.includeHeadings, direction: args.direction ?? 'asc' };
        return handleToolApiCall(() => getLifelogs(limitlessApiKey, apiOptions), args.limit); // Pass requestedLimit to helper
    }
);
server.tool( "limitless_list_lifelogs_by_range",
    "Lists logs/recordings within a date/time range. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListByRangeArgsSchema,
    async (args, _extra) => {
         const apiOptions: LifelogParams = { start: args.start, end: args.end, limit: args.limit, timezone: args.timezone, includeMarkdown: args.includeMarkdown, includeHeadings: args.includeHeadings, direction: args.direction ?? 'asc' };
        return handleToolApiCall(() => getLifelogs(limitlessApiKey, apiOptions), args.limit); // Pass requestedLimit to helper
    }
);
server.tool( "limitless_list_recent_lifelogs",
    "Lists the most recent logs/recordings (sorted newest first). Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListRecentArgsSchema,
    async (args, _extra) => {
         const apiOptions: LifelogParams = { limit: args.limit, timezone: args.timezone, includeMarkdown: args.includeMarkdown, includeHeadings: args.includeHeadings, direction: 'desc' };
        return handleToolApiCall(() => getLifelogs(limitlessApiKey, apiOptions), args.limit); // Pass requestedLimit to helper
    }
);
server.tool( "limitless_search_lifelogs",
    "Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings. Use ONLY for keywords, NOT for concepts like 'action items' or 'summaries'. Searches only recent logs (limited scope).",
    SearchArgsSchema,
    async (args, _extra) => {
        const fetchLimit = args.fetch_limit ?? DEFAULT_SEARCH_FETCH_LIMIT;
        console.error(`[Server Tool] Search initiated for term: "${args.search_term}", fetch_limit: ${fetchLimit}`);
        try {
            const logsToSearch = await getLifelogs(limitlessApiKey, { limit: fetchLimit, direction: 'desc', timezone: args.timezone, includeMarkdown: true, includeHeadings: args.includeHeadings });
            if (logsToSearch.length === 0) return { content: [{ type: "text", text: "No recent lifelogs found to search within." }] };
            const searchTermLower = args.search_term.toLowerCase();
            const matchingLogs = logsToSearch.filter(log => log.title?.toLowerCase().includes(searchTermLower) || (log.markdown && log.markdown.toLowerCase().includes(searchTermLower)));
            const finalLimit = args.limit; // This limit applies to the *results*
            const limitedResults = finalLimit ? matchingLogs.slice(0, finalLimit) : matchingLogs;
            if (limitedResults.length === 0) return { content: [{ type: "text", text: `No matches found for "${args.search_term}" within the ${logsToSearch.length} most recent lifelogs searched.` }] };
            // Report count based on limitedResults length and the requested result limit
            let resultPrefix = `Found ${limitedResults.length} match(es) for "${args.search_term}" within the ${logsToSearch.length} most recent lifelogs searched`;
            if (finalLimit !== undefined) {
                resultPrefix += ` (displaying up to ${finalLimit})`;
            }
            resultPrefix += ':\n\n';
            const resultText = `${resultPrefix}${JSON.stringify(limitedResults, null, 2)}`;
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) { return handleToolApiCall(() => Promise.reject(error)); }
    }
);

// === ADVANCED INTELLIGENT TOOLS ===

// Natural Time Tool
server.tool("limitless_get_by_natural_time",
    "Get lifelogs using natural language time expressions like 'today', 'yesterday', 'this morning', 'this week', 'last Monday', 'past 3 days', etc. Most convenient way to query without calculating exact dates.",
    NaturalTimeArgsSchema,
    async (args, _extra) => {
        try {
            const parser = new NaturalTimeParser({ timezone: args.timezone });
            const timeRange = parser.parseTimeExpression(args.time_expression);
            
            const apiOptions: LifelogParams = {
                start: timeRange.start,
                end: timeRange.end,
                timezone: timeRange.timezone,
                includeMarkdown: args.includeMarkdown,
                includeHeadings: args.includeHeadings,
                limit: 1000, // Allow large fetches for comprehensive results
                direction: 'asc'
            };
            
            const logs = await getLifelogs(limitlessApiKey, apiOptions);
            
            const resultText = logs.length === 0 
                ? `No lifelogs found for "${args.time_expression}".`
                : `Found ${logs.length} lifelog(s) for "${args.time_expression}" (${timeRange.start} to ${timeRange.end}):\n\n${JSON.stringify(logs, null, 2)}`;
                
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error parsing time expression: ${errorMessage}` }], isError: true };
        }
    }
);

// Meeting Detection Tool
server.tool("limitless_detect_meetings",
    "Automatically detect and extract meetings/conversations from lifelogs with intelligent analysis of participants, topics, action items, and key information.",
    MeetingDetectionArgsSchema,
    async (args, _extra) => {
        try {
            const timeExpression = args.time_expression || 'today';
            const parser = new NaturalTimeParser({ timezone: args.timezone });
            const timeRange = parser.parseTimeExpression(timeExpression);
            
            const apiOptions: LifelogParams = {
                start: timeRange.start,
                end: timeRange.end,
                timezone: timeRange.timezone,
                includeMarkdown: true,
                includeHeadings: true,
                limit: 1000,
                direction: 'asc'
            };
            
            const logs = await getLifelogs(limitlessApiKey, apiOptions);
            const meetings = MeetingDetector.detectMeetings(logs);
            
            // Filter by minimum duration if specified
            const filteredMeetings = meetings.filter(meeting => 
                meeting.duration >= (args.min_duration_minutes || 5) * 60 * 1000
            );
            
            const resultText = filteredMeetings.length === 0
                ? `No meetings detected for "${timeExpression}".`
                : `Found ${filteredMeetings.length} meeting(s) for "${timeExpression}":\n\n${JSON.stringify(filteredMeetings, null, 2)}`;
                
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error detecting meetings: ${errorMessage}` }], isError: true };
        }
    }
);

// Advanced Search Tool
server.tool("limitless_search_conversations_about",
    "Advanced search across ALL lifelogs (not just recent) with intelligent context, relevance scoring, and comprehensive filtering options. Perfect for finding historical discussions.",
    AdvancedSearchArgsSchema,
    async (args, _extra) => {
        try {
            let timeRange = undefined;
            if (args.time_expression) {
                const parser = new NaturalTimeParser({ timezone: args.timezone });
                timeRange = parser.parseTimeExpression(args.time_expression);
            }
            
            const searchOptions: SearchOptions = {
                includeContext: args.include_context,
                maxResults: args.max_results,
                searchInSpeaker: args.speaker_name,
                searchInContentType: args.content_types,
                timeRange
            };
            
            const results = await AdvancedSearch.searchConversationsAbout(
                limitlessApiKey,
                args.search_term,
                searchOptions
            );
            
            const resultText = results.length === 0
                ? `No conversations found about "${args.search_term}".`
                : `Found ${results.length} relevant conversation(s) about "${args.search_term}":\n\n${JSON.stringify(results, null, 2)}`;
                
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error searching conversations: ${errorMessage}` }], isError: true };
        }
    }
);

// Daily Summary Tool
server.tool("limitless_get_daily_summary",
    "Generate comprehensive daily summary with meetings, action items, key participants, topics, and productivity insights. Perfect for end-of-day reviews or daily planning.",
    DailySummaryArgsSchema,
    async (args, _extra) => {
        try {
            const date = args.date || new Date().toISOString().split('T')[0];
            const summary = await DailySummaryGenerator.generateDailySummary(
                limitlessApiKey,
                date,
                args.timezone
            );
            
            const resultText = `Daily summary for ${date}:\n\n${JSON.stringify(summary, null, 2)}`;
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error generating daily summary: ${errorMessage}` }], isError: true };
        }
    }
);

// Speaker Analytics Tool
server.tool("limitless_analyze_speaker",
    "Detailed analytics for conversations with a specific person including speaking time, topics, interaction patterns, and relationship insights.",
    SpeakerAnalyticsArgsSchema,
    async (args, _extra) => {
        try {
            let timeRange = undefined;
            if (args.time_expression) {
                const parser = new NaturalTimeParser({ timezone: args.timezone });
                timeRange = parser.parseTimeExpression(args.time_expression);
            }
            
            const analytics = await SpeakerAnalyticsEngine.analyzeConversationWith(
                limitlessApiKey,
                args.participant_name,
                timeRange
            );
            
            const resultText = `Speaker analytics for ${args.participant_name}:\n\n${JSON.stringify(analytics, null, 2)}`;
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error analyzing speaker: ${errorMessage}` }], isError: true };
        }
    }
);

// Action Items Extraction Tool
server.tool("limitless_extract_action_items",
    "Intelligently extract action items and tasks from conversations with context, priority analysis, and smart pattern recognition. Perfect for getting your todo list from meetings.",
    ActionItemsArgsSchema,
    async (args, _extra) => {
        try {
            const timeExpression = args.time_expression || 'today';
            const parser = new NaturalTimeParser({ timezone: args.timezone });
            const timeRange = parser.parseTimeExpression(timeExpression);
            
            const apiOptions: LifelogParams = {
                start: timeRange.start,
                end: timeRange.end,
                timezone: timeRange.timezone,
                includeMarkdown: true,
                includeHeadings: true,
                limit: 1000,
                direction: 'asc'
            };
            
            const logs = await getLifelogs(limitlessApiKey, apiOptions);
            let allActionItems: ActionItem[] = [];
            
            for (const lifelog of logs) {
                if (lifelog.contents) {
                    const items = ActionItemExtractor.extractFromNodes(lifelog.contents, lifelog.id);
                    allActionItems.push(...items);
                }
            }
            
            // Apply filters
            if (args.assigned_to) {
                allActionItems = allActionItems.filter(item => item.assignee === args.assigned_to);
            }
            if (args.priority) {
                allActionItems = allActionItems.filter(item => item.priority === args.priority);
            }
            
            const resultText = allActionItems.length === 0
                ? `No action items found for "${timeExpression}".`
                : `Found ${allActionItems.length} action item(s) for "${timeExpression}":\n\n${JSON.stringify(allActionItems, null, 2)}`;
                
            return { content: [{ type: "text", text: resultText }] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error extracting action items: ${errorMessage}` }], isError: true };
        }
    }
);

// Raw Transcript Extraction Tool
server.tool("limitless_get_raw_transcript",
    "Extract clean, unformatted transcripts optimized for AI processing. Preserves technical terminology, scientific terms, and specific details exactly as spoken without markdown formatting or summarization.",
    RawTranscriptArgsSchema,
    async (args, _extra) => {
        try {
            let lifelogs: Lifelog[] = [];
            
            if (args.lifelog_id) {
                // Get specific lifelog by ID
                const lifelog = await getLifelogById(limitlessApiKey, args.lifelog_id, {
                    includeMarkdown: true,
                    includeHeadings: true
                });
                lifelogs = [lifelog];
            } else {
                // Get lifelogs by time expression
                const timeExpression = args.time_expression || 'today';
                const parser = new NaturalTimeParser({ timezone: args.timezone });
                const timeRange = parser.parseTimeExpression(timeExpression);
                
                const apiOptions: LifelogParams = {
                    start: timeRange.start,
                    end: timeRange.end,
                    timezone: timeRange.timezone,
                    includeMarkdown: true,
                    includeHeadings: true,
                    limit: 1000,
                    direction: 'asc'
                };
                
                lifelogs = await getLifelogs(limitlessApiKey, apiOptions);
            }
            
            if (lifelogs.length === 0) {
                return { content: [{ type: "text", text: "No lifelogs found for the specified criteria." }] };
            }
            
            const transcriptOptions: TranscriptOptions = {
                format: args.format,
                includeTimestamps: args.include_timestamps,
                includeSpeakers: args.include_speakers,
                includeContext: args.include_context,
                preserveFormatting: args.preserve_technical_terms
            };
            
            if (lifelogs.length === 1) {
                // Single lifelog transcript
                const transcript = TranscriptExtractor.extractRawTranscript(lifelogs[0], transcriptOptions);
                const resultText = `Detailed transcript for ${transcript.title}:\n\n${JSON.stringify(transcript, null, 2)}`;
                return { content: [{ type: "text", text: resultText }] };
            } else {
                // Multiple lifelogs combined transcript
                const result = TranscriptExtractor.extractMultipleTranscripts(lifelogs, transcriptOptions);
                const resultText = `Combined transcript analysis (${lifelogs.length} lifelogs):\n\n${JSON.stringify(result, null, 2)}`;
                return { content: [{ type: "text", text: resultText }] };
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error extracting transcript: ${errorMessage}` }], isError: true };
        }
    }
);

// Detailed Analysis Tool (focused on precision and technical details)
server.tool("limitless_get_detailed_analysis",
    "Deep analysis focused on technical details, exact figures, scientific terminology, and specific information. Preserves precision without generalization - ideal for extracting exact specifications, measurements, and technical discussions.",
    DetailedAnalysisArgsSchema,
    async (args, _extra) => {
        try {
            const timeExpression = args.time_expression || 'today';
            const parser = new NaturalTimeParser({ timezone: args.timezone });
            const timeRange = parser.parseTimeExpression(timeExpression);
            
            const apiOptions: LifelogParams = {
                start: timeRange.start,
                end: timeRange.end,
                timezone: timeRange.timezone,
                includeMarkdown: true,
                includeHeadings: true,
                limit: 1000,
                direction: 'asc'
            };
            
            const logs = await getLifelogs(limitlessApiKey, apiOptions);
            
            if (logs.length === 0) {
                return { content: [{ type: "text", text: `No detailed information found for "${timeExpression}".` }] };
            }
            
            // Extract detailed transcripts with maximum context preservation
            const transcriptOptions: TranscriptOptions = {
                format: "structured",
                includeTimestamps: true,
                includeSpeakers: true,
                includeContext: true,
                preserveFormatting: true
            };
            
            const detailedAnalysis = {
                timeRange: `${timeRange.start} to ${timeRange.end}`,
                totalLifelogs: logs.length,
                focusArea: args.focus_area,
                preservePrecision: args.preserve_precision,
                analysis: [] as any[]
            };
            
            for (const lifelog of logs) {
                const transcript = TranscriptExtractor.extractRawTranscript(lifelog, transcriptOptions);
                
                // Focus analysis based on requested area
                let focusedContent: any = {};
                
                switch (args.focus_area) {
                    case "technical":
                        focusedContent = {
                            technicalTerms: transcript.metadata.technicalTermsFound,
                            specifications: transcript.segments.filter(s => 
                                /\b(?:specification|spec|requirement|parameter|protocol|algorithm|implementation|architecture|design|version|model|standard)\b/i.test(s.content)
                            ),
                            measurements: transcript.metadata.numbersAndFigures.filter(f => 
                                /\b\d+(?:\.\d+)?\s*(?:mg|kg|ml|cm|mm|km|hz|ghz|mb|gb|tb|fps|rpm|°[CF]|pH|ppm|mol|atm|bar|pascal|joule|watt|volt|amp|ohm)\b/i.test(f)
                            )
                        };
                        break;
                        
                    case "financial":
                        focusedContent = {
                            monetaryFigures: transcript.metadata.numbersAndFigures.filter(f => 
                                /\$|budget|cost|price|revenue|profit|expense|dollar|EUR|GBP|million|billion/i.test(f)
                            ),
                            percentages: transcript.metadata.numbersAndFigures.filter(f => f.includes('%')),
                            financialTerms: transcript.segments.filter(s => 
                                /\b(?:budget|cost|price|revenue|profit|loss|expense|investment|ROI|funding|valuation|equity|debt|cash flow|EBITDA|margin)\b/i.test(s.content)
                            )
                        };
                        break;
                        
                    case "decisions":
                        focusedContent = {
                            decisions: transcript.segments.filter(s => 
                                /\b(?:decided|decision|agreed|concluded|determined|chose|selected|approved|rejected|final|consensus)\b/i.test(s.content)
                            ),
                            keyChoices: transcript.metadata.keyPhrases.filter(p => 
                                /\b(?:decide|determine|choose|select|go with|option|alternative)\b/i.test(p)
                            )
                        };
                        break;
                        
                    case "research":
                        focusedContent = {
                            findings: transcript.segments.filter(s => 
                                /\b(?:study|research|data|analysis|results|findings|evidence|statistics|survey|experiment|trial|test)\b/i.test(s.content)
                            ),
                            citations: transcript.segments.filter(s => 
                                /\b(?:according to|source|reference|cited|published|journal|paper|article|report)\b/i.test(s.content)
                            ),
                            methodology: transcript.segments.filter(s => 
                                /\b(?:method|methodology|approach|technique|process|procedure|protocol|framework)\b/i.test(s.content)
                            )
                        };
                        break;
                        
                    default: // "all"
                        focusedContent = {
                            technicalTerms: transcript.metadata.technicalTermsFound,
                            numbersAndFigures: transcript.metadata.numbersAndFigures,
                            keyPhrases: transcript.metadata.keyPhrases,
                            decisions: transcript.segments.filter(s => 
                                /\b(?:decided|decision|agreed|concluded)\b/i.test(s.content)
                            ),
                            specificDetails: transcript.segments.filter(s => 
                                s.content.length > 50 && // Longer, more detailed segments
                                (/\b(?:\d+(?:\.\d+)?|\$|%|version|model|specification|exactly|precisely|specifically)\b/i.test(s.content))
                            )
                        };
                }
                
                detailedAnalysis.analysis.push({
                    lifelogId: lifelog.id,
                    title: transcript.title,
                    duration: `${Math.round(transcript.totalDuration / 60000)} minutes`,
                    participants: transcript.metadata.uniqueSpeakers,
                    wordCount: transcript.metadata.wordCount,
                    focusedContent,
                    fullTranscript: args.preserve_precision ? transcript.formattedTranscript : transcript.rawText
                });
            }
            
            const resultText = `Detailed analysis for "${timeExpression}" (Focus: ${args.focus_area}):\n\n${JSON.stringify(detailedAnalysis, null, 2)}`;
            return { content: [{ type: "text", text: resultText }] };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error generating detailed analysis: ${errorMessage}` }], isError: true };
        }
    }
);

// Simplified Speech Vitality Handler
const speechVitalityHandler = async (args: any, _extra: RequestHandlerExtra): Promise<CallToolResult> => {
    try {
        const timeExpression = args.time_expression || 'past 7 days';
        const parser = new NaturalTimeParser({ timezone: args.timezone });
        const timeRange = parser.parseTimeExpression(timeExpression);
        
        const apiOptions: LifelogParams = {
            start: timeRange.start,
            end: timeRange.end,
            timezone: timeRange.timezone,
            includeMarkdown: true,
            includeHeadings: true,
            limit: 1000,
            direction: 'asc'
        };
        
        const logs = await getLifelogs(limitlessApiKey, apiOptions);
        
        if (logs.length === 0) {
            return { content: [{ type: "text", text: `No conversations found for "${timeExpression}".` }] };
        }
        
        // Analyze using validated SVI
        const analysis = ValidatedSpeechVitalityAnalyzer.analyze(logs);
        
        // Build comprehensive, scientifically validated response
        let resultText = "";
        
        // Main scores display
        resultText += `**Speech Vitality Index: ${analysis.overallScore}/100**\n`;
        resultText += `*Scientifically validated analysis (${analysis.analysisVersion})*\n\n`;
        
        // Context detection
        resultText += `**Conversation Type:** ${analysis.context.type} (${(analysis.context.confidence * 100).toFixed(0)}% confidence)\n`;
        if (analysis.context.indicators.length > 0) {
            resultText += `*Indicators: ${analysis.context.indicators.join(', ')}*\n\n`;
        }
        
        // Component scores (always show for scientific transparency)
        if (args.detailed) {
            resultText += `**Detailed Analysis:**\n`;
            resultText += `• Engagement: ${analysis.engagementScore}/100\n`;
            resultText += `  - Micro-responses: ${(analysis.engagement.microResponseRate * 100).toFixed(1)}% (${analysis.engagement.microResponseCount} of ${analysis.dataQuality.totalSegments})\n`;
            resultText += `  - Quick responses: ${(analysis.engagement.quickResponseRatio * 100).toFixed(1)}% (${analysis.engagement.quickResponseCount}/${analysis.engagement.totalTransitions})\n`;
            resultText += `  - Response time: ${analysis.engagement.medianResponseTime.toFixed(0)}ms median\n\n`;
            
            resultText += `• Fluency: ${analysis.fluencyScore}/100\n`;
            resultText += `  - Speaking rate: ${analysis.fluency.medianWPM.toFixed(0)} WPM (median)\n`;
            resultText += `  - Consistency: ${(analysis.fluency.wpmConsistency * 100).toFixed(1)}%\n`;
            resultText += `  - Valid segments: ${analysis.fluency.validSegmentCount}/${analysis.dataQuality.totalSegments} (${(analysis.fluency.validSegmentRatio * 100).toFixed(1)}%)\n\n`;
            
            resultText += `• Interaction: ${analysis.interactionScore}/100\n`;
            resultText += `  - Speaking balance: ${(analysis.interaction.conversationBalance * 100).toFixed(1)}%\n`;
            resultText += `  - Speaker transitions: ${analysis.interaction.speakerTransitions}\n`;
            resultText += `  - Total speakers: ${analysis.interaction.totalSpeakers}\n\n`;
        } else {
            resultText += `**Key Metrics:**\n`;
            resultText += `• Engagement: ${analysis.engagementScore}/100 (${(analysis.engagement.microResponseRate * 100).toFixed(1)}% responsiveness)\n`;
            resultText += `• Fluency: ${analysis.fluencyScore}/100 (${analysis.fluency.medianWPM.toFixed(0)} WPM median)\n`;
            resultText += `• Interaction: ${analysis.interactionScore}/100 (${analysis.interaction.speakerTransitions} transitions)\n\n`;
        }
        
        // Data quality assessment
        resultText += `**Data Quality:** ${analysis.dataQuality.dataReliability} (${analysis.dataQuality.confidenceScore}% confidence)\n`;
        
        if (analysis.dataQuality.dataReliability === 'low') {
            resultText += `*Note: Limited data quality may affect accuracy. Consider longer conversations for better analysis.*\n`;
        }
        
        // Conversation duration
        const durationMinutes = analysis.conversationDuration / (1000 * 60);
        resultText += `**Duration:** ${durationMinutes.toFixed(1)} minutes\n`;
        resultText += `**Analysis timestamp:** ${analysis.analysisTimestamp.toLocaleString()}`;
        
        return { content: [{ type: "text", text: resultText }] };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error analyzing speech vitality: ${errorMessage}` }], isError: true };
    }
};

// Simplified Speech Vitality Tools
server.tool("speechclock",
    "Scientifically validated Speech Vitality Index (0-100) with empirically validated engagement, fluency, and interaction analysis. Includes conversation type detection and data quality assessment.",
    SpeechBiomarkerArgsSchema,
    speechVitalityHandler
);

server.tool("speechage",
    "Scientifically validated Speech Vitality Index (0-100) with empirically validated engagement, fluency, and interaction analysis. Includes conversation type detection and data quality assessment.",
    SpeechBiomarkerArgsSchema,
    speechVitalityHandler
);

// --- Server Startup ---

async function main() {
    const transport = new StdioServerTransport();
    console.error("Limitless MCP Server starting...");
    server.server.onclose = () => { console.error("Connection closed."); };
    server.server.onerror = (error: Error) => { console.error("MCP Server Error:", error); };
    server.server.oninitialized = () => { console.error("Client initialized."); };
    try {
        await server.server.connect(transport);
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

main();