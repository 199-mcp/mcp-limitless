import { ImprovedSpeechSegment } from './improved-speech-biomarkers.js';
import { StatisticalUtils } from './statistical-utils.js';

export interface RhythmMetrics {
    // Core rhythm measurements
    rhythmEntropy: number;                    // 0-1, higher = more irregular
    rhythmConsistency: number;               // 0-1, higher = more consistent
    burstPauseRatio: number;                 // Speaking time / pause time
    
    // Temporal dynamics
    speechMomentum: {
        acceleration: number;                 // WPM change rate
        variability: number;                  // How much speed varies
        smoothness: number;                   // 0-1, smooth transitions
    };
    
    // Pattern analysis
    pausePatterns: {
        shortPauses: number;                  // < 500ms (breathing)
        mediumPauses: number;                 // 500ms-2s (thinking)
        longPauses: number;                   // 2s-5s (processing)
        extendedPauses: number;               // > 5s (difficulty)
        meanPauseDuration: number;
        pauseRegularity: number;              // 0-1, how regular pauses are
    };
    
    // Advanced metrics
    speakingBursts: {
        count: number;
        meanDuration: number;
        durationVariability: number;
        meanWordsPerBurst: number;
    };
    
    // Clinical indicators
    fluencyScore: number;                     // 0-100, overall fluency
    cognitiveLoadIndicator: number;          // 0-1, higher = more load
}

export class SpeechRhythmAnalyzer {
    
    /**
     * Analyze speech rhythm patterns with clinical precision
     */
    static analyzeRhythm(segments: ImprovedSpeechSegment[]): RhythmMetrics {
        const validSegments = segments.filter(s => s.isValid);
        
        if (validSegments.length < 2) {
            return this.createEmptyRhythmMetrics();
        }
        
        // Calculate pause durations between segments
        const pauseDurations = this.calculatePauseDurations(validSegments);
        const pausePatterns = this.analyzePausePatterns(pauseDurations);
        
        // Calculate speaking bursts (continuous speech segments)
        const speakingBursts = this.analyzeSpeakingBursts(validSegments, pauseDurations);
        
        // Calculate rhythm entropy (Shannon entropy of inter-segment intervals)
        const rhythmEntropy = this.calculateRhythmEntropy(validSegments);
        const rhythmConsistency = 1 - rhythmEntropy; // Inverse for intuitive interpretation
        
        // Calculate burst-pause ratio
        const totalSpeakingTime = validSegments.reduce((sum, seg) => sum + seg.durationMs, 0);
        const totalPauseTime = pauseDurations.reduce((sum, pause) => sum + pause, 0);
        const burstPauseRatio = totalPauseTime > 0 ? totalSpeakingTime / totalPauseTime : 0;
        
        // Analyze speech momentum (acceleration/deceleration patterns)
        const speechMomentum = this.analyzeSpeechMomentum(validSegments);
        
        // Calculate cognitive load indicator based on pause patterns
        const cognitiveLoadIndicator = this.calculateCognitiveLoad(pausePatterns, speechMomentum);
        
        // Calculate overall fluency score (0-100)
        const fluencyScore = this.calculateFluencyScore(
            rhythmConsistency,
            burstPauseRatio,
            pausePatterns,
            speechMomentum
        );
        
        return {
            rhythmEntropy,
            rhythmConsistency,
            burstPauseRatio,
            speechMomentum,
            pausePatterns,
            speakingBursts,
            fluencyScore,
            cognitiveLoadIndicator
        };
    }
    
    /**
     * Calculate pause durations between consecutive segments
     */
    private static calculatePauseDurations(segments: ImprovedSpeechSegment[]): number[] {
        const pauses: number[] = [];
        
        for (let i = 1; i < segments.length; i++) {
            const prevSegment = segments[i - 1];
            const currentSegment = segments[i];
            
            // Only calculate pause if segments are from the same lifelog
            if (prevSegment.lifelogId === currentSegment.lifelogId) {
                const pauseDuration = currentSegment.startOffsetMs - prevSegment.endOffsetMs;
                if (pauseDuration > 0 && pauseDuration < 30000) { // Max 30 seconds
                    pauses.push(pauseDuration);
                }
            }
        }
        
        return pauses;
    }
    
