#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getLifelogs, getLifelogById, getLifelogsWithPagination, LifelogsWithPagination, LimitlessApiError, Lifelog, LifelogParams } from "./limitless-client.js";
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

// --- Constants ---
const MAX_API_LIMIT = 10; // Limitless API maximum per request
const MAX_TOTAL_FETCH_LIMIT = 100; // Maximum total items to fetch across pages
const DEFAULT_FETCH_LIMIT = 10;
const MAX_RESPONSE_TOKENS = 20000; // Leave buffer below Claude's limit
const TOKEN_ESTIMATION_RATIO = 0.25; // Rough estimate: 1 token per 4 characters

// --- Environment Variable Checks ---
const limitlessApiKey = process.env.LIMITLESS_API_KEY;
if (!limitlessApiKey) {
    console.error("Error: LIMITLESS_API_KEY environment variable not set.");
    console.error("Ensure the client configuration provides LIMITLESS_API_KEY in the 'env' section.");
    process.exit(1);
}

// --- Token Estimation Utilities ---

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKEN_ESTIMATION_RATIO);
}

/**
 * Truncate response if it exceeds token limits
 */
function truncateResponse(content: any, maxTokens: number = MAX_RESPONSE_TOKENS): { content: any; truncated: boolean; tokenCount: number } {
    const jsonString = JSON.stringify(content, null, 2);
    const estimatedTokens = estimateTokens(jsonString);
    
    if (estimatedTokens <= maxTokens) {
        return { content, truncated: false, tokenCount: estimatedTokens };
    }
    
    // Calculate how much to truncate
    const maxChars = Math.floor(maxTokens / TOKEN_ESTIMATION_RATIO);
    const truncatedJson = jsonString.substring(0, maxChars - 200); // Leave room for truncation message
    
    let truncatedContent;
    try {
        // Try to parse the truncated JSON
        truncatedContent = JSON.parse(truncatedJson + '}');
    } catch {
        // If JSON is invalid, return a summary instead
        if (Array.isArray(content)) {
            const itemCount = content.length;
            const sampleItems = content.slice(0, 3);
            truncatedContent = {
                summary: `Response truncated due to size. Showing 3 of ${itemCount} items.`,
                sample_items: sampleItems,
                total_items: itemCount,
                suggestion: "Use smaller time ranges, add limit parameter, or use pagination with cursor for more data."
            };
        } else {
            truncatedContent = {
                summary: "Response truncated due to size.",
                partial_data: truncatedJson.substring(0, Math.min(1000, truncatedJson.length)),
                suggestion: "Use more specific queries or pagination to get complete data."
            };
        }
    }
    
    return { 
        content: truncatedContent, 
        truncated: true, 
        tokenCount: estimateTokens(JSON.stringify(truncatedContent, null, 2))
    };
}

/**
 * Validate API constraints before making requests
 */
function validateApiConstraints(args: any): { valid: boolean; error?: string } {
    // Check limit constraint
    if (args.limit && args.limit > MAX_API_LIMIT) {
        return {
            valid: false,
            error: `❌ **LIMIT ERROR**: limit=${args.limit} exceeds API maximum of ${MAX_API_LIMIT}. Use cursor for pagination instead.`
        };
    }
    
    // Check date format if provided
    if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        return {
            valid: false,
            error: `❌ **DATE FORMAT ERROR**: date='${args.date}' must be YYYY-MM-DD format. Example: '2025-07-14'.`
        };
    }
    
    return { valid: true };
}

/**
 * Create a safe response with token limit handling and pagination info
 */
