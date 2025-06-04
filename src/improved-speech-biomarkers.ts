import { Lifelog, LifelogContentNode } from "./limitless-client.js";
import { StatisticalUtils, StatisticalResult, TrendAnalysis, DataQualityMetrics } from "./statistical-utils.js";

// =============================================================================
// IMPROVED SPEECH BIOMARKER ANALYSIS WITH STATISTICAL RIGOR
// =============================================================================

export interface ImprovedSpeechSegment {
    content: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    wordCount: number;
    speakerName?: string;
    wordsPerMinute: number;
    timestamp: Date;
    lifelogId: string;
    isValid: boolean;
    qualityFlags: string[];
}

export interface StatisticalBiomarkers {
    // Core metrics with confidence intervals
    speechRate: StatisticalResult;
    pauseDuration: StatisticalResult;
    vocabularyComplexity: StatisticalResult;
    wordsPerTurn: StatisticalResult;
    
    // Trend analysis
    speechRateTrend: TrendAnalysis;
    weeklyTrends: Array<{
        week: string;
        speechRate: StatisticalResult;
        segmentCount: number;
    }>;
    
    // Data quality assessment
    dataQuality: DataQualityMetrics;
    
    // Evidence-based percentiles (vs. population norms)
    percentileRankings: {
        speechRate: number;        // vs. normal adults 120-180 WPM
        pauseDuration: number;     // vs. normal 0.5-2.0 seconds
        vocabularyComplexity: number; // vs. normal conversational speech
    };
    
    // Uncertainty and reliability
    reliability: "high" | "medium" | "low";
    minimumDataRecommendations: string[];
    
    // Temporal patterns with statistical significance
    timeOfDayEffects: {
        pattern: Array<{hour: number, meanWPM: number, confidenceInterval: [number, number]}>;
        significantVariation: boolean;
        pValue: number;
    };
    
    // Analysis metadata
    analysisDate: string;
    dataTimespan: string;
    totalAnalysisTime: number;
}

export interface BaselineProfile {
    establishedDate: string;
    speechRateBaseline: StatisticalResult;
    pauseBaseline: StatisticalResult;
    vocabularyBaseline: StatisticalResult;
    weeklyPattern: Array<{dayOfWeek: number, meanWPM: number}>;
    timeOfDayPattern: Array<{hour: number, meanWPM: number}>;
    isStable: boolean;
    confidenceLevel: number;
}

export class ImprovedSpeechBiomarkerAnalyzer {
    
    /**
     * Analyze speech patterns with proper statistical methodology
     */
    static analyzeSpeechPatternsWithStats(lifelogs: Lifelog[]): StatisticalBiomarkers {
        console.log(`🔬 Starting rigorous statistical analysis of ${lifelogs.length} lifelogs...`);
        
        // Extract and validate segments
        const allSegments = this.extractAndValidateSegments(lifelogs);
        console.log(`Found ${allSegments.length} total segments, ${allSegments.filter(s => s.isValid).length} valid`);
        
        if (allSegments.filter(s => s.isValid).length === 0) {
            return this.createEmptyStatisticalResults();
        }
        
        // Filter for valid segments only
        const validSegments = allSegments.filter(s => s.isValid);
        
        // Calculate data quality metrics
        const dataQuality = this.assessDataQuality(allSegments, validSegments);
        
        // Calculate statistical metrics with confidence intervals
        const speechRateValues = validSegments.map(s => s.wordsPerMinute);
        const pauseValues = this.calculatePauseDurations(validSegments);
        const vocabularyValues = this.calculateVocabularyMetrics(validSegments);
        const wordsPerTurnValues = validSegments.map(s => s.wordCount);
        
        // Core statistical results
        const speechRate = StatisticalUtils.calculateStatisticalResult(speechRateValues);
        const pauseDuration = StatisticalUtils.calculateStatisticalResult(pauseValues);
        const vocabularyComplexity = StatisticalUtils.calculateStatisticalResult(vocabularyValues);
        const wordsPerTurn = StatisticalUtils.calculateStatisticalResult(wordsPerTurnValues);
        
        // Trend analysis
        const speechRateTrend = this.calculateTrendAnalysis(validSegments);
        const weeklyTrends = this.calculateWeeklyTrends(validSegments);
        
        // Population-based percentile rankings
        const percentileRankings = this.calculatePercentileRankings(speechRate.value, pauseDuration.value, vocabularyComplexity.value);
        
        // Time-of-day analysis with statistical significance
        const timeOfDayEffects = this.analyzeTimeOfDayEffects(validSegments);
        
        // Reliability assessment
        const reliability = this.assessReliability(dataQuality, validSegments.length);
        const minimumDataRecommendations = this.generateDataRecommendations(validSegments.length, dataQuality);
        
        // Temporal metadata
        const timespan = this.calculateTimespan(validSegments);
        
        return {
            speechRate,
            pauseDuration,
            vocabularyComplexity,
            wordsPerTurn,
            speechRateTrend,
            weeklyTrends,
            dataQuality,
            percentileRankings,
            reliability,
            minimumDataRecommendations,
            timeOfDayEffects,
            analysisDate: new Date().toISOString(),
            dataTimespan: timespan,
            totalAnalysisTime: validSegments.reduce((sum, s) => sum + s.durationMs, 0)
        };
    }
    
