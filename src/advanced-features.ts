import { Lifelog, LifelogContentNode, LifelogParams, getLifelogs } from "./limitless-client.js";

// =============================================================================
// ADVANCED TYPES AND INTERFACES
// =============================================================================

export interface TimeRange {
    start: string;
    end: string;
    timezone?: string;
}

export interface NaturalTimeOptions {
    timezone?: string;
    referenceTime?: Date;
}

export interface MeetingParticipant {
    name: string;
    identifier?: "user" | null;
    speakingDuration: number; // in milliseconds
    messageCount: number;
}

export interface Meeting {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    duration: number; // in milliseconds
    participants: MeetingParticipant[];
    mainTopics: string[];
    actionItems: ActionItem[];
    keyDecisions: string[];
    summary: string;
    lifelogIds: string[];
}

export interface ActionItem {
    content: string;
    assignee?: string;
    context: string;
    timestamp: string;
    priority: "high" | "medium" | "low";
    source: {
        lifelogId: string;
        nodeIndex: number;
    };
}

export interface ConversationSegment {
    participant: string;
    content: string;
    startTime: string;
    endTime: string;
    duration: number;
}

export interface TopicSearchResult {
    lifelog: Lifelog;
    relevantNodes: LifelogContentNode[];
    contextBefore: LifelogContentNode[];
    contextAfter: LifelogContentNode[];
    relevanceScore: number;
    summary: string;
}

export interface DailySummary {
    date: string;
    timezone: string;
    meetings: Meeting[];
    totalRecordingTime: number;
    totalSpeakingTime: number;
    topParticipants: MeetingParticipant[];
    keyTopics: string[];
    actionItems: ActionItem[];
    insights: {
        mostProductiveHours: string[];
        longestMeeting: Meeting | null;
        mostFrequentParticipant: string | null;
        topicsDiscussed: number;
    };
}

export interface SpeakerAnalytics {
    participant: string;
    totalSpeakingTime: number; // milliseconds
    conversationCount: number;
    averageConversationLength: number;
    topTopics: string[];
    timeDistribution: {
        hour: number;
        duration: number;
    }[];
    recentInteractions: {
        date: string;
        duration: number;
        topics: string[];
    }[];
}

// =============================================================================
// NATURAL TIME PARSING UTILITIES
// =============================================================================

/**
 * Parses natural language time expressions into precise date ranges
 * Supports timezone-aware parsing with comprehensive error handling
 */
export class NaturalTimeParser {
    private timezone: string;
    private referenceTime: Date;

    constructor(options: NaturalTimeOptions = {}) {
        this.timezone = options.timezone || this.getDefaultTimezone();
        this.referenceTime = options.referenceTime || new Date();
    }

