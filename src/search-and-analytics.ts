import { Lifelog, LifelogContentNode, getLifelogs } from "./limitless-client.js";
import { 
    TopicSearchResult, 
    DailySummary, 
    SpeakerAnalytics, 
    Meeting, 
    ActionItem, 
    MeetingDetector, 
    ActionItemExtractor,
    NaturalTimeParser,
    TimeRange 
} from "./advanced-features.js";

// =============================================================================
// ADVANCED SEARCH CAPABILITIES
// =============================================================================

export interface SearchOptions {
    includeContext?: boolean;
    contextLines?: number;
    maxResults?: number;
    minRelevanceScore?: number;
    searchInSpeaker?: string;
    searchInContentType?: string[];
    timeRange?: TimeRange;
}

export class AdvancedSearch {
    
    /**
     * Comprehensive search across all lifelogs with intelligent context and relevance scoring
     */
    static async searchConversationsAbout(
        apiKey: string,
        searchTerm: string,
        options: SearchOptions = {}
    ): Promise<TopicSearchResult[]> {
        
        const {
            includeContext = true,
            contextLines = 2,
            maxResults = 20,
            minRelevanceScore = 0.3,
            searchInSpeaker,
            searchInContentType,
            timeRange
        } = options;

        // Fetch all relevant lifelogs
        const lifelogParams: any = {};
        if (timeRange) {
            lifelogParams.start = timeRange.start;
            lifelogParams.end = timeRange.end;
            lifelogParams.timezone = timeRange.timezone;
        }
        
        // Use a large limit to search through more history
        lifelogParams.limit = 1000;
        lifelogParams.includeMarkdown = true;
        lifelogParams.includeHeadings = true;
        
        const allLifelogs = await getLifelogs(apiKey, lifelogParams);
        
        const results: TopicSearchResult[] = [];
        const searchTermLower = searchTerm.toLowerCase();
        
        for (const lifelog of allLifelogs) {
            const matchingNodes = this.findRelevantNodes(
                lifelog,
                searchTermLower,
                searchInSpeaker,
                searchInContentType
            );
            
            if (matchingNodes.length === 0) continue;
            
            // Calculate relevance score
            const relevanceScore = this.calculateRelevanceScore(matchingNodes, searchTermLower);
            
            if (relevanceScore < minRelevanceScore) continue;
            
            // Get context if requested
            let contextBefore: LifelogContentNode[] = [];
            let contextAfter: LifelogContentNode[] = [];
            
            if (includeContext && lifelog.contents) {
                const { before, after } = this.extractContext(
                    lifelog.contents,
                    matchingNodes,
                    contextLines
                );
                contextBefore = before;
                contextAfter = after;
            }
            
            results.push({
                lifelog,
                relevantNodes: matchingNodes,
                contextBefore,
                contextAfter,
                relevanceScore,
                summary: this.generateSearchSummary(lifelog, matchingNodes, searchTerm)
            });
        }
        
        // Sort by relevance and return top results
        return results
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, maxResults);
    }

    private static findRelevantNodes(
        lifelog: Lifelog,
        searchTermLower: string,
        searchInSpeaker?: string,
        searchInContentType?: string[]
    ): LifelogContentNode[] {
        if (!lifelog.contents) return [];
        
        return lifelog.contents.filter(node => {
            // Content match
            const hasContentMatch = node.content?.toLowerCase().includes(searchTermLower);
            
            // Speaker filter
            if (searchInSpeaker && node.speakerName !== searchInSpeaker) {
                return false;
            }
            
            // Content type filter
            if (searchInContentType && !searchInContentType.includes(node.type)) {
                return false;
            }
            
            return hasContentMatch;
        });
    }

    private static calculateRelevanceScore(nodes: LifelogContentNode[], searchTerm: string): number {
        let score = 0;
        let totalContent = 0;
        
        for (const node of nodes) {
            if (!node.content) continue;
            
            const content = node.content.toLowerCase();
            totalContent += content.length;
            
            // Exact phrase match gets higher score
            if (content.includes(searchTerm)) {
                score += 10;
            }
            
            // Word matches
            const searchWords = searchTerm.split(' ');
            for (const word of searchWords) {
                const wordMatches = (content.match(new RegExp(word, 'g')) || []).length;
                score += wordMatches * 2;
            }
            
            // Bonus for headings
            if (node.type.startsWith('heading')) {
                score *= 1.5;
            }
            
            // Bonus for user speech
            if (node.speakerIdentifier === 'user') {
                score *= 1.2;
            }
        }
        
        // Normalize by content length to avoid bias toward longer content
        return Math.min(1.0, score / Math.max(100, totalContent / 10));
    }

    private static extractContext(
        allNodes: LifelogContentNode[],
        relevantNodes: LifelogContentNode[],
        contextLines: number
    ): { before: LifelogContentNode[], after: LifelogContentNode[] } {
        
        const relevantIndices = relevantNodes.map(node => allNodes.indexOf(node));
        const minIndex = Math.min(...relevantIndices);
        const maxIndex = Math.max(...relevantIndices);
        
        const before = allNodes.slice(
            Math.max(0, minIndex - contextLines),
            minIndex
        );
        
        const after = allNodes.slice(
            maxIndex + 1,
            Math.min(allNodes.length, maxIndex + 1 + contextLines)
        );
        
        return { before, after };
    }

    private static generateSearchSummary(
        lifelog: Lifelog,
        relevantNodes: LifelogContentNode[],
        searchTerm: string
    ): string {
        const time = new Date(lifelog.startTime).toLocaleString();
        const nodeCount = relevantNodes.length;
        const speakers = new Set(relevantNodes.map(n => n.speakerName).filter(Boolean));
        
        let summary = `Found ${nodeCount} reference${nodeCount !== 1 ? 's' : ''} to "${searchTerm}" at ${time}`;
        
        if (speakers.size > 0) {
            summary += ` (speakers: ${Array.from(speakers).join(', ')})`;
        }
        
        return summary;
    }
}