function createSafeResponse(data: any, description: string = "Result", paginationInfo?: { nextCursor?: string; hasMore?: boolean; totalFetched?: number }): CallToolResult {
    // First check if we need to truncate the data array itself
    let processedData = data;
    let wasArrayTruncated = false;
    
    if (Array.isArray(data)) {
        const fullEstimate = estimateTokens(JSON.stringify(data, null, 2));
        if (fullEstimate > MAX_RESPONSE_TOKENS * 0.8) {
            // Calculate how many items we can safely include
            const sampleItem = data[0] ? JSON.stringify(data[0], null, 2) : "{}";
            const itemTokens = estimateTokens(sampleItem);
            const headerTokens = 2000; // Reserve for description and metadata
            const maxItems = Math.max(1, Math.floor((MAX_RESPONSE_TOKENS - headerTokens) / itemTokens));
            
            if (data.length > maxItems) {
                processedData = data.slice(0, maxItems);
                wasArrayTruncated = true;
                
                // Update description to reflect truncation
                description = `${description} (Showing first ${maxItems} of ${data.length} items due to size limits)`;
                
                // Force pagination info
                if (!paginationInfo) {
                    paginationInfo = { hasMore: true };
                } else {
                    paginationInfo.hasMore = true;
                }
            }
        }
    }
    
    const { content, truncated, tokenCount } = truncateResponse(processedData);
    
    let resultText = `${description}:\n\n${JSON.stringify(content, null, 2)}`;
    
    if (paginationInfo?.nextCursor) {
        resultText += `\n\n📄 **Pagination Available**: Use cursor="${paginationInfo.nextCursor}" to fetch next page.`;
        if (paginationInfo.totalFetched) {
            resultText += ` (Showing ${Array.isArray(processedData) ? processedData.length : 'N/A'} items)`;
        }
    } else if (paginationInfo?.hasMore || wasArrayTruncated) {
        resultText += `\n\n⚠️ **More Data Available**: Use smaller limit or cursor pagination to see additional results.`;
    }
    
    if (truncated || wasArrayTruncated) {
        const originalTokens = estimateTokens(JSON.stringify(data, null, 2));
        resultText += `\n\n⚠️ **Response Truncated**: Reduced from ~${Math.ceil(originalTokens / 1000)}k to ~${Math.ceil(tokenCount / 1000)}k tokens. Use smaller limit, cursor pagination, or more specific queries.`;
    }
    
    return { content: [{ type: "text", text: resultText }] };
}

// --- Tool Argument Schemas ---

const CommonListArgsSchema = {
    limit: z.number().int().positive().max(MAX_API_LIMIT).optional().default(MAX_API_LIMIT).describe(`Maximum number of lifelogs to return per request (Max: ${MAX_API_LIMIT} per API constraint). Use cursor for pagination.`),
    cursor: z.string().optional().describe("Pagination cursor from previous response. Use to fetch next page of results."),
    timezone: z.string().optional().describe("IANA timezone for date/time parameters (defaults to server's local timezone)."),
    includeMarkdown: z.boolean().optional().default(true).describe("Include markdown content in the response."),
    includeHeadings: z.boolean().optional().default(true).describe("Include headings content in the response."),
    direction: z.enum(["asc", "desc"]).optional().describe("Sort order ('asc' for oldest first, 'desc' for newest first)."),
    isStarred: z.boolean().optional().describe("Filter for starred lifelogs only."),
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
    limit: z.number().int().positive().max(MAX_API_LIMIT).optional().default(MAX_API_LIMIT).describe(`Number of recent lifelogs to retrieve (Max: ${MAX_API_LIMIT} per API constraint). Use cursor for more.`),
    cursor: z.string().optional().describe("Pagination cursor from previous response. Use to fetch next page of results."),
    timezone: CommonListArgsSchema.timezone,
    includeMarkdown: CommonListArgsSchema.includeMarkdown,
    includeHeadings: CommonListArgsSchema.includeHeadings,
    isStarred: CommonListArgsSchema.isStarred,
};
const SearchArgsSchema = {
    search_term: z.string().describe("The text to search for within lifelog titles and content."),
    fetch_limit: z.number().int().positive().max(MAX_TOTAL_FETCH_LIMIT).optional().default(20).describe(`How many *recent* lifelogs to fetch from the API to search within (Default: 20, Max: ${MAX_TOTAL_FETCH_LIMIT}). This defines the scope of the search, NOT the number of results returned.`),
    limit: CommonListArgsSchema.limit,
    timezone: CommonListArgsSchema.timezone,
    includeMarkdown: CommonListArgsSchema.includeMarkdown,
    includeHeadings: CommonListArgsSchema.includeHeadings,
    isStarred: CommonListArgsSchema.isStarred,
};

