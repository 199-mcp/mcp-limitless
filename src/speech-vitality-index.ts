import { Lifelog, LifelogContentNode } from './limitless-client.js';

// =============================================================================
// SPEECH VITALITY INDEX - RADICAL SIMPLIFICATION
// =============================================================================

export interface QualitySegment {
    content: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    wordCount: number;
    timestamp: Date;
    lifelogId: string;
    speakerChanges: number;
    backgroundNoiseLevel: number; // 0-1, estimated from transcript quality
}

export interface ConversationSession {
    segments: QualitySegment[];
    totalDurationMs: number;
    context: 'morning' | 'phone' | 'face-to-face' | 'unknown';
    startTime: Date;
    endTime: Date;
}

export interface SpeechVitalityScore {
    // The ONE metric
    svi: number;                    // 0-100
    
    // Component scores (for drill-down only)
    fluencyScore: number;           // 0-100
    energyScore: number;            // 0-100
    consistencyScore: number;       // 0-100
    
    // Metadata
    sessionDuration: number;        // minutes
    context: string;
    confidence: 'high' | 'medium' | 'low';
    timestamp: Date;
}

export interface SimplifiedAnalysis {
    currentScore: SpeechVitalityScore | null;
    trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
    trendConfidence: number;        // 0-100
    lastUpdate: Date;
    nextActionRequired: string;     // e.g., "Need 5 min conversation"
    historicalScores: Array<{
        date: string;
        score: number;
        context: string;
    }>;
}

export class SpeechVitalityAnalyzer {
    
    /**
     * Main entry point - drastically simplified
     */
    static analyze(lifelogs: Lifelog[]): SimplifiedAnalysis {
        // Extract quality conversations only
        const sessions = this.extractQualityConversations(lifelogs);
        
        if (sessions.length === 0) {
            return this.createInsufficientDataResult();
        }
        
        // Calculate SVI for most recent quality session
        const latestSession = sessions[sessions.length - 1];
        const currentScore = this.calculateSVI(latestSession);
        
        // Calculate trend if we have enough historical data
        const historicalScores = sessions
            .slice(-30) // Last 30 sessions max
            .map(session => ({
                date: session.startTime.toISOString().split('T')[0],
                score: this.calculateSVI(session).svi,
                context: session.context
            }));
        
        const { trend, confidence } = this.calculateTrend(historicalScores);
        
        return {
            currentScore,
            trend,
            trendConfidence: confidence,
            lastUpdate: new Date(),
            nextActionRequired: this.determineNextAction(sessions, currentScore),
            historicalScores: historicalScores.slice(-10) // Last 10 for display
        };
    }
    
    /**
     * Extract only high-quality conversation sessions
     */
    private static extractQualityConversations(lifelogs: Lifelog[]): ConversationSession[] {
        const sessions: ConversationSession[] = [];
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            // Group continuous conversations
            const conversationGroups = this.groupIntoConversations(lifelog);
            
            for (const group of conversationGroups) {
                if (this.isQualityConversation(group)) {
                    sessions.push(this.createSession(group, lifelog));
                }
            }
        }
        
