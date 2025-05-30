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
        
        switch (normalized) {
            case "today":
                return this.getDayRange(currentDate);
            
            case "yesterday":
                const yesterday = new Date(currentDate);
                yesterday.setDate(yesterday.getDate() - 1);
                return this.getDayRange(yesterday);
            
            case "this morning":
                return this.getTimeOfDayRange(currentDate, 6, 12);
            
            case "this afternoon":
                return this.getTimeOfDayRange(currentDate, 12, 18);
            
            case "this evening":
                return this.getTimeOfDayRange(currentDate, 18, 22);
            
            case "this week":
                return this.getWeekRange(currentDate);
            
            case "last week":
                const lastWeek = new Date(currentDate);
                lastWeek.setDate(lastWeek.getDate() - 7);
                return this.getWeekRange(lastWeek);
            
            case "past 3 days":
                return this.getRelativeDayRange(currentDate, -3, 0);
            
            case "past week":
                return this.getRelativeDayRange(currentDate, -7, 0);
            
            case "past month":
                return this.getRelativeDayRange(currentDate, -30, 0);
            
            default:
                // Try to parse specific day names like "last monday", "tuesday"
                const dayMatch = this.parseDayReference(normalized, currentDate);
                if (dayMatch) return dayMatch;
                
                // Try to parse relative expressions like "2 days ago"
                const relativeMatch = this.parseRelativeExpression(normalized, currentDate);
                if (relativeMatch) return relativeMatch;
                
                throw new Error(`Unsupported time expression: "${expression}". Supported: today, yesterday, this morning/afternoon/evening, this week, last week, past N days/week/month, day names, or relative expressions.`);
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

    private getTimeOfDayRange(date: Date, startHour: number, endHour: number): TimeRange {
        const start = new Date(date);
        start.setHours(startHour, 0, 0, 0);
        
        const end = new Date(date);
        end.setHours(endHour, 0, 0, 0);
        
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

    private parseRelativeExpression(expression: string, currentDate: Date): TimeRange | null {
        // Match patterns like "2 days ago", "3 hours ago", "1 week ago"
        const relativePattern = /^(\d+)\s+(day|days|hour|hours|week|weeks)\s+ago$/;
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
        const topicList = topics.length > 0 ? ` Main topics: ${topics.join(", ")}.` : "";
        const duration = Math.round((new Date(lifelogs[lifelogs.length - 1].endTime).getTime() - 
                                   new Date(lifelogs[0].startTime).getTime()) / (1000 * 60));
        
        return `${duration}-minute meeting with ${participantNames}.${topicList}`;
    }
}

// =============================================================================
// ACTION ITEM EXTRACTION
// =============================================================================

export class ActionItemExtractor {
    private static readonly ACTION_PATTERNS = [
        /\b(I'll|I will|I need to|I should|I must)\s+([^.!?]*)/gi,
        /\b(todo|to do|action item|task):\s*([^.!?]*)/gi,
        /\b(follow up|follow-up)\s+(on|with)\s+([^.!?]*)/gi,
        /\b(need to|should|must|will)\s+(send|call|email|schedule|review|update|create|finish|complete)\s+([^.!?]*)/gi,
        /\b(by\s+\w+day|by\s+\d+|before\s+\d+|deadline)\s*:?\s*([^.!?]*)/gi
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
        const contextRange = 2;
        const start = Math.max(0, currentIndex - contextRange);
        const end = Math.min(nodes.length, currentIndex + contextRange + 1);
        
        return nodes.slice(start, end)
            .map(node => node.content)
            .filter(content => content && content.trim())
            .join(" ")
            .slice(0, 200) + "...";
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