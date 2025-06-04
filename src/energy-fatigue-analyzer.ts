import { ImprovedSpeechSegment } from './improved-speech-biomarkers.js';
import { StatisticalUtils } from './statistical-utils.js';
import { RhythmMetrics } from './speech-rhythm-analyzer.js';
import { DisfluencyMetrics } from './disfluency-detector.js';

export interface EnergyMetrics {
    // Core energy indicators
    currentEnergyLevel: number;              // 0-100, current state
    energyTrend: {
        direction: 'increasing' | 'stable' | 'decreasing';
        rate: number;                        // Change per hour
        significance: boolean;               // Statistically significant
    };
    
    // Fatigue markers
    fatigueIndicators: {
        speechRateDecline: boolean;          // Slowing down over time
        vocabularySimplification: boolean;   // Using simpler words
        increasedPauses: boolean;            // More/longer pauses
        decreasedFluency: boolean;           // More disfluencies
        score: number;                       // 0-100, higher = more fatigued
    };
    
    // Circadian energy patterns
    circadianProfile: {
        currentPhase: 'peak' | 'declining' | 'trough' | 'rising' | 'stable';
        predictedLowPoint: string;           // Time of day
        predictedHighPoint: string;          // Time of day
        alignment: number;                   // 0-1, how well aligned with typical patterns
    };
    
    // Cognitive energy
    cognitiveResources: {
        processingEfficiency: number;       // 0-1, based on response times
        vocabularyAccessibility: number;     // 0-1, based on word searching
        thoughtOrganization: number;         // 0-1, based on coherence
        overallCapacity: number;             // 0-100, combined score
    };
    
    // Recovery indicators
    recoveryMetrics: {
        restPeriodsDetected: number;         // Number of recovery periods
        recoveryRate: number;                // How quickly energy returns
        sustainedHighEnergy: number;         // Minutes at high energy
        energyVolatility: number;            // How much energy fluctuates
    };
    
    // Predictive insights
    predictions: {
        nextLowEnergyPeriod: string | null;  // Predicted time
        optimalBreakTime: string | null;     // Suggested rest time
        enduranceEstimate: number;           // Hours until fatigue
        confidence: number;                  // 0-1, prediction confidence
    };
}

export interface EnergyProfile {
    timestamp: Date;
    energyLevel: number;
    speechRate: number;
    vocabularyComplexity: number;
    fluencyScore: number;
    cognitiveLoad: number;
}

export class EnergyFatigueAnalyzer {
    
    /**
     * Analyze energy and fatigue patterns from speech
     */
    static analyzeEnergyPatterns(
        segments: ImprovedSpeechSegment[],
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics,
        timeRange?: { start: string; end: string }
    ): EnergyMetrics {
        
        const validSegments = segments.filter(s => s.isValid);
        if (validSegments.length === 0) {
            return this.createEmptyEnergyMetrics();
        }
        
        // Create energy profiles over time
        const energyProfiles = this.createEnergyProfiles(validSegments, rhythmMetrics, disfluencyMetrics);
        
        // Calculate current energy level
        const currentEnergyLevel = this.calculateCurrentEnergyLevel(energyProfiles);
        
        // Analyze energy trend
        const energyTrend = this.analyzeEnergyTrend(energyProfiles);
        
        // Detect fatigue indicators
        const fatigueIndicators = this.detectFatigueIndicators(
            validSegments, energyProfiles, rhythmMetrics, disfluencyMetrics
        );
        
        // Analyze circadian patterns
        const circadianProfile = this.analyzeCircadianPatterns(energyProfiles);
        
        // Assess cognitive resources
        const cognitiveResources = this.assessCognitiveResources(
            validSegments, rhythmMetrics, disfluencyMetrics
        );
        
        // Calculate recovery metrics
        const recoveryMetrics = this.calculateRecoveryMetrics(energyProfiles);
        
        // Generate predictions
        const predictions = this.generateEnergyPredictions(
            energyProfiles, circadianProfile, fatigueIndicators
        );
        
        return {
            currentEnergyLevel,
            energyTrend,
            fatigueIndicators,
            circadianProfile,
            cognitiveResources,
            recoveryMetrics,
            predictions
        };
    }
    