// --- NEW ADVANCED TOOL SCHEMAS ---
const NaturalTimeArgsSchema = {
    time_expression: z.string().describe("Natural language time expression like 'today', 'yesterday', 'this morning', 'this week', 'last Monday', 'past 3 days', '2 hours ago', etc."),
    limit: z.number().int().positive().max(MAX_API_LIMIT).optional().default(MAX_API_LIMIT).describe(`Maximum number of lifelogs to return per request (Max: ${MAX_API_LIMIT} per API constraint). Use cursor for pagination.`),
    cursor: z.string().optional().describe("Pagination cursor from previous response. Use to fetch next page of results."),
    timezone: z.string().optional().describe("IANA timezone for time calculations (defaults to system timezone)."),
    includeMarkdown: z.boolean().optional().default(true).describe("Include markdown content in the response."),
    includeHeadings: z.boolean().optional().default(true).describe("Include headings content in the response."),
    isStarred: z.boolean().optional().describe("Filter for starred lifelogs only."),
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



// --- MCP Server Setup ---

const server = new McpServer({
    name: "LimitlessMCP",
    version: "0.13.1",
}, {
    capabilities: {
        tools: {}
    },
    instructions: `
⚡ LIMITLESS MCP SERVER - AI Agent Optimized ⚡

🔧 **CRITICAL CONSTRAINTS:**
- API LIMIT: Max 10 items per request
- TOKEN LIMIT: Responses auto-truncated at 20k tokens
- PAGINATION: Always use cursor for more data
- TIME FORMAT: Use supported expressions only

📋 **USAGE RULES FOR AI AGENTS:**
1. ALWAYS set limit ≤ 10 to avoid API errors
2. USE cursor parameter for pagination 
3. PREFER natural_time over exact dates
4. CHECK response for pagination info
5. EXPECT auto-truncation on large responses

⏰ **SUPPORTED TIME EXPRESSIONS:**
✅ 'today', 'yesterday', 'this week', 'last Monday', 'past 3 days'
❌ 'Monday July 14' → Use 'July 14 2025' instead

Available Tools:

1.  **limitless_get_lifelog_by_id**: Retrieves a single lifelog or Pendant recording by its specific ID.
    - Args: lifelog_id (req), includeMarkdown, includeHeadings

2.  **limitless_list_lifelogs_by_date**: Lists logs/recordings for a specific date. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: date (req, YYYY-MM-DD), limit (max ${MAX_API_LIMIT}), cursor, timezone, includeMarkdown, includeHeadings, direction ('asc'/'desc', default 'asc'), isStarred (filter starred only)

3.  **limitless_list_lifelogs_by_range**: Lists logs/recordings within a date/time range. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: start (req), end (req), limit (max ${MAX_API_LIMIT}), cursor, timezone, includeMarkdown, includeHeadings, direction ('asc'/'desc', default 'asc'), isStarred (filter starred only)

4.  **limitless_list_recent_lifelogs**: Lists the most recent logs/recordings (sorted newest first). Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.
    - Args: limit (opt, default ${MAX_API_LIMIT}, max ${MAX_API_LIMIT}), cursor, timezone, includeMarkdown, includeHeadings, isStarred (filter starred only)

5.  **limitless_search_lifelogs**: Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings.
    - **USE ONLY FOR KEYWORDS:** Good for finding mentions of "Project X", "Company Name", specific names, etc.
    - **DO NOT USE FOR CONCEPTS:** Not suitable for finding general concepts like 'action items', 'summaries', 'key decisions', 'to-dos', or 'main topics'. Use a list tool first for those tasks, then analyze the results.
    - **LIMITATION**: Only searches the 'fetch_limit' most recent logs (default 20, max ${MAX_TOTAL_FETCH_LIMIT}). NOT a full history search.
    - Args: search_term (req), fetch_limit (opt, default 20, max ${MAX_TOTAL_FETCH_LIMIT}), limit (opt, max ${MAX_API_LIMIT} for results), timezone, includeMarkdown, includeHeadings, isStarred (filter starred only)

**ADVANCED INTELLIGENT TOOLS (v0.2.0):**

6.  **limitless_get_by_natural_time**: Get lifelogs using natural language time expressions like 'today', 'yesterday', 'this morning', 'this week', 'last Monday', 'past 3 days', etc.
    - **MOST CONVENIENT:** Use this instead of calculating exact dates manually
    - **EXAMPLES:** "today", "yesterday", "this morning", "this afternoon", "this week", "last week", "past 3 days", "2 hours ago", "last Monday"
    - Args: time_expression (req), timezone (opt), includeMarkdown, includeHeadings, isStarred (filter starred only)

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
    "Lists logs/recordings for a specific date. Returns paginated results to avoid token limits. Use cursor to fetch next page. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListByDateArgsSchema,
    async (args, _extra) => {
        try {
            const validation = validateApiConstraints(args);
            if (!validation.valid) {
                return { content: [{ type: "text", text: validation.error! }], isError: true };
            }
            
            // Use pagination-aware function
            const result = await getLifelogsWithPagination(limitlessApiKey, {
                date: args.date,
                limit: args.limit || MAX_API_LIMIT,
                timezone: args.timezone,
                includeMarkdown: args.includeMarkdown,
                includeHeadings: args.includeHeadings,
                direction: args.direction ?? 'asc',
                isStarred: args.isStarred,
                cursor: args.cursor
            });
            
            // Check if response might be too large
            const estimatedSize = estimateTokens(JSON.stringify(result.lifelogs));
            if (estimatedSize > MAX_RESPONSE_TOKENS * 0.8 && result.lifelogs.length > 1) {
                // Return partial data with strong cursor guidance
                const partialCount = Math.max(1, Math.floor(result.lifelogs.length * 0.5));
                const partialLifelogs = result.lifelogs.slice(0, partialCount);
                
                return createSafeResponse(
                    partialLifelogs,
                    `Found ${result.lifelogs.length} lifelogs for ${args.date}, showing first ${partialCount} to avoid token limits`,
                    {
                        nextCursor: result.pagination.nextCursor,
                        hasMore: true,
                        totalFetched: partialCount
                    }
                );
            }
            
            return createSafeResponse(
                result.lifelogs,
                `Found ${result.lifelogs.length} lifelogs for ${args.date}`,
                {
                    nextCursor: result.pagination.nextCursor,
                    hasMore: result.pagination.hasMore,
                    totalFetched: result.lifelogs.length
                }
            );
        } catch (error) {
            return handleToolApiCall(() => Promise.reject(error));
        }
    }
);
server.tool( "limitless_list_lifelogs_by_range",
    "Lists logs/recordings within a date/time range. Returns paginated results to avoid token limits. Use cursor to fetch next page. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListByRangeArgsSchema,
    async (args, _extra) => {
        try {
            const validation = validateApiConstraints(args);
            if (!validation.valid) {
                return { content: [{ type: "text", text: validation.error! }], isError: true };
            }
            
            const result = await getLifelogsWithPagination(limitlessApiKey, {
                start: args.start,
                end: args.end,
                limit: args.limit || MAX_API_LIMIT,
                timezone: args.timezone,
                includeMarkdown: args.includeMarkdown,
                includeHeadings: args.includeHeadings,
                direction: args.direction ?? 'asc',
                isStarred: args.isStarred,
                cursor: args.cursor
            });
            
            const estimatedSize = estimateTokens(JSON.stringify(result.lifelogs));
            if (estimatedSize > MAX_RESPONSE_TOKENS * 0.8 && result.lifelogs.length > 1) {
                const partialCount = Math.max(1, Math.floor(result.lifelogs.length * 0.5));
                const partialLifelogs = result.lifelogs.slice(0, partialCount);
                
                return createSafeResponse(
                    partialLifelogs,
                    `Found ${result.lifelogs.length} lifelogs in range, showing first ${partialCount} to avoid token limits`,
                    {
                        nextCursor: result.pagination.nextCursor,
                        hasMore: true,
                        totalFetched: partialCount
                    }
                );
            }
            
            return createSafeResponse(
                result.lifelogs,
                `Found ${result.lifelogs.length} lifelogs in the specified range`,
                {
                    nextCursor: result.pagination.nextCursor,
                    hasMore: result.pagination.hasMore,
                    totalFetched: result.lifelogs.length
                }
            );
        } catch (error) {
            return handleToolApiCall(() => Promise.reject(error));
        }
    }
);
server.tool( "limitless_list_recent_lifelogs",
    "Lists the most recent logs/recordings (sorted newest first). Returns paginated results to avoid token limits. Use cursor to fetch next page. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.",
    ListRecentArgsSchema,
    async (args, _extra) => {
        try {
            const validation = validateApiConstraints(args);
            if (!validation.valid) {
                return { content: [{ type: "text", text: validation.error! }], isError: true };
            }
            
            const result = await getLifelogsWithPagination(limitlessApiKey, {
                limit: args.limit || MAX_API_LIMIT,
                timezone: args.timezone,
                includeMarkdown: args.includeMarkdown,
                includeHeadings: args.includeHeadings,
                direction: 'desc',
                isStarred: args.isStarred,
                cursor: args.cursor
            });
            
            const estimatedSize = estimateTokens(JSON.stringify(result.lifelogs));
            if (estimatedSize > MAX_RESPONSE_TOKENS * 0.8 && result.lifelogs.length > 1) {
                const partialCount = Math.max(1, Math.floor(result.lifelogs.length * 0.5));
                const partialLifelogs = result.lifelogs.slice(0, partialCount);
                
                return createSafeResponse(
                    partialLifelogs,
                    `Found ${result.lifelogs.length} recent lifelogs, showing first ${partialCount} to avoid token limits`,
                    {
                        nextCursor: result.pagination.nextCursor,
                        hasMore: true,
                        totalFetched: partialCount
                    }
                );
            }
            
            return createSafeResponse(
                result.lifelogs,
                `Found ${result.lifelogs.length} recent lifelogs`,
                {
                    nextCursor: result.pagination.nextCursor,
                    hasMore: result.pagination.hasMore,
                    totalFetched: result.lifelogs.length
                }
            );
        } catch (error) {
            return handleToolApiCall(() => Promise.reject(error));
        }
    }
);
server.tool( "limitless_search_lifelogs",
    "Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings. Use ONLY for keywords, NOT for concepts like 'action items' or 'summaries'. Searches only recent logs (limited scope).",
    SearchArgsSchema,
    async (args, _extra) => {
        const fetchLimit = args.fetch_limit ?? 20;
        console.error(`[Server Tool] Search initiated for term: "${args.search_term}", fetch_limit: ${fetchLimit}`);
        try {
            const logsToSearch = await getLifelogs(limitlessApiKey, { 
                limit: fetchLimit, 
                direction: 'desc', 
                timezone: args.timezone, 
                includeMarkdown: args.includeMarkdown ?? true, 
                includeHeadings: args.includeHeadings ?? true, 
                isStarred: args.isStarred 
            });
            
            if (logsToSearch.length === 0) {
                return { content: [{ type: "text", text: "No recent lifelogs found to search within." }] };
            }
            
            const searchTermLower = args.search_term.toLowerCase();
            const matchingLogs = logsToSearch.filter(log => 
                log.title?.toLowerCase().includes(searchTermLower) || 
                (log.markdown && log.markdown.toLowerCase().includes(searchTermLower))
            );
            
            const finalLimit = args.limit; // This limit applies to the *results*
            const limitedResults = finalLimit ? matchingLogs.slice(0, finalLimit) : matchingLogs;
            
            if (limitedResults.length === 0) {
                return { content: [{ type: "text", text: `No matches found for "${args.search_term}" within the ${logsToSearch.length} most recent lifelogs searched.` }] };
            }
            
            // Use createSafeResponse to handle token limits
            return createSafeResponse(
                limitedResults,
                `Found ${limitedResults.length} match(es) for "${args.search_term}" within the ${logsToSearch.length} most recent lifelogs searched${finalLimit !== undefined ? ` (displaying up to ${finalLimit})` : ''}`,
                {
                    hasMore: matchingLogs.length > limitedResults.length,
                    totalFetched: logsToSearch.length
                }
            );
        } catch (error) { 
            return handleToolApiCall(() => Promise.reject(error)); 
        }
    }
);

// === ADVANCED INTELLIGENT TOOLS ===

// Natural Time Tool
server.tool("limitless_get_by_natural_time",
    "Get lifelogs using natural time expressions. SUPPORTED: 'today', 'yesterday', 'this week', 'last Monday', 'past 3 days', '2 hours ago'. CONSTRAINTS: limit max 10 per request, use cursor for more. EXAMPLES: time_expression='yesterday', limit=5. NOT SUPPORTED: 'Monday July 14' (use 'July 14 2025' instead).",
    NaturalTimeArgsSchema,
    async (args, _extra) => {
        try {
            // Validate constraints
            const validation = validateApiConstraints(args);
            if (!validation.valid) {
                return { content: [{ type: "text", text: validation.error! }], isError: true };
            }
            
            const parser = new NaturalTimeParser({ timezone: args.timezone });
            const timeRange = parser.parseTimeExpression(args.time_expression);
            
            const apiOptions: LifelogParams = {
                start: timeRange.start,
                end: timeRange.end,
                timezone: timeRange.timezone,
                includeMarkdown: args.includeMarkdown,
                includeHeadings: args.includeHeadings,
                limit: args.limit || MAX_API_LIMIT,
                direction: 'asc',
                isStarred: args.isStarred,
                cursor: args.cursor
            };
            
            const result = await getLifelogsWithPagination(limitlessApiKey, apiOptions);
            
            if (result.lifelogs.length === 0) {
                return { content: [{ type: "text", text: `No lifelogs found for "${args.time_expression}".` }] };
            }
            
            return createSafeResponse(
                result.lifelogs, 
                `Found ${result.lifelogs.length} lifelog(s) for "${args.time_expression}" (${timeRange.start} to ${timeRange.end})`,
                {
                    nextCursor: result.pagination.nextCursor,
                    hasMore: result.pagination.hasMore,
                    totalFetched: result.pagination.count
                }
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Enhanced error message for time parsing
            if (errorMessage.includes('Unsupported time expression')) {
                return { content: [{ type: "text", text: `🕒 **TIME EXPRESSION ERROR**: ${errorMessage}\n\n💡 **Quick Fixes:**\n- Try 'today', 'yesterday', 'this week' instead\n- For specific dates: Use 'July 14 2025' not 'Monday July 14'\n- Use relative terms: 'past 3 days', 'last Monday'` }], isError: true };
            }
            
            return { content: [{ type: "text", text: `❌ **API ERROR**: ${errorMessage}` }], isError: true };
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
            
            // Fetch all logs with pagination
            const allLogs: Lifelog[] = [];
            let cursor: string | undefined = undefined;
            
            while (true) {
                const result = await getLifelogsWithPagination(limitlessApiKey, {
                    start: timeRange.start,
                    end: timeRange.end,
                    timezone: timeRange.timezone,
                    includeMarkdown: true,
                    includeHeadings: true,
                    limit: MAX_API_LIMIT,
                    direction: 'asc',
                    cursor: cursor
                });
                
                allLogs.push(...result.lifelogs);
                
                if (!result.pagination.nextCursor || result.lifelogs.length < MAX_API_LIMIT) {
                    break;
                }
                cursor = result.pagination.nextCursor;
            }
            
            const meetings = MeetingDetector.detectMeetings(allLogs);
            
            // Filter by minimum duration if specified
            const filteredMeetings = meetings.filter(meeting => 
                meeting.duration >= (args.min_duration_minutes || 5) * 60 * 1000
            );
            
            return createSafeResponse(
                filteredMeetings,
                filteredMeetings.length === 0
                    ? `No meetings detected for "${timeExpression}"`
                    : `Found ${filteredMeetings.length} meeting(s) for "${timeExpression}"`
            );
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
    "Generate daily summary with auto-truncation for token limits. INCLUDES: meetings, action items, participants, topics. CONSTRAINTS: Large responses auto-truncated, use smaller date ranges if needed. ARGS: date (YYYY-MM-DD format, defaults today), timezone (optional). EXAMPLE: date='2025-07-14'.",
    DailySummaryArgsSchema,
    async (args, _extra) => {
        try {
            // Validate constraints
            const validation = validateApiConstraints(args);
            if (!validation.valid) {
                return { content: [{ type: "text", text: validation.error! }], isError: true };
            }
            
            const date = args.date || new Date().toISOString().split('T')[0];
            const summary = await DailySummaryGenerator.generateDailySummary(
                limitlessApiKey,
                date,
                args.timezone
            );
            
            return createSafeResponse(summary, `Daily summary for ${date}`);
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
            
            // Fetch all logs with pagination
            const allLogs: Lifelog[] = [];
            let cursor: string | undefined = undefined;
            
            while (true) {
                const result = await getLifelogsWithPagination(limitlessApiKey, {
                    start: timeRange.start,
                    end: timeRange.end,
                    timezone: timeRange.timezone,
                    includeMarkdown: true,
                    includeHeadings: true,
                    limit: MAX_API_LIMIT,
                    direction: 'asc',
                    cursor: cursor
                });
                
                allLogs.push(...result.lifelogs);
                
                if (!result.pagination.nextCursor || result.lifelogs.length < MAX_API_LIMIT) {
                    break;
                }
                cursor = result.pagination.nextCursor;
            }
            
            let allActionItems: ActionItem[] = [];
            
            for (const lifelog of allLogs) {
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
            
            return createSafeResponse(
                allActionItems,
                allActionItems.length === 0
                    ? `No action items found for "${timeExpression}"`
                    : `Found ${allActionItems.length} action item(s) for "${timeExpression}"`
            );
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
                
                // Fetch all logs with pagination
                let cursor: string | undefined = undefined;
                
                while (true) {
                    const result = await getLifelogsWithPagination(limitlessApiKey, {
                        start: timeRange.start,
                        end: timeRange.end,
                        timezone: timeRange.timezone,
                        includeMarkdown: true,
                        includeHeadings: true,
                        limit: MAX_API_LIMIT,
                        direction: 'asc',
                        cursor: cursor
                    });
                    
                    lifelogs.push(...result.lifelogs);
                    
                    if (!result.pagination.nextCursor || result.lifelogs.length < MAX_API_LIMIT) {
                        break;
                    }
                    cursor = result.pagination.nextCursor;
                }
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
                return createSafeResponse(transcript, `Detailed transcript for ${transcript.title}`);
            } else {
                // Multiple lifelogs combined transcript
                const result = TranscriptExtractor.extractMultipleTranscripts(lifelogs, transcriptOptions);
                return createSafeResponse(result, `Combined transcript analysis (${lifelogs.length} lifelogs)`);
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
            
            // Fetch all logs with pagination
            const allLogs: Lifelog[] = [];
            let cursor: string | undefined = undefined;
            
            while (true) {
                const result = await getLifelogsWithPagination(limitlessApiKey, {
                    start: timeRange.start,
                    end: timeRange.end,
                    timezone: timeRange.timezone,
                    includeMarkdown: true,
                    includeHeadings: true,
                    limit: MAX_API_LIMIT,
                    direction: 'asc',
                    cursor: cursor
                });
                
                allLogs.push(...result.lifelogs);
                
                if (!result.pagination.nextCursor || result.lifelogs.length < MAX_API_LIMIT) {
                    break;
                }
                cursor = result.pagination.nextCursor;
            }
            
            const logs = allLogs;
            
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
            
            return createSafeResponse(
                detailedAnalysis,
                `Detailed analysis for "${timeExpression}" (Focus: ${args.focus_area})`
            );
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error generating detailed analysis: ${errorMessage}` }], isError: true };
        }
    }
);