        return sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    }
    
    /**
     * Group segments into conversations (5-minute gap = new conversation)
     */
    private static groupIntoConversations(lifelog: Lifelog): LifelogContentNode[][] {
        const groups: LifelogContentNode[][] = [];
        let currentGroup: LifelogContentNode[] = [];
        let lastEndTime = -Infinity;
        
        for (const node of lifelog.contents || []) {
            if (!node.content || !node.startOffsetMs) continue;
            
            // 5-minute gap starts new conversation
            if (node.startOffsetMs - lastEndTime > 5 * 60 * 1000) {
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                }
                currentGroup = [];
            }
            
            currentGroup.push(node);
            lastEndTime = node.endOffsetMs || node.startOffsetMs;
        }
        
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }
        
        return groups;
    }
    
    /**
     * Strict quality filter - better no data than bad data
     */
    private static isQualityConversation(nodes: LifelogContentNode[]): boolean {
        // Calculate total duration and word count
        const startTime = Math.min(...nodes.map(n => n.startOffsetMs || 0));
        const endTime = Math.max(...nodes.map(n => n.endOffsetMs || 0));
        const duration = (endTime - startTime) / 1000; // seconds
        
        // Count user segments and speaker changes
        const userSegments = nodes.filter(n => 
            n.speakerIdentifier === 'user' || n.speakerName === 'You'
        );
        const otherSegments = nodes.filter(n => 
            n.speakerIdentifier !== 'user' && n.speakerName !== 'You'
        );
        
        const totalWords = userSegments.reduce((sum, n) => 
            sum + (n.content?.trim().split(/\s+/).length || 0), 0
        );
        
        // Quality criteria
        return (
            duration > 300 &&                    // > 5 minutes
            userSegments.length > 10 &&          // User spoke >10 times
            otherSegments.length > 5 &&          // Other person spoke >5 times
            totalWords > 200 &&                  // Substantial content
            userSegments.length / nodes.length > 0.3 && // User speaks 30%+
            userSegments.length / nodes.length < 0.7    // User speaks <70%
        );
    }
    
    /**
     * Create session from quality conversation
     */
    private static createSession(
        nodes: LifelogContentNode[], 
        lifelog: Lifelog
    ): ConversationSession {
        const startTime = new Date(lifelog.startTime);
        const segments: QualitySegment[] = [];
        
        // Only process user segments
        const userNodes = nodes.filter(n => 
            n.speakerIdentifier === 'user' || n.speakerName === 'You'
        );
        
        let lastSpeaker = '';
        let speakerChanges = 0;
        
        for (const node of nodes) {
            const currentSpeaker = node.speakerIdentifier || node.speakerName || '';
            if (currentSpeaker !== lastSpeaker) {
                speakerChanges++;
                lastSpeaker = currentSpeaker;
            }
            
            if (node.speakerIdentifier === 'user' || node.speakerName === 'You') {
                const content = node.content?.trim() || '';
                const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
                const durationMs = (node.endOffsetMs || 0) - (node.startOffsetMs || 0);
                
                // Estimate background noise from transcript quality indicators
                const backgroundNoiseLevel = this.estimateBackgroundNoise(content);
                
                segments.push({
                    content,
                    startOffsetMs: node.startOffsetMs || 0,
                    endOffsetMs: node.endOffsetMs || 0,
                    durationMs,
                    wordCount,
                    timestamp: new Date(startTime.getTime() + (node.startOffsetMs || 0)),
                    lifelogId: lifelog.id,
                    speakerChanges,
                    backgroundNoiseLevel
                });
            }
        }
        
        const sessionStart = Math.min(...nodes.map(n => n.startOffsetMs || 0));
        const sessionEnd = Math.max(...nodes.map(n => n.endOffsetMs || 0));
        
        return {
            segments,
            totalDurationMs: sessionEnd - sessionStart,
            context: this.detectContext(segments, new Date(startTime.getTime() + sessionStart)),
            startTime: new Date(startTime.getTime() + sessionStart),
            endTime: new Date(startTime.getTime() + sessionEnd)
        };
    }
    
    /**
     * Calculate the Speech Vitality Index
     */
    private static calculateSVI(session: ConversationSession): SpeechVitalityScore {
        // 1. Fluency Score: Words per burst (how many words between pauses)
        const fluencyScore = this.calculateFluencyScore(session.segments);
        
        // 2. Energy Score: Dynamic range (variation in segment lengths/pace)
        const energyScore = this.calculateEnergyScore(session.segments);
        
        // 3. Consistency Score: How stable the patterns are
        const consistencyScore = this.calculateConsistencyScore(session.segments);
        
        // Composite score
        const svi = Math.round(
            0.4 * fluencyScore +
            0.3 * energyScore +
            0.3 * consistencyScore
        );
        
        // Confidence based on session quality
        const confidence = this.assessConfidence(session);
        
        return {
            svi,
            fluencyScore: Math.round(fluencyScore),
            energyScore: Math.round(energyScore),
            consistencyScore: Math.round(consistencyScore),
            sessionDuration: session.totalDurationMs / (1000 * 60),
            context: session.context,
            confidence,
            timestamp: session.startTime
        };
    }
    
    /**
     * Fluency: Average words per speech burst
     */
    private static calculateFluencyScore(segments: QualitySegment[]): number {
        if (segments.length === 0) return 0;
        
        const wordsPerBurst = segments.map(s => s.wordCount);
        const avgWords = wordsPerBurst.reduce((a, b) => a + b, 0) / wordsPerBurst.length;
        
        // Normalize: 5-15 words per burst is ideal
        if (avgWords < 5) return (avgWords / 5) * 70;
        if (avgWords > 15) return Math.max(70, 100 - (avgWords - 15) * 2);
        return 70 + ((avgWords - 5) / 10) * 30;
    }
    
    /**
     * Energy: Dynamic range in speech patterns
     */
    private static calculateEnergyScore(segments: QualitySegment[]): number {
        if (segments.length < 3) return 50;
        
        // Calculate variation in segment lengths and pace
        const durations = segments.map(s => s.durationMs);
        const meanDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const variance = durations.reduce((sum, d) => sum + Math.pow(d - meanDuration, 2), 0) / durations.length;
        const cv = Math.sqrt(variance) / meanDuration; // Coefficient of variation
        
        // Moderate variation is good (0.3-0.7), too little or too much is bad
        if (cv < 0.3) return cv * 166; // Too monotone
        if (cv > 0.7) return Math.max(50, 100 - (cv - 0.7) * 100); // Too erratic
        return 50 + ((cv - 0.3) / 0.4) * 50;
    }
    
    /**
     * Consistency: Stability within the conversation
     */
    private static calculateConsistencyScore(segments: QualitySegment[]): number {
        if (segments.length < 5) return 50;
        
        // Split into first half and second half
        const midPoint = Math.floor(segments.length / 2);
        const firstHalf = segments.slice(0, midPoint);
        const secondHalf = segments.slice(midPoint);
        
        // Compare average words per burst
        const firstAvg = firstHalf.reduce((sum, s) => sum + s.wordCount, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, s) => sum + s.wordCount, 0) / secondHalf.length;
        
        // Less difference = more consistent
        const difference = Math.abs(firstAvg - secondAvg) / Math.max(firstAvg, secondAvg);
        return Math.max(0, 100 - difference * 200);
    }
    
    /**
     * Detect conversation context
     */
    private static detectContext(
        segments: QualitySegment[], 
        startTime: Date
    ): 'morning' | 'phone' | 'face-to-face' | 'unknown' {
        const hour = startTime.getHours();
        
        // Morning: First conversation within 2 hours of typical wake time (6-10am)
        if (hour >= 6 && hour <= 10) {
            return 'morning';
        }
        
        // Phone call detection would require audio features, so simplified:
        // If very regular speaker changes, likely face-to-face
        const avgSpeakerChanges = segments.reduce((sum, s) => sum + s.speakerChanges, 0) / segments.length;
        if (avgSpeakerChanges > 2) {
            return 'face-to-face';
        }
        
        return 'unknown';
    }
    
    /**
     * Assess confidence in the score
     */
    private static assessConfidence(session: ConversationSession): 'high' | 'medium' | 'low' {
        const duration = session.totalDurationMs / (1000 * 60); // minutes
        const segmentCount = session.segments.length;
        const avgNoise = session.segments.reduce((sum, s) => sum + s.backgroundNoiseLevel, 0) / segmentCount;
        
        if (duration > 10 && segmentCount > 20 && avgNoise < 0.2) return 'high';
        if (duration > 5 && segmentCount > 10 && avgNoise < 0.4) return 'medium';
        return 'low';
    }
    
    /**
     * Calculate trend from historical scores
     */
    private static calculateTrend(
        historicalScores: Array<{ date: string; score: number; context: string }>
    ): { trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'; confidence: number } {
        
        if (historicalScores.length < 5) {
            return { trend: 'insufficient_data', confidence: 0 };
        }
        
        // Simple linear regression on last 10 scores
        const recentScores = historicalScores.slice(-10);
        const xValues = recentScores.map((_, i) => i);
        const yValues = recentScores.map(s => s.score);
        
        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const avgScore = sumY / n;
        
        // Normalize slope by average score
        const normalizedSlope = slope / avgScore;
        
        // Calculate R-squared for confidence
        const yMean = sumY / n;
        const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const predicted = xValues.map(x => (slope * x + (sumY - slope * sumX) / n));
        const ssResidual = yValues.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
        const rSquared = 1 - (ssResidual / ssTotal);
        
        // Determine trend
        let trend: 'improving' | 'stable' | 'declining';
        if (Math.abs(normalizedSlope) < 0.01) {
            trend = 'stable';
        } else if (normalizedSlope > 0) {
            trend = 'improving';
        } else {
            trend = 'declining';
        }
        
        // Confidence based on R-squared and sample size
        const confidence = Math.min(100, rSquared * 100 * (n / 10));
        
        return { trend, confidence: Math.round(confidence) };
    }
    
    /**
     * Determine next action for user
     */
    private static determineNextAction(
        sessions: ConversationSession[],
        currentScore: SpeechVitalityScore | null
    ): string {
        if (!currentScore) {
            return "Have a 5+ minute conversation to establish baseline";
        }
        
        const hoursSinceLastSession = currentScore ? 
            (Date.now() - currentScore.timestamp.getTime()) / (1000 * 60 * 60) : Infinity;
        
        if (hoursSinceLastSession > 24) {
            return "Have a conversation to update your score";
        }
        
        if (sessions.length < 10) {
            return `${10 - sessions.length} more conversations needed for reliable trends`;
        }
        
        if (currentScore.confidence === 'low') {
            return "Next conversation: aim for 10+ minutes with minimal background noise";
        }
        
        return "Your speech vitality is being tracked";
    }
    
    /**
     * Estimate background noise from transcript artifacts
     */
    private static estimateBackgroundNoise(content: string): number {
        // Look for indicators of poor audio quality
        let noiseScore = 0;
        
        // Incomplete words
        if (content.includes('...')) noiseScore += 0.1;
        if (content.includes('--')) noiseScore += 0.1;
        
        // Very short utterances might indicate detection issues
        if (content.split(/\s+/).length < 3) noiseScore += 0.2;
        
        // [inaudible] or similar markers
        if (/\[.*?\]/.test(content)) noiseScore += 0.3;
        
        // Multiple question marks or unclear transcription
        if ((content.match(/\?/g) || []).length > 1) noiseScore += 0.1;
        
        return Math.min(1, noiseScore);
    }
    
    /**
     * Create result for insufficient data
     */
    private static createInsufficientDataResult(): SimplifiedAnalysis {
        return {
            currentScore: null,
            trend: 'insufficient_data',
            trendConfidence: 0,
            lastUpdate: new Date(),
            nextActionRequired: "Have a 5+ minute conversation to establish baseline",
            historicalScores: []
        };
    }
}