    /**
     * Analyze pause patterns for clinical insights
     */
    private static analyzePausePatterns(pauseDurations: number[]): RhythmMetrics['pausePatterns'] {
        if (pauseDurations.length === 0) {
            return {
                shortPauses: 0,
                mediumPauses: 0,
                longPauses: 0,
                extendedPauses: 0,
                meanPauseDuration: 0,
                pauseRegularity: 0
            };
        }
        
        // Classify pauses
        const shortPauses = pauseDurations.filter(p => p < 500).length;
        const mediumPauses = pauseDurations.filter(p => p >= 500 && p < 2000).length;
        const longPauses = pauseDurations.filter(p => p >= 2000 && p < 5000).length;
        const extendedPauses = pauseDurations.filter(p => p >= 5000).length;
        
        // Calculate statistics
        const meanPauseDuration = StatisticalUtils.mean(pauseDurations);
        const pauseStdDev = StatisticalUtils.standardDeviation(pauseDurations);
        
        // Pause regularity (coefficient of variation, normalized)
        const cv = pauseStdDev / meanPauseDuration;
        const pauseRegularity = Math.max(0, 1 - Math.min(cv, 1));
        
        return {
            shortPauses,
            mediumPauses,
            longPauses,
            extendedPauses,
            meanPauseDuration,
            pauseRegularity
        };
    }
    
    /**
     * Calculate rhythm entropy using Shannon entropy on inter-segment intervals
     */
    private static calculateRhythmEntropy(segments: ImprovedSpeechSegment[]): number {
        if (segments.length < 3) return 0;
        
        // Calculate inter-onset intervals (time between start of segments)
        const intervals: number[] = [];
        for (let i = 1; i < segments.length; i++) {
            if (segments[i].lifelogId === segments[i-1].lifelogId) {
                const interval = segments[i].startOffsetMs - segments[i-1].startOffsetMs;
                if (interval > 0 && interval < 30000) {
                    intervals.push(interval);
                }
            }
        }
        
        if (intervals.length < 2) return 0;
        
        // Bin intervals for entropy calculation (100ms bins)
        const binSize = 100;
        const bins = new Map<number, number>();
        
        intervals.forEach(interval => {
            const bin = Math.floor(interval / binSize);
            bins.set(bin, (bins.get(bin) || 0) + 1);
        });
        
        // Calculate Shannon entropy
        const total = intervals.length;
        let entropy = 0;
        
        bins.forEach(count => {
            const probability = count / total;
            if (probability > 0) {
                entropy -= probability * Math.log2(probability);
            }
        });
        
        // Normalize to 0-1 range (max entropy = log2(number of bins))
        const maxEntropy = Math.log2(bins.size);
        return maxEntropy > 0 ? entropy / maxEntropy : 0;
    }
    
    /**
     * Analyze speaking bursts (continuous speech segments)
     */
    private static analyzeSpeakingBursts(
        segments: ImprovedSpeechSegment[], 
        pauseDurations: number[]
    ): RhythmMetrics['speakingBursts'] {
        
        // Group segments into bursts (separated by pauses > 500ms)
        const bursts: ImprovedSpeechSegment[][] = [];
        let currentBurst: ImprovedSpeechSegment[] = [segments[0]];
        
        for (let i = 0; i < pauseDurations.length; i++) {
            if (pauseDurations[i] > 500) {
                // End current burst, start new one
                if (currentBurst.length > 0) {
                    bursts.push(currentBurst);
                }
                currentBurst = [segments[i + 1]];
            } else {
                // Continue current burst
                currentBurst.push(segments[i + 1]);
            }
        }
        
        // Add final burst
        if (currentBurst.length > 0) {
            bursts.push(currentBurst);
        }
        
        // Analyze burst characteristics
        const burstDurations = bursts.map(burst => {
            const firstSeg = burst[0];
            const lastSeg = burst[burst.length - 1];
            return lastSeg.endOffsetMs - firstSeg.startOffsetMs;
        });
        
        const wordsPerBurst = bursts.map(burst => 
            burst.reduce((sum, seg) => sum + seg.wordCount, 0)
        );
        
        return {
            count: bursts.length,
            meanDuration: burstDurations.length > 0 ? StatisticalUtils.mean(burstDurations) : 0,
            durationVariability: burstDurations.length > 0 ? 
                StatisticalUtils.standardDeviation(burstDurations) : 0,
            meanWordsPerBurst: wordsPerBurst.length > 0 ? 
                StatisticalUtils.mean(wordsPerBurst) : 0
        };
    }
    