// Tool for fetching complete data with automatic pagination
server.tool("limitless_get_full_transcript",
    "Fetches complete transcript data for a date/range with automatic pagination. Handles large datasets by fetching all pages internally. Use this when you need complete transcript data without worrying about token limits.",
    {
        date: z.string().optional().describe("Specific date (YYYY-MM-DD format)"),
        start: z.string().optional().describe("Start datetime (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)"),
        end: z.string().optional().describe("End datetime (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS)"),
        timezone: z.string().optional().describe("IANA timezone"),
        isStarred: z.boolean().optional().describe("Filter for starred lifelogs only"),
        format: z.enum(["summary", "full", "transcript_only"]).optional().default("summary").describe("Output format: summary (key info only), full (all data), transcript_only (just text)")
    },
    async (args, _extra) => {
        try {
            // Validate date format
            if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
                return { content: [{ type: "text", text: `❌ Date format error: '${args.date}' must be YYYY-MM-DD` }], isError: true };
            }
            
            const allLifelogs: Lifelog[] = [];
            let cursor: string | undefined = undefined;
            let pageCount = 0;
            
            // Fetch all pages
            while (true) {
                pageCount++;
                const result = await getLifelogsWithPagination(limitlessApiKey, {
                    date: args.date,
                    start: args.start,
                    end: args.end,
                    timezone: args.timezone,
                    isStarred: args.isStarred,
                    includeMarkdown: true,
                    includeHeadings: true,
                    limit: MAX_API_LIMIT,
                    cursor: cursor,
                    direction: 'asc'
                });
                
                allLifelogs.push(...result.lifelogs);
                
                if (!result.pagination.nextCursor || result.lifelogs.length < MAX_API_LIMIT) {
                    break;
                }
                cursor = result.pagination.nextCursor;
            }
            
            if (allLifelogs.length === 0) {
                return { content: [{ type: "text", text: "No lifelogs found for the specified criteria." }] };
            }
            
            // Format based on requested output
            let output: any;
            let description: string;
            
            switch (args.format) {
                case "transcript_only":
                    // Extract just the transcript text
                    const transcripts = allLifelogs.map(log => ({
                        id: log.id,
                        date: log.startTime.split('T')[0],
                        transcript: log.markdown || "[No transcript available]"
                    }));
                    output = transcripts;
                    description = `Complete transcripts for ${allLifelogs.length} lifelogs (${pageCount} pages fetched)`;
                    break;
                    
                case "full":
                    // Return all data
                    output = allLifelogs;
                    description = `Complete data for ${allLifelogs.length} lifelogs (${pageCount} pages fetched)`;
                    break;
                    
                case "summary":
                default:
                    // Return summary with key information
                    const summaries = allLifelogs.map(log => ({
                        id: log.id,
                        title: log.title || "[Untitled]",
                        date: log.startTime.split('T')[0],
                        time: `${log.startTime.split('T')[1]?.split('.')[0]} - ${log.endTime.split('T')[1]?.split('.')[0]}`,
                        duration: calculateDuration(log.startTime, log.endTime),
                        starred: log.isStarred || false,
                        wordCount: log.markdown ? log.markdown.split(/\s+/).length : 0
                    }));
                    output = {
                        total: allLifelogs.length,
                        pages_fetched: pageCount,
                        date_range: {
                            start: allLifelogs[0].startTime,
                            end: allLifelogs[allLifelogs.length - 1].endTime
                        },
                        lifelogs: summaries
                    };
                    description = `Summary of ${allLifelogs.length} lifelogs`;
                    break;
            }
            
            // Check size and handle appropriately
            const estimatedSize = estimateTokens(JSON.stringify(output));
            if (estimatedSize > MAX_RESPONSE_TOKENS) {
                // Save to a structured format that can be processed in chunks
                return {
                    content: [{
                        type: "text",
                        text: `⚠️ Data too large for single response (${Math.ceil(estimatedSize / 1000)}k tokens)

Successfully fetched ${allLifelogs.length} lifelogs across ${pageCount} pages.

To access this data:
1. Use the regular list tools with cursor pagination
2. Request specific lifelogs by ID
3. Use the search or analytics tools for specific queries

Summary:
- Total lifelogs: ${allLifelogs.length}
- Date range: ${allLifelogs[0].startTime.split('T')[0]} to ${allLifelogs[allLifelogs.length - 1].endTime.split('T')[0]}
- Total word count: ${allLifelogs.reduce((sum, log) => sum + (log.markdown ? log.markdown.split(/\s+/).length : 0), 0).toLocaleString()}
- Starred items: ${allLifelogs.filter(log => log.isStarred).length}

First few IDs for reference:
${allLifelogs.slice(0, 5).map(log => `- ${log.id}: ${log.title || '[Untitled]'}`).join('\n')}`
                    }]
                };
            }
            
            return { content: [{ type: "text", text: `${description}:\n\n${JSON.stringify(output, null, 2)}` }] };
            
        } catch (error) {
            return handleToolApiCall(() => Promise.reject(error));
        }
    }
);