// =============================================================================
// DAILY SUMMARY GENERATOR
// =============================================================================

export class DailySummaryGenerator {
    
    /**
     * Generate comprehensive daily summary with insights and analytics
     */
    static async generateDailySummary(
        apiKey: string,
        date: string,
        timezone?: string
    ): Promise<DailySummary> {
        
        // Get the full day range for the specified date
        const parser = new NaturalTimeParser({ timezone });
        const targetDate = new Date(date + 'T00:00:00');
        const timeRange = {
            start: date + ' 00:00:00',
            end: date + ' 23:59:59',
            timezone: timezone || parser['timezone']
        };
        
        // Fetch all lifelogs for the day
        const lifelogs = await getLifelogs(apiKey, {
            date,
            timezone,
            limit: 1000,
            includeMarkdown: true,
            includeHeadings: true,
            direction: 'asc'
        });
        
        if (lifelogs.length === 0) {
            return this.createEmptyDailySummary(date, timezone || 'UTC');
        }
        
        // Detect meetings
        const meetings = MeetingDetector.detectMeetings(lifelogs);
        
        // Extract all action items
        const allActionItems: ActionItem[] = [];
        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                const items = ActionItemExtractor.extractFromNodes(lifelog.contents, lifelog.id);
                allActionItems.push(...items);
            }
        }
        
        // Calculate metrics
        const totalRecordingTime = this.calculateTotalRecordingTime(lifelogs);
        const totalSpeakingTime = this.calculateTotalSpeakingTime(lifelogs);
        const topParticipants = this.getTopParticipants(meetings);
        const keyTopics = this.extractKeyTopics(lifelogs);
        
        // Generate insights
        const insights = this.generateInsights(lifelogs, meetings);
        
        return {
            date,
            timezone: timezone || 'UTC',
            meetings,
            totalRecordingTime,
            totalSpeakingTime,
            topParticipants,
            keyTopics,
            actionItems: allActionItems,
            insights
        };
    }

    private static createEmptyDailySummary(date: string, timezone: string): DailySummary {
        return {
            date,
            timezone,
            meetings: [],
            totalRecordingTime: 0,
            totalSpeakingTime: 0,
            topParticipants: [],
            keyTopics: [],
            actionItems: [],
            insights: {
                mostProductiveHours: [],
                longestMeeting: null,
                mostFrequentParticipant: null,
                topicsDiscussed: 0
            }
        };
    }

    private static calculateTotalRecordingTime(lifelogs: Lifelog[]): number {
        return lifelogs.reduce((total, lifelog) => {
            const duration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();
            return total + duration;
        }, 0);
    }

    private static calculateTotalSpeakingTime(lifelogs: Lifelog[]): number {
        let totalSpeaking = 0;
        
        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                for (const node of lifelog.contents) {
                    if (node.startOffsetMs !== undefined && node.endOffsetMs !== undefined) {
                        totalSpeaking += node.endOffsetMs - node.startOffsetMs;
                    }
                }
            }
        }
        
        return totalSpeaking;
    }

    private static getTopParticipants(meetings: Meeting[]): any[] {
        const participantMap = new Map();
        
        for (const meeting of meetings) {
            for (const participant of meeting.participants) {
                const existing = participantMap.get(participant.name) || {
                    name: participant.name,
                    identifier: participant.identifier,
                    speakingDuration: 0,
                    messageCount: 0
                };
                
                existing.speakingDuration += participant.speakingDuration;
                existing.messageCount += participant.messageCount;
                
                participantMap.set(participant.name, existing);
            }
        }
        
        return Array.from(participantMap.values())
            .sort((a, b) => b.speakingDuration - a.speakingDuration)
            .slice(0, 5);
    }

    private static extractKeyTopics(lifelogs: Lifelog[]): string[] {
        const topicCounts = new Map<string, number>();
        
        for (const lifelog of lifelogs) {
            if (lifelog.contents) {
                for (const node of lifelog.contents) {
                    if ((node.type === 'heading1' || node.type === 'heading2') && node.content) {
                        const topic = node.content.trim();
                        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
                    }
                }
            }
        }
        
        return Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([topic]) => topic);
    }

    private static generateInsights(lifelogs: Lifelog[], meetings: Meeting[]): any {
        // Most productive hours based on meeting count and duration
        const hourlyActivity = this.analyzeHourlyActivity(lifelogs);
        const mostProductiveHours = hourlyActivity
            .sort((a, b) => b.activity - a.activity)
            .slice(0, 3)
            .map(h => `${h.hour}:00`);
        
        // Longest meeting
        const longestMeeting = meetings.reduce((longest, current) => {
            return (!longest || current.duration > longest.duration) ? current : longest;
        }, null as Meeting | null);
        
        // Most frequent participant
        const participantCounts = new Map<string, number>();
        for (const meeting of meetings) {
            for (const participant of meeting.participants) {
                if (participant.identifier !== 'user') {
                    participantCounts.set(participant.name, (participantCounts.get(participant.name) || 0) + 1);
                }
            }
        }
        
        const mostFrequentParticipant = participantCounts.size > 0 
            ? Array.from(participantCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
            : null;
        
        return {
            mostProductiveHours,
            longestMeeting,
            mostFrequentParticipant,
            topicsDiscussed: new Set(meetings.flatMap(m => m.mainTopics)).size
        };
    }

    private static analyzeHourlyActivity(lifelogs: Lifelog[]): Array<{hour: number, activity: number}> {
        const hourlyData = new Array(24).fill(0).map((_, hour) => ({ hour, activity: 0 }));
        
        for (const lifelog of lifelogs) {
            const startHour = new Date(lifelog.startTime).getHours();
            const duration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();
            hourlyData[startHour].activity += duration;
        }
        
        return hourlyData;
    }
}