    /**
     * Analyze speech momentum (acceleration/deceleration patterns)
     */
    private static analyzeSpeechMomentum(segments: ImprovedSpeechSegment[]): RhythmMetrics['speechMomentum'] {
        if (segments.length < 3) {
            return { acceleration: 0, variability: 0, smoothness: 0 };
        }
        
        // Calculate WPM changes between consecutive segments
        const wpmChanges: number[] = [];
        for (let i = 1; i < segments.length; i++) {
            if (segments[i].lifelogId === segments[i-1].lifelogId) {
                const change = segments[i].wordsPerMinute - segments[i-1].wordsPerMinute;
                wpmChanges.push(change);
            }
        }
        
        if (wpmChanges.length === 0) {
            return { acceleration: 0, variability: 0, smoothness: 0 };
        }
        
        // Mean acceleration (average WPM change)
        const acceleration = StatisticalUtils.mean(wpmChanges);
        
        // Variability of changes
        const variability = StatisticalUtils.standardDeviation(wpmChanges);
        
        // Smoothness (inverse of abrupt changes)
        const abruptChanges = wpmChanges.filter(change => Math.abs(change) > 50).length;
        const smoothness = Math.max(0, 1 - (abruptChanges / wpmChanges.length));
        
        return { acceleration, variability, smoothness };
    }
    
    /**
     * Calculate cognitive load indicator based on rhythm patterns
     */
    private static calculateCognitiveLoad(
        pausePatterns: RhythmMetrics['pausePatterns'],
        speechMomentum: RhythmMetrics['speechMomentum']
    ): number {
        // Factors indicating higher cognitive load:
        // 1. More long and extended pauses
        // 2. Irregular pause patterns
        // 3. High speech variability
        // 4. Low smoothness
        
        const totalPauses = pausePatterns.shortPauses + pausePatterns.mediumPauses + 
                           pausePatterns.longPauses + pausePatterns.extendedPauses;
        
        if (totalPauses === 0) return 0;
        
        // Weight longer pauses more heavily
        const pauseLoadScore = (
            pausePatterns.mediumPauses * 0.2 +
            pausePatterns.longPauses * 0.5 +
            pausePatterns.extendedPauses * 1.0
        ) / totalPauses;
        
        // Combine factors
        const cognitiveLoad = (
            pauseLoadScore * 0.4 +
            (1 - pausePatterns.pauseRegularity) * 0.3 +
            Math.min(speechMomentum.variability / 100, 1) * 0.2 +
            (1 - speechMomentum.smoothness) * 0.1
        );
        
        return Math.max(0, Math.min(1, cognitiveLoad));
    }
    
    /**
     * Calculate overall fluency score (0-100)
     */
    private static calculateFluencyScore(
        rhythmConsistency: number,
        burstPauseRatio: number,
        pausePatterns: RhythmMetrics['pausePatterns'],
        speechMomentum: RhythmMetrics['speechMomentum']
    ): number {
        // Ideal burst-pause ratio is around 3:1 to 5:1
        const idealRatio = 4;
        const ratioScore = 1 - Math.min(Math.abs(burstPauseRatio - idealRatio) / idealRatio, 1);
        
        // Pause quality score (fewer long pauses is better)
        const totalPauses = pausePatterns.shortPauses + pausePatterns.mediumPauses + 
                           pausePatterns.longPauses + pausePatterns.extendedPauses;
        const pauseQuality = totalPauses > 0 ? 
            (pausePatterns.shortPauses + pausePatterns.mediumPauses) / totalPauses : 0;
        
        // Combine all factors
        const fluencyScore = (
            rhythmConsistency * 25 +
            ratioScore * 25 +
            pauseQuality * 20 +
            pausePatterns.pauseRegularity * 15 +
            speechMomentum.smoothness * 15
        );
        
        return Math.round(Math.max(0, Math.min(100, fluencyScore)));
    }
    
    /**
     * Create empty rhythm metrics for edge cases
     */
    static createEmptyRhythmMetrics(): RhythmMetrics {
        return {
            rhythmEntropy: 0,
            rhythmConsistency: 0,
            burstPauseRatio: 0,
            speechMomentum: {
                acceleration: 0,
                variability: 0,
                smoothness: 0
            },
            pausePatterns: {
                shortPauses: 0,
                mediumPauses: 0,
                longPauses: 0,
                extendedPauses: 0,
                meanPauseDuration: 0,
                pauseRegularity: 0
            },
            speakingBursts: {
                count: 0,
                meanDuration: 0,
                durationVariability: 0,
                meanWordsPerBurst: 0
            },
            fluencyScore: 0,
            cognitiveLoadIndicator: 0
        };
    }
}