// Helper function to calculate duration
function calculateDuration(start: string, end: string): string {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMs = endTime - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${minutes}m`;
}

// --- Server Startup ---

async function main() {
    // Detect if running in terminal (common mistake)
    if (process.stdin.isTTY) {
        console.error("╔════════════════════════════════════════════════════════════════╗");
        console.error("║                    MCP Server Warning                          ║");
        console.error("╠════════════════════════════════════════════════════════════════╣");
        console.error("║ This server expects JSON-RPC input via stdin.                 ║");
        console.error("║ It is designed to be used with Claude Desktop or MCP clients. ║");
        console.error("║                                                                ║");
        console.error("║ ❌ NOT for direct terminal use                                ║");
        console.error("║ ❌ NOT an HTTP server (no curl/browser access)                ║");
        console.error("║ ❌ NOT accessible via ngrok or web tunnels                    ║");
        console.error("║                                                                ║");
        console.error("║ ✅ Configure in Claude Desktop: Settings → MCP                ║");
        console.error("║ ✅ Use with MCP-compatible clients                            ║");
        console.error("║                                                                ║");
        console.error("║ See README.md for proper configuration instructions.           ║");
        console.error("╚════════════════════════════════════════════════════════════════╝");
        console.error("");
        console.error("Waiting for JSON-RPC input on stdin...");
    }

    const transport = new StdioServerTransport();
    console.error("Limitless MCP Server starting...");
    server.server.onclose = () => { console.error("Connection closed."); };
    server.server.onerror = (error: Error) => { 
        // Enhanced error messages for common mistakes
        if (error.message.includes("Unexpected end of JSON input") || 
            error.message.includes("Unexpected token")) {
            console.error("MCP Server Error: Invalid JSON-RPC input received.");
            console.error("This often happens when HTTP requests are sent to the server.");
            console.error("Remember: This is NOT an HTTP server. Use Claude Desktop or an MCP client.");
        } else {
            console.error("MCP Server Error:", error);
        }
    };
    server.server.oninitialized = () => { console.error("Client initialized."); };
    try {
        await server.server.connect(transport);
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

main();