    /**
     * Extract segments with validation and quality flags
     */
    private static extractAndValidateSegments(lifelogs: Lifelog[]): ImprovedSpeechSegment[] {
        const segments: ImprovedSpeechSegment[] = [];
        
        for (const lifelog of lifelogs) {
            if (!lifelog.contents) continue;
            
            const lifelogStartTime = new Date(lifelog.startTime);
            
            for (const node of lifelog.contents) {
                if (node.speakerIdentifier === "user" && 
                    node.content && 
                    node.startOffsetMs !== undefined && 
                    node.endOffsetMs !== undefined) {
                    
                    const content = node.content.trim();
                    const wordCount = this.countWords(content);
                    const durationMs = node.endOffsetMs - node.startOffsetMs;
                    const wordsPerMinute = durationMs > 0 ? (wordCount / durationMs) * 60000 : 0;
                    
                    // Quality validation
                    const qualityFlags: string[] = [];
                    let isValid = true;
                    
                    // Basic quality checks
                    if (wordCount < 3) {
                        qualityFlags.push("too_few_words");
                        isValid = false;
                    }
                    
                    if (durationMs < 500) {
                        qualityFlags.push("too_short_duration");
                        isValid = false;
                    }
                    
                    if (wordsPerMinute > 400 || wordsPerMinute < 30) {
                        qualityFlags.push("unrealistic_speech_rate");
                        isValid = false;
                    }
                    
                    if (content.length < 10) {
                        qualityFlags.push("too_brief_content");
                        isValid = false;
                    }
                    
                    // Check for likely non-speech content
                    const nonSpeechPatterns = /^(yeah|uh|um|hmm|ah)\.?$/i;
                    if (nonSpeechPatterns.test(content)) {
                        qualityFlags.push("minimal_speech");
                        isValid = false;
                    }
                    
                    segments.push({
                        content,
                        startOffsetMs: node.startOffsetMs,
                        endOffsetMs: node.endOffsetMs,
                        durationMs,
                        wordCount,
                        speakerName: node.speakerName || undefined,
                        wordsPerMinute,
                        timestamp: new Date(lifelogStartTime.getTime() + node.startOffsetMs),
                        lifelogId: lifelog.id,
                        isValid,
                        qualityFlags
                    });
                }
            }
        }
        
        return segments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    
    /**
     * Calculate pause durations between segments
     */
    private static calculatePauseDurations(segments: ImprovedSpeechSegment[]): number[] {
        const pauseDurations: number[] = [];
        
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            // Only calculate pauses within the same lifelog
            if (currentSegment.lifelogId === nextSegment.lifelogId) {
                const pauseMs = nextSegment.startOffsetMs - currentSegment.endOffsetMs;
                if (pauseMs > 0 && pauseMs < 30000) { // Reasonable pause range
                    pauseDurations.push(pauseMs / 1000); // Convert to seconds
                }
            }
        }
        
        return pauseDurations;
    }
    
    /**
     * Calculate improved vocabulary complexity metrics
     */
    private static calculateVocabularyMetrics(segments: ImprovedSpeechSegment[]): number[] {
        return segments.map(segment => {
            const words = segment.content.split(/\s+/).filter(w => w.length > 0);
            
            // Type-Token Ratio (unique words / total words)
            const uniqueWords = new Set(words.map(w => w.toLowerCase()));
            const ttr = words.length > 0 ? uniqueWords.size / words.length : 0;
            
            // Average word length (better than character count)
            const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
            
            // Combine TTR and word length for complexity score
            return (ttr * 10) + (avgWordLength * 0.5);
        });
    }
    
