import { Lifelog, LifelogContentNode } from "./limitless-client.js";

// =============================================================================
// SPEECH BIOMARKER ANALYSIS
// =============================================================================

export interface SpeechSegment {
    content: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    wordCount: number;
    speakerName?: string;
    speakerIdentifier?: "user" | null;
    wordsPerMinute: number;
}

export interface PausePattern {
    pauseDurationMs: number;
    beforeSegment: SpeechSegment;
    afterSegment: SpeechSegment;
    pauseType: "short" | "medium" | "long" | "extended";
}

export interface SpeechBiomarkers {
    // Core Speech Rate Metrics
    averageWordsPerMinute: number;
    medianWordsPerMinute: number;
    speechRateVariability: number;  // Standard deviation of WPM
    totalSpeakingTime: number;      // Milliseconds
    totalWords: number;
    
    // Pause Analysis
    averagePauseDuration: number;   // Milliseconds
    pauseFrequency: number;         // Pauses per minute of speaking
    longPauseCount: number;         // Pauses > 2 seconds
    pauseVariability: number;       // Standard deviation of pause lengths
    
    // Cognitive Load Indicators
    vocabularyComplexity: number;   // Average characters per word
    uniqueWordRatio: number;        // Unique words / total words
    averageWordsPerTurn: number;    // Words per speaking turn
    
    // Temporal Patterns
    hourlyPatterns: Array<{hour: number, wpm: number, wordCount: number}>;
    conversationTurns: number;      // Number of separate speaking segments
    
    // Health Indicators (derived metrics)
    fatigueScore: number;           // 0-100, based on WPM decline and long pauses
    cognitiveLoadScore: number;     // 0-100, based on complexity and variability
    stressIndicator: number;        // 0-100, based on pause patterns and speech rate
    
    // Raw data for analysis
    segments: SpeechSegment[];
    pauses: PausePattern[];
    analysisDate: string;
    totalRecordingTime: number;     // Total time including pauses
}

export interface HealthAlert {
    type: "cognitive_decline" | "fatigue" | "stress" | "anomaly";
    severity: "low" | "medium" | "high";
    message: string;
    metric: string;
    currentValue: number;
    expectedRange: [number, number];
    recommendation: string;
}

export class SpeechBiomarkerAnalyzer {
    
    /**
     * Analyze speech patterns from Limitless lifelog data to extract health biomarkers
     */
    static analyzeSpeechPatterns(lifelogs: Lifelog[]): SpeechBiomarkers {
        console.log(`Analyzing ${lifelogs.length} lifelogs for speech biomarkers...`);
        
        // Extract all user speech segments
        const allSegments = this.extractUserSpeechSegments(lifelogs);
        console.log(`Found ${allSegments.length} user speech segments`);
        
        if (allSegments.length === 0) {
            return this.createEmptyBiomarkers();
        }
        
        // Analyze pauses between segments
        const pauses = this.analyzePausePatterns(allSegments);
        
        // Calculate core metrics
        const coreMetrics = this.calculateCoreMetrics(allSegments);
        const pauseMetrics = this.calculatePauseMetrics(pauses);
        const cognitiveMetrics = this.calculateCognitiveMetrics(allSegments);
        const temporalMetrics = this.calculateTemporalPatterns(allSegments, lifelogs);
        
        // Calculate health indicators
        const healthScores = this.calculateHealthScores(allSegments, pauses, coreMetrics);
        
        const totalRecordingTime = this.calculateTotalRecordingTime(lifelogs);
        
        return {
            ...coreMetrics,
            ...pauseMetrics,
            ...cognitiveMetrics,
            ...temporalMetrics,
            ...healthScores,
            segments: allSegments,
            pauses,
            analysisDate: new Date().toISOString(),
            totalRecordingTime
        };
    }
    