    /**
     * Create energy profiles from speech segments
     */
    private static createEnergyProfiles(
        segments: ImprovedSpeechSegment[],
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics
    ): EnergyProfile[] {
        
        // Group segments by time windows (15-minute intervals)
        const timeWindows = this.groupSegmentsByTimeWindow(segments, 15);
        const profiles: EnergyProfile[] = [];
        
        timeWindows.forEach((windowSegments, timestamp) => {
            if (windowSegments.length === 0) return;
            
            // Calculate metrics for this time window
            const speechRates = windowSegments.map(s => s.wordsPerMinute);
            const avgSpeechRate = StatisticalUtils.mean(speechRates);
            
            // Vocabulary complexity for window
            const uniqueWords = new Set<string>();
            let totalWords = 0;
            windowSegments.forEach(seg => {
                const words = seg.content.toLowerCase().split(/\s+/);
                words.forEach(w => uniqueWords.add(w));
                totalWords += words.length;
            });
            const vocabularyComplexity = totalWords > 0 ? (uniqueWords.size / totalWords) * 10 : 0;
            
            // Use rhythm and disfluency scores
            const fluencyScore = (rhythmMetrics.fluencyScore + disfluencyMetrics.fluencyRating) / 2;
            const cognitiveLoad = (rhythmMetrics.cognitiveLoadIndicator + disfluencyMetrics.speechPlanningDifficulty) / 2;
            
            // Calculate energy level (0-100)
            const energyLevel = this.calculateEnergyScore(
                avgSpeechRate,
                vocabularyComplexity,
                fluencyScore,
                cognitiveLoad
            );
            
            profiles.push({
                timestamp: new Date(timestamp),
                energyLevel,
                speechRate: avgSpeechRate,
                vocabularyComplexity,
                fluencyScore,
                cognitiveLoad
            });
        });
        
        return profiles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    
    /**
     * Calculate energy score from multiple factors
     */
    private static calculateEnergyScore(
        speechRate: number,
        vocabularyComplexity: number,
        fluencyScore: number,
        cognitiveLoad: number
    ): number {
        // Normalize speech rate (assume 120-180 WPM is normal range)
        const normalizedSpeechRate = Math.max(0, Math.min(1, (speechRate - 120) / 60));
        
        // Normalize vocabulary complexity (0-10 scale)
        const normalizedVocabulary = Math.max(0, Math.min(1, vocabularyComplexity / 10));
        
        // Normalize fluency (0-100 scale)
        const normalizedFluency = fluencyScore / 100;
        
        // Invert cognitive load (high load = low energy)
        const invertedLoad = 1 - cognitiveLoad;
        
        // Weighted combination
        const energyScore = (
            normalizedSpeechRate * 0.3 +
            normalizedVocabulary * 0.25 +
            normalizedFluency * 0.25 +
            invertedLoad * 0.2
        ) * 100;
        
        return Math.round(Math.max(0, Math.min(100, energyScore)));
    }
    
    /**
     * Calculate current energy level (recent 30 minutes)
     */
    private static calculateCurrentEnergyLevel(profiles: EnergyProfile[]): number {
        if (profiles.length === 0) return 50; // Default middle energy
        
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        
        const recentProfiles = profiles.filter(p => p.timestamp >= thirtyMinutesAgo);
        
        if (recentProfiles.length === 0) {
            // Use last available profile
            return profiles[profiles.length - 1].energyLevel;
        }
        
        // Weighted average (more recent = more weight)
        let weightedSum = 0;
        let totalWeight = 0;
        
        recentProfiles.forEach((profile, index) => {
            const weight = index + 1; // Later profiles get more weight
            weightedSum += profile.energyLevel * weight;
            totalWeight += weight;
        });
        
        return Math.round(weightedSum / totalWeight);
    }
    
    /**
     * Analyze energy trend over time
     */
    private static analyzeEnergyTrend(profiles: EnergyProfile[]): EnergyMetrics['energyTrend'] {
        if (profiles.length < 2) {
            return { direction: 'stable', rate: 0, significance: false };
        }
        
        // Convert to hours since first profile
        const firstTime = profiles[0].timestamp.getTime();
        const x = profiles.map(p => (p.timestamp.getTime() - firstTime) / (1000 * 60 * 60));
        const y = profiles.map(p => p.energyLevel);
        
        // Linear regression
        const regression = StatisticalUtils.linearRegression(x, y);
        
        // Determine direction
        let direction: 'increasing' | 'stable' | 'decreasing';
        if (Math.abs(regression.slope) < 2) {
            direction = 'stable';
        } else {
            direction = regression.slope > 0 ? 'increasing' : 'decreasing';
        }
        
        return {
            direction,
            rate: regression.slope,
            significance: regression.pValue < 0.05
        };
    }
    
    /**
     * Detect fatigue indicators
     */
    private static detectFatigueIndicators(
        segments: ImprovedSpeechSegment[],
        profiles: EnergyProfile[],
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics
    ): EnergyMetrics['fatigueIndicators'] {
        
        // Check for speech rate decline
        const speechRateDecline = profiles.length >= 3 && 
            profiles[profiles.length - 1].speechRate < profiles[0].speechRate * 0.9;
        
        // Check for vocabulary simplification
        const vocabularySimplification = profiles.length >= 3 &&
            profiles[profiles.length - 1].vocabularyComplexity < profiles[0].vocabularyComplexity * 0.8;
        
        // Check for increased pauses
        const increasedPauses = rhythmMetrics.pausePatterns.longPauses + 
            rhythmMetrics.pausePatterns.extendedPauses > 
            rhythmMetrics.pausePatterns.shortPauses;
        
        // Check for decreased fluency
        const decreasedFluency = disfluencyMetrics.fluencyRating < 70;
        
        // Calculate fatigue score (0-100)
        let score = 0;
        if (speechRateDecline) score += 25;
        if (vocabularySimplification) score += 25;
        if (increasedPauses) score += 25;
        if (decreasedFluency) score += 25;
        
        // Additional factors
        if (rhythmMetrics.cognitiveLoadIndicator > 0.7) score += 10;
        if (disfluencyMetrics.cognitiveLoadMarkers > 10) score += 10;
        
        return {
            speechRateDecline,
            vocabularySimplification,
            increasedPauses,
            decreasedFluency,
            score: Math.min(100, score)
        };
    }
    
    /**
     * Analyze circadian energy patterns
     */
    private static analyzeCircadianPatterns(profiles: EnergyProfile[]): EnergyMetrics['circadianProfile'] {
        if (profiles.length < 4) {
            return {
                currentPhase: 'stable',
                predictedLowPoint: '14:00',  // Typical afternoon dip
                predictedHighPoint: '10:00',  // Typical morning peak
                alignment: 0.5
            };
        }
        
        // Group profiles by hour of day
        const hourlyEnergy = new Map<number, number[]>();
        
        profiles.forEach(profile => {
            const hour = profile.timestamp.getHours();
            if (!hourlyEnergy.has(hour)) {
                hourlyEnergy.set(hour, []);
            }
            hourlyEnergy.get(hour)!.push(profile.energyLevel);
        });
        
        // Calculate average energy by hour
        const hourlyAverages = new Map<number, number>();
        hourlyEnergy.forEach((energies, hour) => {
            hourlyAverages.set(hour, StatisticalUtils.mean(energies));
        });
        
        // Find peak and trough times
        let maxEnergy = 0;
        let minEnergy = 100;
        let peakHour = 10;
        let troughHour = 14;
        
        hourlyAverages.forEach((energy, hour) => {
            if (energy > maxEnergy) {
                maxEnergy = energy;
                peakHour = hour;
            }
            if (energy < minEnergy) {
                minEnergy = energy;
                troughHour = hour;
            }
        });
        
        // Determine current phase
        const currentHour = new Date().getHours();
        const currentEnergy = hourlyAverages.get(currentHour) || 50;
        
        let currentPhase: 'peak' | 'declining' | 'trough' | 'rising';
        if (Math.abs(currentHour - peakHour) <= 1) {
            currentPhase = 'peak';
        } else if (Math.abs(currentHour - troughHour) <= 1) {
            currentPhase = 'trough';
        } else if (currentHour > peakHour && currentHour < troughHour) {
            currentPhase = 'declining';
        } else {
            currentPhase = 'rising';
        }
        
        // Calculate alignment with typical patterns
        const typicalPeakHours = [10, 11];
        const typicalTroughHours = [14, 15];
        const peakAlignment = typicalPeakHours.includes(peakHour) ? 1 : 0.5;
        const troughAlignment = typicalTroughHours.includes(troughHour) ? 1 : 0.5;
        const alignment = (peakAlignment + troughAlignment) / 2;
        
        return {
            currentPhase,
            predictedLowPoint: `${troughHour}:00`,
            predictedHighPoint: `${peakHour}:00`,
            alignment
        };
    }
    
    /**
     * Assess cognitive resources
     */
    private static assessCognitiveResources(
        segments: ImprovedSpeechSegment[],
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics
    ): EnergyMetrics['cognitiveResources'] {
        
        // Processing efficiency (based on speech momentum and pauses)
        const processingEfficiency = 1 - Math.min(
            (rhythmMetrics.pausePatterns.longPauses + rhythmMetrics.pausePatterns.extendedPauses) / 
            Math.max(segments.length, 1),
            1
        );
        
        // Vocabulary accessibility (based on word searching and disfluencies)
        const vocabularyAccessibility = 1 - Math.min(
            disfluencyMetrics.wordSearchingBehaviors / 10,
            1
        );
        
        // Thought organization (based on incomplete thoughts and topic shifts)
        const thoughtOrganization = 1 - Math.min(
            (disfluencyMetrics.incompleteThoughts + disfluencyMetrics.topicShifts) / 20,
            1
        );
        
        // Overall capacity
        const overallCapacity = (
            processingEfficiency * 35 +
            vocabularyAccessibility * 35 +
            thoughtOrganization * 30
        );
        
        return {
            processingEfficiency,
            vocabularyAccessibility,
            thoughtOrganization,
            overallCapacity: Math.round(overallCapacity)
        };
    }
    
    /**
     * Calculate recovery metrics
     */
    private static calculateRecoveryMetrics(profiles: EnergyProfile[]): EnergyMetrics['recoveryMetrics'] {
        if (profiles.length < 3) {
            return {
                restPeriodsDetected: 0,
                recoveryRate: 0,
                sustainedHighEnergy: 0,
                energyVolatility: 0
            };
        }
        
        let restPeriodsDetected = 0;
        let recoveryEpisodes = 0;
        let totalRecoveryGain = 0;
        let highEnergyMinutes = 0;
        
        // Detect rest periods and recovery
        for (let i = 1; i < profiles.length; i++) {
            const prev = profiles[i - 1];
            const current = profiles[i];
            
            // Rest period: energy below 40
            if (current.energyLevel < 40) {
                restPeriodsDetected++;
            }
            
            // Recovery: energy increase of 10+ points
            if (current.energyLevel > prev.energyLevel + 10) {
                recoveryEpisodes++;
                totalRecoveryGain += current.energyLevel - prev.energyLevel;
            }
            
            // High energy: above 70
            if (current.energyLevel > 70) {
                const timeDiff = (current.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60);
                highEnergyMinutes += timeDiff;
            }
        }
        
        // Calculate recovery rate
        const recoveryRate = recoveryEpisodes > 0 ? totalRecoveryGain / recoveryEpisodes : 0;
        
        // Calculate energy volatility (standard deviation)
        const energyLevels = profiles.map(p => p.energyLevel);
        const energyVolatility = StatisticalUtils.standardDeviation(energyLevels);
        
        return {
            restPeriodsDetected,
            recoveryRate,
            sustainedHighEnergy: Math.round(highEnergyMinutes),
            energyVolatility: Math.round(energyVolatility)
        };
    }
    
    /**
     * Generate energy predictions
     */
    private static generateEnergyPredictions(
        profiles: EnergyProfile[],
        circadianProfile: EnergyMetrics['circadianProfile'],
        fatigueIndicators: EnergyMetrics['fatigueIndicators']
    ): EnergyMetrics['predictions'] {
        
        if (profiles.length < 4) {
            return {
                nextLowEnergyPeriod: null,
                optimalBreakTime: null,
                enduranceEstimate: 0,
                confidence: 0
            };
        }
        
        // Predict next low energy period
        const currentHour = new Date().getHours();
        const troughHour = parseInt(circadianProfile.predictedLowPoint.split(':')[0]);
        
        let nextLowEnergyPeriod: string | null = null;
        if (currentHour < troughHour) {
            nextLowEnergyPeriod = circadianProfile.predictedLowPoint;
        } else {
            // Next day's trough
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(troughHour, 0, 0, 0);
            nextLowEnergyPeriod = tomorrow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
        
        // Suggest optimal break time (before predicted low)
        const optimalBreakHour = troughHour - 1;
        const optimalBreakTime = `${optimalBreakHour}:00`;
        
        // Estimate endurance based on current trajectory
        const currentEnergy = profiles[profiles.length - 1].energyLevel;
        const energyDeclineRate = Math.abs(profiles[profiles.length - 1].energyLevel - profiles[0].energyLevel) / 
                                 (profiles.length * 0.25); // per 15 minutes
        
        const enduranceEstimate = currentEnergy > 40 ? 
            Math.max(0, (currentEnergy - 40) / Math.max(energyDeclineRate, 1)) * 0.25 : 0;
        
        // Calculate prediction confidence
        const dataPoints = profiles.length;
        const consistency = 1 - (circadianProfile.alignment > 0.7 ? 0.2 : 0.5);
        const confidence = Math.min(dataPoints / 20, 1) * consistency;
        
        return {
            nextLowEnergyPeriod,
            optimalBreakTime,
            enduranceEstimate: Math.round(enduranceEstimate * 10) / 10,
            confidence
        };
    }
    
    /**
     * Group segments by time window
     */
    private static groupSegmentsByTimeWindow(
        segments: ImprovedSpeechSegment[],
        windowMinutes: number
    ): Map<number, ImprovedSpeechSegment[]> {
        const groups = new Map<number, ImprovedSpeechSegment[]>();
        
        segments.forEach(segment => {
            // Round down to nearest window
            const windowMs = windowMinutes * 60 * 1000;
            const windowStart = Math.floor(segment.timestamp.getTime() / windowMs) * windowMs;
            
            if (!groups.has(windowStart)) {
                groups.set(windowStart, []);
            }
            groups.get(windowStart)!.push(segment);
        });
        
        return groups;
    }
    
    /**
     * Create empty energy metrics for edge cases
     */
    static createEmptyEnergyMetrics(): EnergyMetrics {
        return {
            currentEnergyLevel: 50,
            energyTrend: {
                direction: 'stable',
                rate: 0,
                significance: false
            },
            fatigueIndicators: {
                speechRateDecline: false,
                vocabularySimplification: false,
                increasedPauses: false,
                decreasedFluency: false,
                score: 0
            },
            circadianProfile: {
                currentPhase: 'stable',
                predictedLowPoint: '14:00',
                predictedHighPoint: '10:00',
                alignment: 0.5
            },
            cognitiveResources: {
                processingEfficiency: 0.5,
                vocabularyAccessibility: 0.5,
                thoughtOrganization: 0.5,
                overallCapacity: 50
            },
            recoveryMetrics: {
                restPeriodsDetected: 0,
                recoveryRate: 0,
                sustainedHighEnergy: 0,
                energyVolatility: 0
            },
            predictions: {
                nextLowEnergyPeriod: null,
                optimalBreakTime: null,
                enduranceEstimate: 0,
                confidence: 0
            }
        };
    }
}