    /**
     * Calculate trend analysis with statistical significance
     */
    private static calculateTrendAnalysis(segments: ImprovedSpeechSegment[]): TrendAnalysis {
        if (segments.length < 5) {
            return {
                slope: 0,
                rSquared: 0,
                pValue: 1,
                significance: "insufficient_data",
                confidenceInterval: [0, 0]
            };
        }
        
        // Use time points (hours since first segment) and speech rate values
        const startTime = segments[0].timestamp.getTime();
        const timePoints = segments.map(s => (s.timestamp.getTime() - startTime) / (1000 * 60 * 60)); // Hours
        const speechRates = segments.map(s => s.wordsPerMinute);
        
        return StatisticalUtils.linearRegression(timePoints, speechRates);
    }
    
    /**
     * Calculate weekly trends with statistical analysis
     */
    private static calculateWeeklyTrends(segments: ImprovedSpeechSegment[]): Array<{
        week: string;
        speechRate: StatisticalResult;
        segmentCount: number;
    }> {
        // Group segments by week
        const weeklyGroups = new Map<string, ImprovedSpeechSegment[]>();
        
        segments.forEach(segment => {
            const weekStart = new Date(segment.timestamp);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
            weekStart.setHours(0, 0, 0, 0);
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!weeklyGroups.has(weekKey)) {
                weeklyGroups.set(weekKey, []);
            }
            weeklyGroups.get(weekKey)!.push(segment);
        });
        
