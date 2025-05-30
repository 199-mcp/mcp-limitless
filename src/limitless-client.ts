// Native fetch is available in Node.js >= 18

const LIMITLESS_API_URL = process.env.LIMITLESS_API_URL || "https://api.limitless.ai";
const API_TIMEOUT_MS = 120000; // 120 seconds timeout for API calls

export interface LifelogParams {
    limit?: number;
    batch_size?: number; // Used internally for pagination fetching
    includeMarkdown?: boolean;
    includeHeadings?: boolean;
    date?: string; // YYYY-MM-DD
    start?: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm:SS
    end?: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm:SS
    timezone?: string;
    direction?: "asc" | "desc";
    cursor?: string;
}

// Define LifelogContentNode - ADD export keyword
export interface LifelogContentNode {
    type: string;
    content?: string;
    startTime?: string;
    endTime?: string;
    startOffsetMs?: number;
    endOffsetMs?: number;
    children?: LifelogContentNode[];
    speakerName?: string | null;
    speakerIdentifier?: "user" | null;
    // Add other potential fields based on API spec if needed
}


export interface Lifelog {
    id: string;
    title?: string;
    markdown?: string;
    startTime: string;
    endTime: string;
    contents?: LifelogContentNode[]; // Use specific type
    // Add other fields from the API response as needed
}


export interface LifelogsResponse {
    data: {
        lifelogs: Lifelog[];
    };
    meta: {
        lifelogs: {
            nextCursor?: string;
            count: number;
        };
    };
}

export interface SingleLifelogResponse {
    data: {
        lifelog: Lifelog;
    };
}

export class LimitlessApiError extends Error {
    constructor(message: string, public status?: number, public responseBody?: any) {
        super(message);
        this.name = "LimitlessApiError";
    }
}

// Helper to get the system's default IANA timezone name
function getDefaultTimezone(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        // Cannot log here reliably for stdio
        // console.error("Could not determine default system timezone:", e);
        return undefined;
    }
}


async function makeApiRequest<T>(apiKey: string, endpoint: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    if (!apiKey) {
        // This error happens before connection, so logging might be okay, but let's throw directly.
        throw new LimitlessApiError("Limitless API key is missing. Please set LIMITLESS_API_KEY environment variable.", 401);
    }

    const url = new URL(`${LIMITLESS_API_URL}/${endpoint}`);
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            queryParams.set(key, String(value));
        }
    }
    url.search = queryParams.toString();

    const requestUrl = url.toString();
    // Cannot log here reliably for stdio
    // console.error(`[Limitless Client] Requesting: ${requestUrl}`);

    let response: Response | undefined; // Uses global Response type now
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        response = await fetch(requestUrl, { // Uses global fetch now
            headers: {
                "X-API-Key": apiKey,
                "Accept": "application/json",
            },
            signal: controller.signal // Pass abort signal
        });
        clearTimeout(timeoutId); // Clear timeout if fetch completes

        if (!response.ok) {
            // Read body as text first to avoid "body used already"
            const errorText = await response.text();
            let errorBody: any;
            try { errorBody = JSON.parse(errorText); } catch (e) { errorBody = errorText; }
            // Cannot log here reliably for stdio
            // console.error(`[Limitless Client] Error Response ${response.status} from ${requestUrl}:`, errorBody);
            throw new LimitlessApiError(`Limitless API Error: ${response.status} ${response.statusText}`, response.status, errorBody);
        }

        // Only parse JSON if response is ok
        return await response.json() as T;

    } catch (error: any) {
        clearTimeout(timeoutId); // Clear timeout on error too
        if (error.name === 'AbortError') {
             // Cannot log here reliably for stdio
            // console.error(`[Limitless Client] Timeout error for ${requestUrl}`);
            throw new LimitlessApiError(`Limitless API request timed out after ${API_TIMEOUT_MS}ms`, 504);
        }
        // Don't log generic network errors here either, just re-throw
        if (error instanceof LimitlessApiError) { throw error; }
        throw new LimitlessApiError(`Network error calling Limitless API: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getLifelogs(apiKey: string, options: LifelogParams = {}): Promise<Lifelog[]> {
    const allLifelogs: Lifelog[] = [];
    let currentCursor = options.cursor;
    const limit = options.limit;
    const batchSize = 10;
    const defaultTimezone = getDefaultTimezone();

    const originalOptions = {
        includeMarkdown: options.includeMarkdown ?? true,
        includeHeadings: options.includeHeadings ?? true,
        date: options.date,
        start: options.start,
        end: options.end,
        direction: options.direction ?? 'desc',
        timezone: options.timezone ?? defaultTimezone,
    };

    // Cannot log here reliably for stdio
    // if (originalOptions.timezone === undefined && defaultTimezone === undefined) { ... }

    let page = 0;
    while (true) {
        page++;
        const remainingNeeded = limit !== undefined ? limit - allLifelogs.length : Infinity;
        if (remainingNeeded <= 0 && limit !== undefined) break;

        const fetchLimit = Math.min(batchSize, remainingNeeded === Infinity ? batchSize : remainingNeeded);

        const params: Record<string, string | number | boolean | undefined> = {
            limit: fetchLimit,
            includeMarkdown: originalOptions.includeMarkdown,
            includeHeadings: originalOptions.includeHeadings,
            date: originalOptions.date,
            start: originalOptions.start,
            end: originalOptions.end,
            direction: originalOptions.direction,
            timezone: originalOptions.timezone,
            cursor: currentCursor,
        };
        if (!params.timezone) delete params.timezone;

        // Cannot log here reliably for stdio
        // console.error(`[Limitless Client] Fetching page ${page} ...`);
        const response = await makeApiRequest<LifelogsResponse>(apiKey, "v1/lifelogs", params);
        const lifelogs = response.data?.lifelogs ?? [];
        // Cannot log here reliably for stdio
        // console.error(`[Limitless Client] Received ${lifelogs.length} logs from page ${page}.`);

        allLifelogs.push(...lifelogs);
        const nextCursor = response.meta?.lifelogs?.nextCursor;

        if (!nextCursor || lifelogs.length < fetchLimit || (limit !== undefined && allLifelogs.length >= limit)) {
            break;
        }
        currentCursor = nextCursor;
    }

    return limit !== undefined ? allLifelogs.slice(0, limit) : allLifelogs;
}

export async function getLifelogById(apiKey: string, lifelogId: string, options: Pick<LifelogParams, 'includeMarkdown' | 'includeHeadings'> = {}): Promise<Lifelog> {
    // Cannot log here reliably for stdio
    // console.error(`[Limitless Client] Requesting lifelog by ID: ${lifelogId}`);
    const params: Record<string, string | number | boolean | undefined> = {
        includeMarkdown: options.includeMarkdown ?? true,
        includeHeadings: options.includeHeadings ?? true,
    };
    const response = await makeApiRequest<SingleLifelogResponse>(apiKey, `v1/lifelogs/${lifelogId}`, params);
    if (!response.data?.lifelog) {
        throw new LimitlessApiError(`Lifelog with ID ${lifelogId} not found`, 404);
    }
    return response.data.lifelog;
}