// =============================================================================
// SPEAKER ANALYTICS
// =============================================================================

export class SpeakerAnalyticsEngine {
    
    /**
     * Generate comprehensive analytics for conversations with a specific person
     */
    static async analyzeConversationWith(
        apiKey: string,
        participantName: string,
        timeRange?: TimeRange
    ): Promise<SpeakerAnalytics> {
        
        // Fetch relevant lifelogs
        const lifelogParams: any = {
            limit: 1000,
            includeMarkdown: true,
            includeHeadings: true
        };
        
        if (timeRange) {
            lifelogParams.start = timeRange.start;
            lifelogParams.end = timeRange.end;
            lifelogParams.timezone = timeRange.timezone;
        }
        
        const allLifelogs = await getLifelogs(apiKey, lifelogParams);
        
        // Filter lifelogs that contain the participant
        const relevantLifelogs = allLifelogs.filter(lifelog =>
            lifelog.contents?.some(node => 
                node.speakerName === participantName || 
                (node.content && node.content.toLowerCase().includes(participantName.toLowerCase()))
            )
        );
        
        if (relevantLifelogs.length === 0) {
            return this.createEmptyAnalytics(participantName);
        }
        
        // Calculate metrics
        const totalSpeakingTime = this.calculateSpeakingTime(relevantLifelogs, participantName);
        const conversationCount = relevantLifelogs.length;
        const averageConversationLength = totalSpeakingTime / conversationCount;
        const topTopics = this.extractTopicsWithParticipant(relevantLifelogs, participantName);
        const timeDistribution = this.analyzeTimeDistribution(relevantLifelogs, participantName);
        const recentInteractions = this.getRecentInteractions(relevantLifelogs, participantName);
        
        return {
            participant: participantName,
            totalSpeakingTime,
            conversationCount,
            averageConversationLength,
            topTopics,
            timeDistribution,
            recentInteractions
        };
    }