        // Calculate statistics for each week
        return Array.from(weeklyGroups.entries())
            .map(([week, weekSegments]) => ({
                week,
                speechRate: StatisticalUtils.calculateStatisticalResult(
                    weekSegments.map(s => s.wordsPerMinute)
                ),
                segmentCount: weekSegments.length
            }))
            .sort((a, b) => a.week.localeCompare(b.week));
    }
    
    /**
     * Calculate percentile rankings against population norms
     */
    private static calculatePercentileRankings(
        speechRate: number, 
        pauseDuration: number, 
        vocabularyComplexity: number
    ): { speechRate: number; pauseDuration: number; vocabularyComplexity: number; } {
        
        // Population norms based on speech research literature
        const normalSpeechRates = this.generateNormalDistribution(150, 30, 1000); // 150 ± 30 WPM
        const normalPauseDurations = this.generateNormalDistribution(1.2, 0.5, 1000); // 1.2 ± 0.5 seconds
        const normalVocabularyComplexity = this.generateNormalDistribution(6.0, 1.5, 1000); // Estimated norm
        
        return {
            speechRate: StatisticalUtils.calculatePercentile(speechRate, normalSpeechRates),
            pauseDuration: StatisticalUtils.calculatePercentile(pauseDuration, normalPauseDurations),
            vocabularyComplexity: StatisticalUtils.calculatePercentile(vocabularyComplexity, normalVocabularyComplexity)
        };
    }
    
    /**
     * Analyze time-of-day effects with statistical significance
     */
    private static analyzeTimeOfDayEffects(segments: ImprovedSpeechSegment[]): {
        pattern: Array<{hour: number, meanWPM: number, confidenceInterval: [number, number]}>;
        significantVariation: boolean;
        pValue: number;
    } {
        // Group by hour
        const hourlyGroups = new Map<number, number[]>();
        
        segments.forEach(segment => {
            const hour = segment.timestamp.getHours();
            if (!hourlyGroups.has(hour)) {
                hourlyGroups.set(hour, []);
            }
            hourlyGroups.get(hour)!.push(segment.wordsPerMinute);
        });
        
        // Calculate means and confidence intervals for each hour
        const pattern = Array.from(hourlyGroups.entries())
            .map(([hour, wpmValues]) => ({
                hour,
                meanWPM: wpmValues.reduce((sum, wpm) => sum + wpm, 0) / wpmValues.length,
                confidenceInterval: StatisticalUtils.calculateConfidenceInterval(wpmValues)
            }))
            .sort((a, b) => a.hour - b.hour);
        
        // Test for significant variation across hours (simplified ANOVA)
        const allWpmValues = Array.from(hourlyGroups.values()).flat();
        const overallMean = allWpmValues.reduce((sum, wpm) => sum + wpm, 0) / allWpmValues.length;
        
        let betweenGroupVariance = 0;
        let withinGroupVariance = 0;
        let totalDf = 0;
        let betweenDf = hourlyGroups.size - 1;
        
        for (const [hour, values] of hourlyGroups) {
            const groupMean = values.reduce((sum, wpm) => sum + wpm, 0) / values.length;
            betweenGroupVariance += values.length * Math.pow(groupMean - overallMean, 2);
            withinGroupVariance += values.reduce((sum, wpm) => sum + Math.pow(wpm - groupMean, 2), 0);
            totalDf += values.length - 1;
        }
        
        const fStatistic = (betweenGroupVariance / betweenDf) / (withinGroupVariance / totalDf);
        const pValue = fStatistic > 2.5 ? 0.01 : fStatistic > 2.0 ? 0.05 : 0.20; // Simplified F-test
        
        return {
            pattern,
            significantVariation: pValue < 0.05,
            pValue
        };
    }
    
    /**
     * Assess data quality comprehensively
     */
    private static assessDataQuality(allSegments: ImprovedSpeechSegment[], validSegments: ImprovedSpeechSegment[]): DataQualityMetrics {
        const outliers = allSegments.filter(s => s.qualityFlags.includes("unrealistic_speech_rate"));
        
        return StatisticalUtils.assessDataQuality(
            allSegments.map(s => s.wordsPerMinute),
            validSegments.map(s => s.wordsPerMinute),
            outliers.map(s => s.wordsPerMinute)
        );
    }
    
    /**
     * Assess reliability based on sample size and data quality
     */
    private static assessReliability(dataQuality: DataQualityMetrics, validSegmentCount: number): "high" | "medium" | "low" {
        if (validSegmentCount >= 100 && dataQuality.qualityScore >= 0.8) {
            return "high";
        } else if (validSegmentCount >= 30 && dataQuality.qualityScore >= 0.6) {
            return "medium";
        } else {
            return "low";
        }
    }
    
    /**
     * Generate data collection recommendations
     */
    private static generateDataRecommendations(validSegmentCount: number, dataQuality: DataQualityMetrics): string[] {
        const recommendations: string[] = [];
        
        if (validSegmentCount < 50) {
            recommendations.push(`Collect more data: Need ${50 - validSegmentCount} additional valid segments for medium reliability`);
        }
        
        if (validSegmentCount < 100) {
            recommendations.push(`For high reliability: Need ${100 - validSegmentCount} additional valid segments`);
        }
        
        if (dataQuality.qualityScore < 0.7) {
            recommendations.push("Improve data quality: High rate of invalid segments detected");
        }
        
        if (validSegmentCount < 30) {
            recommendations.push("Insufficient data for trend analysis: Need minimum 30 segments");
        }
        
        const timespan = this.calculateTimespanDays(validSegmentCount);
        if (timespan < 7) {
            recommendations.push("Collect data over longer period: Need minimum 1 week for reliable patterns");
        }
        
        return recommendations;
    }
    
    // =============================================================================
    // HELPER METHODS
    // =============================================================================
    
    private static countWords(text: string): number {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    
    private static generateNormalDistribution(mean: number, stdDev: number, size: number): number[] {
        const values: number[] = [];
        for (let i = 0; i < size; i++) {
            // Box-Muller transformation for normal distribution
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            values.push(mean + z * stdDev);
        }
        return values;
    }
    
    private static calculateTimespan(segments: ImprovedSpeechSegment[]): string {
        if (segments.length === 0) return "No data";
        
        const start = segments[0].timestamp;
        const end = segments[segments.length - 1].timestamp;
        const diffMs = end.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (diffDays > 0) {
            return `${diffDays} days, ${diffHours} hours`;
        } else {
            return `${diffHours} hours`;
        }
    }
    
    private static calculateTimespanDays(segmentCount: number): number {
        // Estimate based on typical conversation frequency
        return Math.max(1, Math.floor(segmentCount / 20)); // Assume ~20 segments per day
    }
    
    private static createEmptyStatisticalResults(): StatisticalBiomarkers {
        const emptyResult: StatisticalResult = {
            value: 0,
            confidenceInterval: [0, 0],
            standardError: 0,
            sampleSize: 0
        };
        
        const emptyTrend: TrendAnalysis = {
            slope: 0,
            rSquared: 0,
            pValue: 1,
            significance: "insufficient_data",
            confidenceInterval: [0, 0]
        };
        
        return {
            speechRate: emptyResult,
            pauseDuration: emptyResult,
            vocabularyComplexity: emptyResult,
            wordsPerTurn: emptyResult,
            speechRateTrend: emptyTrend,
            weeklyTrends: [],
            dataQuality: {
                totalSegments: 0,
                validSegments: 0,
                outliers: 0,
                qualityScore: 0,
                reliability: "low"
            },
            percentileRankings: {
                speechRate: 50,
                pauseDuration: 50,
                vocabularyComplexity: 50
            },
            reliability: "low",
            minimumDataRecommendations: ["No valid data found"],
            timeOfDayEffects: {
                pattern: [],
                significantVariation: false,
                pValue: 1
            },
            analysisDate: new Date().toISOString(),
            dataTimespan: "No data",
            totalAnalysisTime: 0
        };
    }
}