    private getDefaultTimezone(): string {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            return "UTC";
        }
    }

    /**
     * Parse natural time expressions into TimeRange objects
     */
    parseTimeExpression(expression: string): TimeRange {
        const normalized = expression.toLowerCase().trim();
        
        // Get current time in target timezone
        const now = new Date(this.referenceTime);
        const currentDate = new Date(now.toLocaleString("en-US", { timeZone: this.timezone }));
        
        // Basic day references
        switch (normalized) {
            case "today":
                return this.getDayRange(currentDate);
            
            case "yesterday":
                const yesterday = new Date(currentDate);
                yesterday.setDate(yesterday.getDate() - 1);
                return this.getDayRange(yesterday);
            
            case "tomorrow":
                const tomorrow = new Date(currentDate);
                tomorrow.setDate(tomorrow.getDate() + 1);
                return this.getDayRange(tomorrow);
            
            // Time of day - today
            case "this morning":
            case "morning":
                return this.getTimeOfDayRange(currentDate, 6, 12);
            
            case "this afternoon":
            case "afternoon":
                return this.getTimeOfDayRange(currentDate, 12, 18);
            
            case "this evening":
            case "evening":
                return this.getTimeOfDayRange(currentDate, 18, 22);
            
            case "tonight":
            case "this night":
                return this.getTimeOfDayRange(currentDate, 20, 23, 59);
            
            case "earlier today":
            case "earlier":
                const earlierEnd = new Date(currentDate);
                return this.getTimeOfDayRange(currentDate, 0, earlierEnd.getHours());
            
            case "later today":
                const laterStart = new Date(currentDate);
                return this.getTimeOfDayRange(currentDate, laterStart.getHours(), 23, 59);
            
            // Yesterday time periods
            case "yesterday morning":
                const yesterdayMorning = new Date(currentDate);
                yesterdayMorning.setDate(yesterdayMorning.getDate() - 1);
                return this.getTimeOfDayRange(yesterdayMorning, 6, 12);
            
            case "yesterday afternoon":
                const yesterdayAfternoon = new Date(currentDate);
                yesterdayAfternoon.setDate(yesterdayAfternoon.getDate() - 1);
                return this.getTimeOfDayRange(yesterdayAfternoon, 12, 18);
            
            case "yesterday evening":
                const yesterdayEvening = new Date(currentDate);
                yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
                return this.getTimeOfDayRange(yesterdayEvening, 18, 22);
            
            case "last night":
                const lastNight = new Date(currentDate);
                lastNight.setDate(lastNight.getDate() - 1);
                return this.getTimeOfDayRange(lastNight, 20, 23, 59);
            
            // Tomorrow time periods
            case "tomorrow morning":
                const tomorrowMorning = new Date(currentDate);
                tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
                return this.getTimeOfDayRange(tomorrowMorning, 6, 12);
            
            case "tomorrow afternoon":
                const tomorrowAfternoon = new Date(currentDate);
                tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
                return this.getTimeOfDayRange(tomorrowAfternoon, 12, 18);
            
            case "tomorrow evening":
                const tomorrowEvening = new Date(currentDate);
                tomorrowEvening.setDate(tomorrowEvening.getDate() + 1);
                return this.getTimeOfDayRange(tomorrowEvening, 18, 22);
            
            // Week references
            case "this week":
                return this.getWeekRange(currentDate);
            
            case "last week":
                const lastWeek = new Date(currentDate);
                lastWeek.setDate(lastWeek.getDate() - 7);
                return this.getWeekRange(lastWeek);
            
            case "next week":
                const nextWeek = new Date(currentDate);
                nextWeek.setDate(nextWeek.getDate() + 7);
                return this.getWeekRange(nextWeek);
            
            // Weekend references
            case "this weekend":
                return this.getWeekendRange(currentDate);
            
            case "last weekend":
                const lastWeekendDate = new Date(currentDate);
                lastWeekendDate.setDate(lastWeekendDate.getDate() - 7);
                return this.getWeekendRange(lastWeekendDate);
            
            case "next weekend":
                const nextWeekendDate = new Date(currentDate);
                nextWeekendDate.setDate(nextWeekendDate.getDate() + 7);
                return this.getWeekendRange(nextWeekendDate);
            
            // Month references
            case "this month":
                return this.getMonthRange(currentDate);
            
            case "last month":
                const lastMonth = new Date(currentDate);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                return this.getMonthRange(lastMonth);
            
            case "next month":
                const nextMonth = new Date(currentDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                return this.getMonthRange(nextMonth);
            
            // Year references
            case "this year":
                return this.getYearRange(currentDate);
            
            case "last year":
                const lastYear = new Date(currentDate);
                lastYear.setFullYear(lastYear.getFullYear() - 1);
                return this.getYearRange(lastYear);
            
            // Quarter references
            case "this quarter":
            case "q" + (Math.floor(currentDate.getMonth() / 3) + 1):
                return this.getQuarterRange(currentDate);
            
            case "last quarter":
                const lastQuarter = new Date(currentDate);
                lastQuarter.setMonth(lastQuarter.getMonth() - 3);
                return this.getQuarterRange(lastQuarter);
            
            case "q1":
                return this.getSpecificQuarterRange(currentDate.getFullYear(), 1);
            
            case "q2":
                return this.getSpecificQuarterRange(currentDate.getFullYear(), 2);
            
            case "q3":
                return this.getSpecificQuarterRange(currentDate.getFullYear(), 3);
            
            case "q4":
                return this.getSpecificQuarterRange(currentDate.getFullYear(), 4);
            
            // Informal references
            case "recently":
                return this.getRelativeDayRange(currentDate, -14, 0);
            
            case "the other day":
                return this.getRelativeDayRange(currentDate, -4, -2);
            
            case "a few days ago":
                return this.getRelativeDayRange(currentDate, -4, -2);
            
            case "a couple days ago":
            case "couple days ago":
                return this.getRelativeDayRange(currentDate, -2, -2);
            
            // Boundary references
            case "beginning of the week":
            case "start of the week":
                const weekStart = new Date(currentDate);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                return this.getDayRange(weekStart);
            
            case "end of the week":
                const weekEnd = new Date(currentDate);
                weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
                return this.getDayRange(weekEnd);
            
            case "beginning of the month":
            case "start of the month":
                const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                return this.getDayRange(monthStart);
            
            case "end of the month":
                const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                return this.getDayRange(monthEnd);
            
            // Special fixed ranges (backward compatibility)
            case "past 3 days":
                return this.getRelativeDayRange(currentDate, -3, 0);
            
            case "past week":
                return this.getRelativeDayRange(currentDate, -7, 0);
            
            case "past month":
                return this.getRelativeDayRange(currentDate, -30, 0);
            
            default:
                // Try to parse flexible relative expressions like "past N days"
                const flexibleMatch = this.parseFlexibleRelativeExpression(normalized, currentDate);
                if (flexibleMatch) return flexibleMatch;
                
                // Try to parse specific day names like "last monday", "tuesday"
                const dayMatch = this.parseDayReference(normalized, currentDate);
                if (dayMatch) return dayMatch;
                
                // Try to parse relative expressions like "2 days ago"
                const relativeMatch = this.parseRelativeExpression(normalized, currentDate);
                if (relativeMatch) return relativeMatch;
                
                // Try to parse future expressions like "in 2 days"
                const futureMatch = this.parseFutureExpression(normalized, currentDate);
                if (futureMatch) return futureMatch;
                
                throw new Error(`Unsupported time expression: "${expression}". Supported: today, yesterday, tomorrow, this/last/next week/month/year, weekends, mornings/afternoons/evenings, quarters, relative expressions (N days ago, past N days), and more. See documentation for full list.`);
        }
    }

    private getDayRange(date: Date): TimeRange {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getTimeOfDayRange(date: Date, startHour: number, endHour: number, endMinute: number = 0): TimeRange {
        const start = new Date(date);
        start.setHours(startHour, 0, 0, 0);
        
        const end = new Date(date);
        end.setHours(endHour, endMinute, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getWeekRange(date: Date): TimeRange {
        const start = new Date(date);
        start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(start);
        end.setDate(end.getDate() + 6); // End of week (Saturday)
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getRelativeDayRange(date: Date, daysBefore: number, daysAfter: number): TimeRange {
        const start = new Date(date);
        start.setDate(start.getDate() + daysBefore);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(date);
        end.setDate(end.getDate() + daysAfter);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private parseDayReference(expression: string, currentDate: Date): TimeRange | null {
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        
        // Match patterns like "last monday", "tuesday", "next friday"
        const dayPattern = /^(last\s+|next\s+)?(\w+)$/;
        const match = expression.match(dayPattern);
        
        if (!match) return null;
        
        const modifier = match[1]?.trim();
        const dayName = match[2];
        const dayIndex = dayNames.indexOf(dayName);
        
        if (dayIndex === -1) return null;
        
        const targetDate = new Date(currentDate);
        const currentDay = currentDate.getDay();
        
        let daysOffset = dayIndex - currentDay;
        
        if (modifier === "last") {
            if (daysOffset >= 0) daysOffset -= 7;
        } else if (modifier === "next") {
            if (daysOffset <= 0) daysOffset += 7;
        } else {
            // No modifier - find closest occurrence
            if (daysOffset < 0) daysOffset += 7;
        }
        
        targetDate.setDate(targetDate.getDate() + daysOffset);
        return this.getDayRange(targetDate);
    }

    private getWeekendRange(date: Date): TimeRange {
        // Find the Saturday of the week containing date
        const saturday = new Date(date);
        const dayOfWeek = saturday.getDay();
        const daysToSaturday = (6 - dayOfWeek + 7) % 7;
        saturday.setDate(saturday.getDate() + daysToSaturday);
        
        // Weekend is Saturday and Sunday
        const start = new Date(saturday);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(saturday);
        end.setDate(end.getDate() + 1); // Sunday
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getMonthRange(date: Date): TimeRange {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getYearRange(date: Date): TimeRange {
        const start = new Date(date.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(date.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getQuarterRange(date: Date): TimeRange {
        const quarter = Math.floor(date.getMonth() / 3);
        const start = new Date(date.getFullYear(), quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(date.getFullYear(), (quarter + 1) * 3, 0);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private getSpecificQuarterRange(year: number, quarter: number): TimeRange {
        const start = new Date(year, (quarter - 1) * 3, 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(year, quarter * 3, 0);
        end.setHours(23, 59, 59, 999);
        
        return {
            start: this.formatDateTime(start),
            end: this.formatDateTime(end),
            timezone: this.timezone
        };
    }

    private parseFlexibleRelativeExpression(expression: string, currentDate: Date): TimeRange | null {
        // Match patterns like "past 5 days", "last 2 weeks", "past 3 months"
        const patterns = [
            /^(?:past|last)\s+(\d+)\s+(day|days|week|weeks|month|months)$/,
            /^(?:previous|prior)\s+(\d+)\s+(day|days|week|weeks|month|months)$/
        ];
        
        for (const pattern of patterns) {
            const match = expression.match(pattern);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2];
                
                if (unit.startsWith("day")) {
                    return this.getRelativeDayRange(currentDate, -amount, 0);
                } else if (unit.startsWith("week")) {
                    return this.getRelativeDayRange(currentDate, -(amount * 7), 0);
                } else if (unit.startsWith("month")) {
                    const start = new Date(currentDate);
                    start.setMonth(start.getMonth() - amount);
                    return {
                        start: this.formatDateTime(start),
                        end: this.formatDateTime(currentDate),
                        timezone: this.timezone
                    };
                }
            }
        }
        
        return null;
    }

    private parseFutureExpression(expression: string, currentDate: Date): TimeRange | null {
        // Match patterns like "in 2 days", "in a week", "in 3 hours"
        const pattern = /^in\s+(?:a|an|\d+)\s+(day|days|week|weeks|month|months|hour|hours)$/;
        const match = expression.match(pattern);
        
        if (!match) return null;
        
        const amountMatch = expression.match(/\d+/);
        const amount = amountMatch ? parseInt(amountMatch[0]) : 1;
        const unit = match[1];
        
        const targetDate = new Date(currentDate);
        
        if (unit.startsWith("day")) {
            targetDate.setDate(targetDate.getDate() + amount);
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("week")) {
            targetDate.setDate(targetDate.getDate() + (amount * 7));
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("month")) {
            targetDate.setMonth(targetDate.getMonth() + amount);
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("hour")) {
            const end = new Date(currentDate);
            end.setHours(end.getHours() + amount);
            
            return {
                start: this.formatDateTime(currentDate),
                end: this.formatDateTime(end),
                timezone: this.timezone
            };
        }
        
        return null;
    }

    private parseRelativeExpression(expression: string, currentDate: Date): TimeRange | null {
        // Match patterns like "2 days ago", "3 hours ago", "1 week ago"
        const relativePattern = /^(\d+)\s+(day|days|hour|hours|week|weeks|month|months)\s+ago$/;
        const match = expression.match(relativePattern);
        
        if (!match) return null;
        
        const amount = parseInt(match[1]);
        const unit = match[2];
        
        const targetDate = new Date(currentDate);
        
        if (unit.startsWith("day")) {
            targetDate.setDate(targetDate.getDate() - amount);
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("week")) {
            targetDate.setDate(targetDate.getDate() - (amount * 7));
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("month")) {
            targetDate.setMonth(targetDate.getMonth() - amount);
            return this.getDayRange(targetDate);
        } else if (unit.startsWith("hour")) {
            const start = new Date(currentDate);
            start.setHours(start.getHours() - amount);
            
            return {
                start: this.formatDateTime(start),
                end: this.formatDateTime(currentDate),
                timezone: this.timezone
            };
        }
        
        return null;
    }

    private formatDateTime(date: Date): string {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }
}

// =============================================================================
// MEETING DETECTION UTILITIES
// =============================================================================

/**
 * Intelligent meeting detection based on speaker patterns and conversation flow
 */
export class MeetingDetector {
    
    /**
     * Detect meetings from lifelogs using sophisticated analysis
     */
    static detectMeetings(lifelogs: Lifelog[]): Meeting[] {
        if (!lifelogs.length) return [];
        
        // Group lifelogs by continuous time periods
        const timeGroups = this.groupByTimeProximity(lifelogs);
        
        // Analyze each group for meeting characteristics
        const meetings: Meeting[] = [];
        
        for (const group of timeGroups) {
            const meeting = this.analyzePotentialMeeting(group);
            if (meeting) {
                meetings.push(meeting);
            }
        }
        
        return meetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    private static groupByTimeProximity(lifelogs: Lifelog[], maxGapMinutes: number = 15): Lifelog[][] {
        if (!lifelogs.length) return [];
        
        // Sort by start time
        const sorted = [...lifelogs].sort((a, b) => 
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        
        const groups: Lifelog[][] = [];
        let currentGroup: Lifelog[] = [sorted[0]];
        
        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const previous = currentGroup[currentGroup.length - 1];
            
            const gap = new Date(current.startTime).getTime() - new Date(previous.endTime).getTime();
            const gapMinutes = gap / (1000 * 60);
            
            if (gapMinutes <= maxGapMinutes) {
                currentGroup.push(current);
            } else {
                groups.push(currentGroup);
                currentGroup = [current];
            }
        }
        
        groups.push(currentGroup);
        return groups;
    }

    private static analyzePotentialMeeting(lifelogs: Lifelog[]): Meeting | null {
        if (!lifelogs.length) return null;
        
        // Extract all speakers and content nodes
        const allNodes: LifelogContentNode[] = [];
        const speakers = new Set<string>();
        let hasUserSpeaker = false;
        
        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                allNodes.push(...lifelog.contents);
                
                for (const node of lifelog.contents) {
                    if (node.speakerName) {
                        speakers.add(node.speakerName);
                    }
                    if (node.speakerIdentifier === "user") {
                        hasUserSpeaker = true;
                    }
                }
            }
        }
        
        // Meeting criteria: multiple speakers OR user interaction OR significant duration
        const duration = new Date(lifelogs[lifelogs.length - 1].endTime).getTime() - 
                        new Date(lifelogs[0].startTime).getTime();
        const durationMinutes = duration / (1000 * 60);
        
        const isMeeting = speakers.size > 1 || hasUserSpeaker || durationMinutes > 5;
        
        if (!isMeeting) return null;
        
        // Build meeting object
        const participants = this.extractParticipants(allNodes);
        const actionItems = ActionItemExtractor.extractFromNodes(allNodes, lifelogs[0].id);
        const topics = this.extractTopics(allNodes);
        const keyDecisions = this.extractDecisions(allNodes);
        
        return {
            id: `meeting_${lifelogs[0].startTime}_${lifelogs.length}`,
            title: this.generateMeetingTitle(lifelogs, participants),
            startTime: lifelogs[0].startTime,
            endTime: lifelogs[lifelogs.length - 1].endTime,
            duration,
            participants,
            mainTopics: topics,
            actionItems,
            keyDecisions,
            summary: this.generateMeetingSummary(lifelogs, participants, topics),
            lifelogIds: lifelogs.map(l => l.id)
        };
    }

    private static extractParticipants(nodes: LifelogContentNode[]): MeetingParticipant[] {
        const participantMap = new Map<string, {
            name: string;
            identifier?: "user" | null;
            duration: number;
            messageCount: number;
        }>();
        
        for (const node of nodes) {
            if (node.speakerName) {
                const existing = participantMap.get(node.speakerName) || {
                    name: node.speakerName,
                    identifier: node.speakerIdentifier,
                    duration: 0,
                    messageCount: 0
                };
                
                existing.messageCount++;
                
                if (node.startOffsetMs !== undefined && node.endOffsetMs !== undefined) {
                    existing.duration += node.endOffsetMs - node.startOffsetMs;
                }
                
                participantMap.set(node.speakerName, existing);
            }
        }
        
        return Array.from(participantMap.values()).map(p => ({
            name: p.name,
            identifier: p.identifier,
            speakingDuration: p.duration,
            messageCount: p.messageCount
        }));
    }

    private static extractTopics(nodes: LifelogContentNode[]): string[] {
        const topics: string[] = [];
        
        for (const node of nodes) {
            if (node.type === "heading1" || node.type === "heading2") {
                if (node.content) {
                    topics.push(node.content);
                }
            }
        }
        
        return topics.slice(0, 5); // Top 5 topics
    }

    private static extractDecisions(nodes: LifelogContentNode[]): string[] {
        const decisions: string[] = [];
        const decisionKeywords = /\b(decided|agreed|concluded|determined|resolved|final decision|we will|going with)\b/i;
        
        for (const node of nodes) {
            if (node.content && decisionKeywords.test(node.content)) {
                decisions.push(node.content);
            }
        }
        
        return decisions;
    }

    private static generateMeetingTitle(lifelogs: Lifelog[], participants: MeetingParticipant[]): string {
        // Use first heading if available
        for (const lifelog of lifelogs) {
            if (lifelog.title && lifelog.title.trim()) {
                return lifelog.title;
            }
        }
        
        // Generate from participants
        if (participants.length > 1) {
            const others = participants.filter(p => p.identifier !== "user").map(p => p.name);
            if (others.length > 0) {
                return `Meeting with ${others.slice(0, 2).join(", ")}${others.length > 2 ? ` and ${others.length - 2} others` : ""}`;
            }
        }
        
        // Fallback to time-based title
        const startTime = new Date(lifelogs[0].startTime);
        return `Meeting at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    private static generateMeetingSummary(lifelogs: Lifelog[], participants: MeetingParticipant[], topics: string[]): string {
        const participantNames = participants.map(p => p.name).join(", ");
        const duration = Math.round((new Date(lifelogs[lifelogs.length - 1].endTime).getTime() - 
                                   new Date(lifelogs[0].startTime).getTime()) / (1000 * 60));
        
        // Extract key technical details, numbers, and specific information
        const allNodes: LifelogContentNode[] = [];
        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                allNodes.push(...lifelog.contents);
            }
        }
        const technicalDetails = this.extractTechnicalDetails(lifelogs);
        const numbersAndFigures = this.extractNumbersAndFigures(lifelogs);
        const keyDecisions = this.extractDecisions(allNodes);
        
        let summary = `${duration}-minute meeting with ${participantNames}.`;
        
        if (topics.length > 0) {
            summary += ` Topics covered: ${topics.join(", ")}.`;
        }
        
        if (technicalDetails.length > 0) {
            summary += ` Technical elements discussed: ${technicalDetails.slice(0, 5).join(", ")}.`;
        }
        
        if (numbersAndFigures.length > 0) {
            summary += ` Key figures mentioned: ${numbersAndFigures.slice(0, 8).join(", ")}.`;
        }
        
        if (keyDecisions.length > 0) {
            summary += ` Decisions made: ${keyDecisions.slice(0, 3).join("; ")}.`;
        }
        
        return summary;
    }

    private static extractTechnicalDetails(lifelogs: Lifelog[]): string[] {
        const technicalTerms = new Set<string>();
        const technicalPatterns = [
            // Scientific and medical terms
            /\b[A-Z][a-z]+(?:ine|ase|oid|gen|ide|ate|ium|sis|tion|logy|graphy|metry|scopy|therapy|diagnosis)\b/g,
            // Technical abbreviations and acronyms
            /\b[A-Z]{2,6}\b/g,
            // Software/technology terms
            /\b(?:API|SDK|REST|GraphQL|JSON|XML|HTTP|HTTPS|SQL|NoSQL|CI\/CD|DevOps|ML|AI|GPU|CPU|RAM|SSD|IoT|VR|AR|blockchain|cryptocurrency|algorithm|database|server|cloud|kubernetes|docker|microservice)\b/gi,
            // Scientific units and measurements
            /\b\d+(?:\.\d+)?\s*(?:mg|kg|ml|cm|mm|km|hz|ghz|mb|gb|tb|fps|rpm|°[CF]|pH|ppm|mol|atm|bar|pascal|joule|watt|volt|amp|ohm)\b/gi,
            // Chemical formulas
            /\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*\b/g,
            // Version numbers and model numbers
            /\bv?\d+\.\d+(?:\.\d+)*\b|\b[A-Z]+\d+[A-Z]*\d*\b/gi
        ];

        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                for (const node of lifelog.contents) {
                    if (node.content) {
                        for (const pattern of technicalPatterns) {
                            const matches = node.content.match(pattern) || [];
                            matches.forEach(match => {
                                if (match.length > 2) {
                                    technicalTerms.add(match);
                                }
                            });
                        }
                    }
                }
            }
        }

        return Array.from(technicalTerms).slice(0, 10);
    }

    private static extractNumbersAndFigures(lifelogs: Lifelog[]): string[] {
        const figures = new Set<string>();
        const numberPatterns = [
            // Percentages and ratios
            /\b\d+(?:\.\d+)?%\b|\b\d+:\d+\b|\b\d+\/\d+\b/g,
            // Currency amounts
            /\$\d+(?:,\d{3})*(?:\.\d{2})?\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD|EUR|GBP|million|billion|thousand|k)\b/gi,
            // Large numbers with commas
            /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,
            // Time durations with specific units
            /\b\d+(?:\.\d+)?\s*(?:hours?|minutes?|seconds?|days?|weeks?|months?|years?|milliseconds?|microseconds?)\b/gi,
            // Dates with specific formats
            /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
            // Scientific notation
            /\b\d+(?:\.\d+)?[eE][+-]?\d+\b/g,
            // Specific measurements
            /\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?\b/g
        ];

        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                for (const node of lifelog.contents) {
                    if (node.content) {
                        for (const pattern of numberPatterns) {
                            const matches = node.content.match(pattern) || [];
                            matches.forEach(match => figures.add(match));
                        }
                    }
                }
            }
        }

        return Array.from(figures).slice(0, 15);
    }
}

// =============================================================================
// ACTION ITEM EXTRACTION
// =============================================================================

export class ActionItemExtractor {
    private static readonly ACTION_PATTERNS = [
        // Direct commitments with technical context
        /\b(I'll|I will|I need to|I should|I must)\s+([^.!?]{5,150})/gi,
        // Explicit action items with detailed context
        /\b(todo|to do|action item|task|deliverable):\s*([^.!?]{5,200})/gi,
        // Follow-up actions with specifics
        /\b(follow up|follow-up)\s+(on|with)\s+([^.!?]{5,150})/gi,
        // Specific actions with verbs and context
        /\b(need to|should|must|will|have to)\s+(send|call|email|schedule|review|update|create|finish|complete|implement|develop|test|deploy|analyze|research|investigate|prepare|draft|submit|approve)\s+([^.!?]{5,200})/gi,
        // Deadlines with detailed context
        /\b(by\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|by\s+\d+|before\s+\d+|deadline|due)\s*:?\s*([^.!?]{10,200})/gi,
        // Technical implementation tasks
        /\b(implement|develop|build|code|write|design|architect|deploy|configure|setup|install|upgrade|migrate|optimize|refactor|debug|fix|patch)\s+([^.!?]{10,200})/gi,
        // Research and analysis tasks
        /\b(research|investigate|analyze|evaluate|assess|review|study|examine|explore|compare)\s+([^.!?]{10,200})/gi,
        // Decision-making commitments
        /\b(decide|determine|choose|select|finalize|confirm|approve|reject)\s+([^.!?]{10,200})/gi
    ];

    static extractFromNodes(nodes: LifelogContentNode[], lifelogId: string): ActionItem[] {
        const actionItems: ActionItem[] = [];
        
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node.content) continue;
            
            for (const pattern of this.ACTION_PATTERNS) {
                const matches = Array.from(node.content.matchAll(pattern));
                
                for (const match of matches) {
                    const content = (match[2] || match[1]).trim();
                    if (content.length > 5) { // Filter out very short matches
                        
                        actionItems.push({
                            content,
                            assignee: node.speakerIdentifier === "user" ? "user" : node.speakerName || undefined,
                            context: this.getContext(nodes, i),
                            timestamp: node.startTime || "",
                            priority: this.inferPriority(content),
                            source: {
                                lifelogId,
                                nodeIndex: i
                            }
                        });
                    }
                }
            }
        }
        
        return this.deduplicateActionItems(actionItems);
    }

    private static getContext(nodes: LifelogContentNode[], currentIndex: number): string {
        const contextRange = 3; // Increased for more context
        const start = Math.max(0, currentIndex - contextRange);
        const end = Math.min(nodes.length, currentIndex + contextRange + 1);
        
        const contextNodes = nodes.slice(start, end);
        let context = "";
        
        // Build rich context with speakers and technical details
        for (let i = 0; i < contextNodes.length; i++) {
            const node = contextNodes[i];
            if (!node.content || !node.content.trim()) continue;
            
            const isCurrentNode = (start + i) === currentIndex;
            const speaker = node.speakerName ? `${node.speakerName}: ` : "";
            const marker = isCurrentNode ? ">>> " : "";
            
            context += `${marker}${speaker}${node.content.trim()} `;
        }
        
        // Preserve technical terms, numbers, and specific details in context
        return context.slice(0, 400).trim() + (context.length > 400 ? "..." : "");
    }

    private static inferPriority(content: string): "high" | "medium" | "low" {
        const highPriorityKeywords = /\b(urgent|asap|immediately|critical|important|deadline|by tomorrow|by today)\b/i;
        const mediumPriorityKeywords = /\b(soon|this week|by friday|follow up|review)\b/i;
        
        if (highPriorityKeywords.test(content)) return "high";
        if (mediumPriorityKeywords.test(content)) return "medium";
        return "low";
    }

    private static deduplicateActionItems(items: ActionItem[]): ActionItem[] {
        const seen = new Set<string>();
        return items.filter(item => {
            const key = item.content.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}