    private static createEmptyAnalytics(participantName: string): SpeakerAnalytics {
        return {
            participant: participantName,
            totalSpeakingTime: 0,
            conversationCount: 0,
            averageConversationLength: 0,
            topTopics: [],
            timeDistribution: [],
            recentInteractions: []
        };
    }

    private static calculateSpeakingTime(lifelogs: Lifelog[], participantName: string): number {
        let totalTime = 0;
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            for (const node of lifelog.contents) {
                if (node.speakerName === participantName &&
                    node.startOffsetMs !== undefined &&
                    node.endOffsetMs !== undefined) {
                    totalTime += node.endOffsetMs - node.startOffsetMs;
                }
            }
        }
        
        return totalTime;
    }

    private static extractTopicsWithParticipant(lifelogs: Lifelog[], participantName: string): string[] {
        const topicCounts = new Map<string, number>();
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            // Check if participant is in this lifelog
            const hasParticipant = lifelog.contents.some(node => 
                node.speakerName === participantName
            );
            
            if (hasParticipant) {
                // Extract topics from this lifelog
                for (const node of lifelog.contents) {
                    if ((node.type === 'heading1' || node.type === 'heading2') && node.content) {
                        const topic = node.content.trim();
                        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
                    }
                }
            }
        }
        
        return Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([topic]) => topic);
    }

    private static analyzeTimeDistribution(lifelogs: Lifelog[], participantName: string): Array<{hour: number, duration: number}> {
        const hourlyData = new Array(24).fill(0).map((_, hour) => ({ hour, duration: 0 }));
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            const startHour = new Date(lifelog.startTime).getHours();
            
            // Calculate duration with this participant
            let participantDuration = 0;
            for (const node of lifelog.contents) {
                if (node.speakerName === participantName &&
                    node.startOffsetMs !== undefined &&
                    node.endOffsetMs !== undefined) {
                    participantDuration += node.endOffsetMs - node.startOffsetMs;
                }
            }
            
            hourlyData[startHour].duration += participantDuration;
        }
        
        return hourlyData.filter(h => h.duration > 0);
    }

    private static getRecentInteractions(lifelogs: Lifelog[], participantName: string): Array<{date: string, duration: number, topics: string[]}> {
        const interactions: Array<{date: string, duration: number, topics: string[]}> = [];
        
        // Group by date
        const dateGroups = new Map<string, Lifelog[]>();
        for (const lifelog of lifelogs) {
            const date = lifelog.startTime.split('T')[0];
            if (!dateGroups.has(date)) {
                dateGroups.set(date, []);
            }
            dateGroups.get(date)!.push(lifelog);
        }
        
        // Process each date
        for (const [date, dayLifelogs] of dateGroups) {
            let totalDuration = 0;
            const topics = new Set<string>();
            
            for (const lifelog of dayLifelogs) {
                if (!lifelog.contents) continue;
                
                // Check for participant and extract data
                for (const node of lifelog.contents) {
                    if (node.speakerName === participantName) {
                        if (node.startOffsetMs !== undefined && node.endOffsetMs !== undefined) {
                            totalDuration += node.endOffsetMs - node.startOffsetMs;
                        }
                    }
                    
                    if ((node.type === 'heading1' || node.type === 'heading2') && node.content) {
                        topics.add(node.content.trim());
                    }
                }
            }
            
            if (totalDuration > 0) {
                interactions.push({
                    date,
                    duration: totalDuration,
                    topics: Array.from(topics)
                });
            }
        }
        
        return interactions
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    }
}