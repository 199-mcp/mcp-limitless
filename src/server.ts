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


// --- MCP Server Setup ---

const server = new McpServer({
    name: "LimitlessMCP",
    version: "0.2.0",
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