    /**
     * Extract speech segments from user only (not other speakers)
     */
    private static extractUserSpeechSegments(lifelogs: Lifelog[]): SpeechSegment[] {
        const segments: SpeechSegment[] = [];
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            for (const node of lifelog.contents) {
                // Only analyze user speech (not other participants)
                if (node.speakerIdentifier === "user" && 
                    node.content && 
                    node.startOffsetMs !== undefined && 
                    node.endOffsetMs !== undefined) {
                    
                    const content = node.content.trim();
                    if (content.length === 0) continue;
                    
                    const wordCount = this.countWords(content);
                    const durationMs = node.endOffsetMs - node.startOffsetMs;
                    const wordsPerMinute = durationMs > 0 ? (wordCount / durationMs) * 60000 : 0;
                    
                    segments.push({
                        content,
                        startOffsetMs: node.startOffsetMs,
                        endOffsetMs: node.endOffsetMs,
                        durationMs,
                        wordCount,
                        speakerName: node.speakerName || undefined,
                        speakerIdentifier: node.speakerIdentifier,
                        wordsPerMinute
                    });
                }
            }
        }
        
        // Sort by start time
        return segments.sort((a, b) => a.startOffsetMs - b.startOffsetMs);
    }
    
    /**
     * Analyze pause patterns between speech segments
     */
    private static analyzePausePatterns(segments: SpeechSegment[]): PausePattern[] {
        const pauses: PausePattern[] = [];
        
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            const pauseDurationMs = nextSegment.startOffsetMs - currentSegment.endOffsetMs;
            
            if (pauseDurationMs > 0) {
                let pauseType: "short" | "medium" | "long" | "extended";
                if (pauseDurationMs < 500) pauseType = "short";
                else if (pauseDurationMs < 2000) pauseType = "medium";
                else if (pauseDurationMs < 5000) pauseType = "long";
                else pauseType = "extended";
                
                pauses.push({
                    pauseDurationMs,
                    beforeSegment: currentSegment,
                    afterSegment: nextSegment,
                    pauseType
                });
            }
        }
        
        return pauses;
    }
    
    /**
     * Calculate core speech rate metrics
     */
    private static calculateCoreMetrics(segments: SpeechSegment[]) {
        const validWpms = segments.map(s => s.wordsPerMinute).filter(wpm => wpm > 0 && wpm < 1000);
        const totalWords = segments.reduce((sum, s) => sum + s.wordCount, 0);
        const totalSpeakingTime = segments.reduce((sum, s) => sum + s.durationMs, 0);
        
        const averageWordsPerMinute = validWpms.length > 0 ? 
            validWpms.reduce((sum, wpm) => sum + wpm, 0) / validWpms.length : 0;
        
        const medianWordsPerMinute = validWpms.length > 0 ? 
            this.calculateMedian(validWpms) : 0;
        
        const speechRateVariability = validWpms.length > 1 ? 
            this.calculateStandardDeviation(validWpms) : 0;
        
        return {
            averageWordsPerMinute,
            medianWordsPerMinute,
            speechRateVariability,
            totalSpeakingTime,
            totalWords
        };
    }
    
    /**
     * Calculate pause-related metrics
     */
    private static calculatePauseMetrics(pauses: PausePattern[]) {
        if (pauses.length === 0) {
            return {
                averagePauseDuration: 0,
                pauseFrequency: 0,
                longPauseCount: 0,
                pauseVariability: 0
            };
        }
        
        const pauseDurations = pauses.map(p => p.pauseDurationMs);
        const averagePauseDuration = pauseDurations.reduce((sum, d) => sum + d, 0) / pauseDurations.length;
        const longPauseCount = pauses.filter(p => p.pauseType === "long" || p.pauseType === "extended").length;
        const pauseVariability = this.calculateStandardDeviation(pauseDurations);
        
        // Calculate pauses per minute of speaking
        const totalSpeakingTime = pauses.reduce((sum, p) => 
            sum + p.beforeSegment.durationMs + p.afterSegment.durationMs, 0) / 2;
        const pauseFrequency = totalSpeakingTime > 0 ? 
            (pauses.length / totalSpeakingTime) * 60000 : 0;
        
        return {
            averagePauseDuration,
            pauseFrequency,
            longPauseCount,
            pauseVariability
        };
    }
    
    /**
     * Calculate cognitive load indicators
     */
    private static calculateCognitiveMetrics(segments: SpeechSegment[]) {
        if (segments.length === 0) {
            return {
                vocabularyComplexity: 0,
                uniqueWordRatio: 0,
                averageWordsPerTurn: 0,
                conversationTurns: 0
            };
        }
        
        // Vocabulary complexity (average characters per word)
        const allText = segments.map(s => s.content).join(" ");
        const words = allText.split(/\s+/).filter(w => w.length > 0);
        const vocabularyComplexity = words.length > 0 ? 
            words.reduce((sum, word) => sum + word.length, 0) / words.length : 0;
        
        // Unique word ratio
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        const uniqueWordRatio = words.length > 0 ? uniqueWords.size / words.length : 0;
        
        // Average words per turn
        const averageWordsPerTurn = segments.reduce((sum, s) => sum + s.wordCount, 0) / segments.length;
        
        return {
            vocabularyComplexity,
            uniqueWordRatio,
            averageWordsPerTurn,
            conversationTurns: segments.length
        };
    }
    
    /**
     * Calculate temporal patterns (hourly distribution)
     */
    private static calculateTemporalPatterns(segments: SpeechSegment[], lifelogs: Lifelog[]) {
        const hourlyData = new Array(24).fill(null).map((_, hour) => ({
            hour,
            wpm: 0,
            wordCount: 0,
            segmentCount: 0
        }));
        
        // Map segments to their corresponding lifelogs to get timestamps
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            const startTime = new Date(lifelog.startTime);
            const hour = startTime.getHours();
            
            for (const node of lifelog.contents) {
                if (node.speakerIdentifier === "user" && node.content) {
                    const wordCount = this.countWords(node.content);
                    const durationMs = (node.endOffsetMs || 0) - (node.startOffsetMs || 0);
                    const wpm = durationMs > 0 ? (wordCount / durationMs) * 60000 : 0;
                    
                    if (wpm > 0 && wpm < 1000) { // Reasonable WPM range
                        hourlyData[hour].wpm += wpm;
                        hourlyData[hour].wordCount += wordCount;
                        hourlyData[hour].segmentCount++;
                    }
                }
            }
        }
        
        // Calculate average WPM per hour
        const hourlyPatterns = hourlyData.map(data => ({
            hour: data.hour,
            wpm: data.segmentCount > 0 ? data.wpm / data.segmentCount : 0,
            wordCount: data.wordCount
        }));
        
        return { hourlyPatterns };
    }
    
    /**
     * Calculate health indicator scores
     */
    private static calculateHealthScores(
        segments: SpeechSegment[], 
        pauses: PausePattern[], 
        coreMetrics: any
    ) {
        // Fatigue Score (0-100): Based on low WPM and long pauses
        let fatigueScore = 0;
        if (coreMetrics.averageWordsPerMinute < 120) { // Below normal speaking rate
            fatigueScore += 30;
        }
        if (pauses.filter(p => p.pauseType === "long" || p.pauseType === "extended").length > 5) {
            fatigueScore += 40;
        }
        if (coreMetrics.speechRateVariability > 30) { // High variability indicates inconsistency
            fatigueScore += 30;
        }
        fatigueScore = Math.min(100, fatigueScore);
        
        // Cognitive Load Score (0-100): Based on complexity and processing
        let cognitiveLoadScore = 0;
        const avgWordsPerTurn = segments.reduce((sum, s) => sum + s.wordCount, 0) / segments.length;
        if (avgWordsPerTurn < 5) { // Very short responses
            cognitiveLoadScore += 40;
        }
        if (coreMetrics.speechRateVariability > 25) {
            cognitiveLoadScore += 30;
        }
        if (pauses.filter(p => p.pauseType === "medium" || p.pauseType === "long").length > 10) {
            cognitiveLoadScore += 30;
        }
        cognitiveLoadScore = Math.min(100, cognitiveLoadScore);
        
        // Stress Indicator (0-100): Based on pause patterns and speech disruption
        let stressIndicator = 0;
        const shortPauses = pauses.filter(p => p.pauseType === "short").length;
        const longPauses = pauses.filter(p => p.pauseType === "long" || p.pauseType === "extended").length;
        
        if (shortPauses > 20) { // Many short interruptions
            stressIndicator += 25;
        }
        if (longPauses > 8) { // Many long hesitations
            stressIndicator += 35;
        }
        if (coreMetrics.speechRateVariability > 35) { // High speech rate variability
            stressIndicator += 40;
        }
        stressIndicator = Math.min(100, stressIndicator);
        
        return {
            fatigueScore,
            cognitiveLoadScore,
            stressIndicator
        };
    }
    
    /**
     * Generate health alerts based on biomarker analysis
     */
    static generateHealthAlerts(biomarkers: SpeechBiomarkers): HealthAlert[] {
        const alerts: HealthAlert[] = [];
        
        // Check for potential cognitive concerns
        if (biomarkers.averageWordsPerMinute < 100) {
            alerts.push({
                type: "cognitive_decline",
                severity: "medium",
                message: "Speech rate significantly below normal range",
                metric: "averageWordsPerMinute",
                currentValue: biomarkers.averageWordsPerMinute,
                expectedRange: [120, 180],
                recommendation: "Consider monitoring speech patterns over time. Consult healthcare provider if persistent."
            });
        }
        
        // Check for fatigue indicators
        if (biomarkers.fatigueScore > 60) {
            alerts.push({
                type: "fatigue",
                severity: biomarkers.fatigueScore > 80 ? "high" : "medium",
                message: "Speech patterns suggest elevated fatigue",
                metric: "fatigueScore",
                currentValue: biomarkers.fatigueScore,
                expectedRange: [0, 40],
                recommendation: "Consider rest, sleep quality assessment, and stress management."
            });
        }
        
        // Check for stress indicators
        if (biomarkers.stressIndicator > 70) {
            alerts.push({
                type: "stress",
                severity: "medium",
                message: "Speech patterns indicate potential stress",
                metric: "stressIndicator",
                currentValue: biomarkers.stressIndicator,
                expectedRange: [0, 50],
                recommendation: "Consider stress reduction techniques and mindfulness practices."
            });
        }
        
        // Check for unusual patterns
        if (biomarkers.speechRateVariability > 40) {
            alerts.push({
                type: "anomaly",
                severity: "low",
                message: "High variability in speech rate detected",
                metric: "speechRateVariability",
                currentValue: biomarkers.speechRateVariability,
                expectedRange: [10, 25],
                recommendation: "Monitor consistency in speech patterns. May indicate fatigue or cognitive load."
            });
        }
        
        return alerts;
    }
    
    // =============================================================================
    // HELPER METHODS
    // =============================================================================
    
    private static countWords(text: string): number {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    
    private static calculateMedian(numbers: number[]): number {
        const sorted = [...numbers].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        } else {
            return sorted[middle];
        }
    }
    
    private static calculateStandardDeviation(numbers: number[]): number {
        if (numbers.length <= 1) return 0;
        
        const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
        const squaredDifferences = numbers.map(num => Math.pow(num - mean, 2));
        const variance = squaredDifferences.reduce((sum, sq) => sum + sq, 0) / (numbers.length - 1);
        
        return Math.sqrt(variance);
    }
    
    private static calculateTotalRecordingTime(lifelogs: Lifelog[]): number {
        return lifelogs.reduce((total, lifelog) => {
            const duration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();
            return total + duration;
        }, 0);
    }
    
    private static createEmptyBiomarkers(): SpeechBiomarkers {
        return {
            averageWordsPerMinute: 0,
            medianWordsPerMinute: 0,
            speechRateVariability: 0,
            totalSpeakingTime: 0,
            totalWords: 0,
            averagePauseDuration: 0,
            pauseFrequency: 0,
            longPauseCount: 0,
            pauseVariability: 0,
            vocabularyComplexity: 0,
            uniqueWordRatio: 0,
            averageWordsPerTurn: 0,
            conversationTurns: 0,
            hourlyPatterns: [],
            fatigueScore: 0,
            cognitiveLoadScore: 0,
            stressIndicator: 0,
            segments: [],
            pauses: [],
            analysisDate: new Date().toISOString(),
            totalRecordingTime: 0
        };
    }
}