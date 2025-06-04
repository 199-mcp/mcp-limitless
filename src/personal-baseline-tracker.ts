import { ImprovedSpeechSegment, StatisticalBiomarkers } from './improved-speech-biomarkers.js';
import { StatisticalUtils, StatisticalResult } from './statistical-utils.js';
import { RhythmMetrics } from './speech-rhythm-analyzer.js';
import { DisfluencyMetrics } from './disfluency-detector.js';
import { EnergyMetrics } from './energy-fatigue-analyzer.js';

export interface PersonalBaseline {
    // Identity
    userId: string;
    establishedDate: string;
    lastUpdated: string;
    dataPoints: number;
    
    // Normal ranges for different times
    timeBasedNorms: {
        morning: BaselineMetrics;        // 6am-12pm
        afternoon: BaselineMetrics;      // 12pm-6pm
        evening: BaselineMetrics;        // 6pm-12am
        overall: BaselineMetrics;        // All times
    };
    
    // Context-specific baselines
    contextualNorms: {
        workday: BaselineMetrics;
        weekend: BaselineMetrics;
        meetings: BaselineMetrics;
        casual: BaselineMetrics;
    };
    
    // Personal patterns
    personalPatterns: {
        optimalHours: string[];          // When you perform best
        fatigueTimes: string[];          // When you typically get tired
        recoveryDuration: number;        // Minutes to recover from fatigue
        stressSignature: StressPattern;  // Your unique stress response
    };
    
    // Deviation thresholds
    alertThresholds: {
        speechRate: { lower: number; upper: number };
        energy: { critical: number; warning: number };
        fluency: { critical: number; warning: number };
        cognitive: { overload: number; concern: number };
    };
    
    // Health markers
    healthIndicators: {
        baselineStability: number;       // 0-1, how consistent
        adaptability: number;            // 0-1, how well you adapt
        resilience: number;              // 0-1, recovery ability
        variabilityIndex: number;        // Normal variation level
    };
}

export interface BaselineMetrics {
    speechRate: { mean: number; stdDev: number; range: [number, number] };
    pauseDuration: { mean: number; stdDev: number; range: [number, number] };
    vocabularyComplexity: { mean: number; stdDev: number; range: [number, number] };
    fluencyScore: { mean: number; stdDev: number; range: [number, number] };
    energyLevel: { mean: number; stdDev: number; range: [number, number] };
    disfluencyRate: { mean: number; stdDev: number; range: [number, number] };
    rhythmConsistency: { mean: number; stdDev: number; range: [number, number] };
}

export interface StressPattern {
    speechAcceleration: number;         // How much faster when stressed
    vocabularyConstriction: number;     // How much simpler words
    disfluencyIncrease: number;         // How many more fillers
    pauseReduction: number;             // How much shorter pauses
}

export interface DeviationAnalysis {
    isSignificant: boolean;
    deviationScore: number;             // 0-100, severity
    affectedMetrics: string[];
    interpretation: string;
    recommendations: string[];
}

export class PersonalBaselineTracker {
    
    private static baselines = new Map<string, PersonalBaseline>();
    
    /**
     * Update or create personal baseline from new data
     */
    static updateBaseline(
        userId: string,
        biomarkers: StatisticalBiomarkers,
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics,
        energyMetrics: EnergyMetrics,
        segments: ImprovedSpeechSegment[]
    ): PersonalBaseline {
        
        const existing = this.baselines.get(userId);
        
        if (!existing) {
            // Create new baseline
            return this.createNewBaseline(
                userId, biomarkers, rhythmMetrics, disfluencyMetrics, energyMetrics, segments
            );
        } else {
            // Update existing baseline
            return this.updateExistingBaseline(
                existing, biomarkers, rhythmMetrics, disfluencyMetrics, energyMetrics, segments
            );
        }
    }
    
    /**
     * Analyze deviation from personal baseline
     */
    static analyzeDeviation(
        userId: string,
        currentMetrics: {
            biomarkers: StatisticalBiomarkers;
            rhythm: RhythmMetrics;
            disfluency: DisfluencyMetrics;
            energy: EnergyMetrics;
        }
    ): DeviationAnalysis {
        
        const baseline = this.baselines.get(userId);
        if (!baseline) {
            return {
                isSignificant: false,
                deviationScore: 0,
                affectedMetrics: [],
                interpretation: "No baseline established yet. More data needed.",
                recommendations: ["Continue monitoring to establish personal baseline"]
            };
        }
        
        // Get current time period
        const hour = new Date().getHours();
        const isWeekend = [0, 6].includes(new Date().getDay());
        
        // Select appropriate baseline
        let timeNorm: BaselineMetrics;
        if (hour >= 6 && hour < 12) {
            timeNorm = baseline.timeBasedNorms.morning;
        } else if (hour >= 12 && hour < 18) {
            timeNorm = baseline.timeBasedNorms.afternoon;
        } else if (hour >= 18 && hour < 24) {
            timeNorm = baseline.timeBasedNorms.evening;
        } else {
            timeNorm = baseline.timeBasedNorms.overall;
        }
        
        const contextNorm = isWeekend ? 
            baseline.contextualNorms.weekend : 
            baseline.contextualNorms.workday;
        
        // Calculate deviations
        const deviations = this.calculateDeviations(currentMetrics, timeNorm, baseline.alertThresholds);
        
        // Determine significance and create analysis
        return this.createDeviationAnalysis(deviations, baseline);
    }
    
    /**
     * Create a new baseline profile
     */
    private static createNewBaseline(
        userId: string,
        biomarkers: StatisticalBiomarkers,
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics,
        energyMetrics: EnergyMetrics,
        segments: ImprovedSpeechSegment[]
    ): PersonalBaseline {
        
        const now = new Date().toISOString();
        
        // Create initial metrics from current data
        const currentMetrics = this.extractCurrentMetrics(
            biomarkers, rhythmMetrics, disfluencyMetrics, energyMetrics
        );
        
        // Initialize all time periods with current data (will differentiate over time)
        const initialBaseline: BaselineMetrics = {
            speechRate: {
                mean: currentMetrics.speechRate,
                stdDev: biomarkers.speechRate.standardError * Math.sqrt(biomarkers.speechRate.sampleSize),
                range: biomarkers.speechRate.confidenceInterval as [number, number]
            },
            pauseDuration: {
                mean: currentMetrics.pauseDuration,
                stdDev: biomarkers.pauseDuration.standardError * Math.sqrt(biomarkers.pauseDuration.sampleSize),
                range: biomarkers.pauseDuration.confidenceInterval as [number, number]
            },
            vocabularyComplexity: {
                mean: currentMetrics.vocabularyComplexity,
                stdDev: biomarkers.vocabularyComplexity.standardError * Math.sqrt(biomarkers.vocabularyComplexity.sampleSize),
                range: biomarkers.vocabularyComplexity.confidenceInterval as [number, number]
            },
            fluencyScore: {
                mean: currentMetrics.fluencyScore,
                stdDev: 10, // Initial estimate
                range: [currentMetrics.fluencyScore - 15, currentMetrics.fluencyScore + 15] as [number, number]
            },
            energyLevel: {
                mean: currentMetrics.energyLevel,
                stdDev: 15, // Initial estimate
                range: [currentMetrics.energyLevel - 20, currentMetrics.energyLevel + 20] as [number, number]
            },
            disfluencyRate: {
                mean: currentMetrics.disfluencyRate,
                stdDev: 2, // Initial estimate
                range: [Math.max(0, currentMetrics.disfluencyRate - 3), currentMetrics.disfluencyRate + 3] as [number, number]
            },
            rhythmConsistency: {
                mean: currentMetrics.rhythmConsistency,
                stdDev: 0.1, // Initial estimate
                range: [currentMetrics.rhythmConsistency - 0.15, currentMetrics.rhythmConsistency + 0.15] as [number, number]
            }
        };
        
        // Set alert thresholds based on initial data
        const alertThresholds = {
            speechRate: {
                lower: biomarkers.speechRate.value - 2 * biomarkers.speechRate.standardError,
                upper: biomarkers.speechRate.value + 2 * biomarkers.speechRate.standardError
            },
            energy: {
                critical: 30,
                warning: 40
            },
            fluency: {
                critical: 50,
                warning: 60
            },
            cognitive: {
                overload: 0.8,
                concern: 0.6
            }
        };
        
        const baseline: PersonalBaseline = {
            userId,
            establishedDate: now,
            lastUpdated: now,
            dataPoints: segments.length,
            timeBasedNorms: {
                morning: { ...initialBaseline },
                afternoon: { ...initialBaseline },
                evening: { ...initialBaseline },
                overall: initialBaseline
            },
            contextualNorms: {
                workday: { ...initialBaseline },
                weekend: { ...initialBaseline },
                meetings: { ...initialBaseline },
                casual: { ...initialBaseline }
            },
            personalPatterns: {
                optimalHours: this.identifyOptimalHours(energyMetrics),
                fatigueTimes: this.identifyFatigueTimes(energyMetrics),
                recoveryDuration: energyMetrics.recoveryMetrics.recoveryRate,
                stressSignature: this.identifyStressPattern(biomarkers, disfluencyMetrics)
            },
            alertThresholds,
            healthIndicators: {
                baselineStability: 0.5, // Will improve with more data
                adaptability: 0.5,
                resilience: energyMetrics.recoveryMetrics.recoveryRate / 20,
                variabilityIndex: biomarkers.speechRate.standardError / biomarkers.speechRate.value
            }
        };
        
        this.baselines.set(userId, baseline);
        return baseline;
    }
    
    /**
     * Update existing baseline with new data
     */
    private static updateExistingBaseline(
        existing: PersonalBaseline,
        biomarkers: StatisticalBiomarkers,
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics,
        energyMetrics: EnergyMetrics,
        segments: ImprovedSpeechSegment[]
    ): PersonalBaseline {
        
        // Extract current metrics
        const currentMetrics = this.extractCurrentMetrics(
            biomarkers, rhythmMetrics, disfluencyMetrics, energyMetrics
        );
        
        // Determine time period and context
        const hour = new Date().getHours();
        const isWeekend = [0, 6].includes(new Date().getDay());
        
        // Update appropriate time-based norm
        if (hour >= 6 && hour < 12) {
            this.updateBaselineMetrics(existing.timeBasedNorms.morning, currentMetrics, segments.length);
        } else if (hour >= 12 && hour < 18) {
            this.updateBaselineMetrics(existing.timeBasedNorms.afternoon, currentMetrics, segments.length);
        } else if (hour >= 18 && hour < 24) {
            this.updateBaselineMetrics(existing.timeBasedNorms.evening, currentMetrics, segments.length);
        }
        
        // Always update overall
        this.updateBaselineMetrics(existing.timeBasedNorms.overall, currentMetrics, segments.length);
        
        // Update contextual norms
        if (isWeekend) {
            this.updateBaselineMetrics(existing.contextualNorms.weekend, currentMetrics, segments.length);
        } else {
            this.updateBaselineMetrics(existing.contextualNorms.workday, currentMetrics, segments.length);
        }
        
        // Update personal patterns
        existing.personalPatterns.optimalHours = this.identifyOptimalHours(energyMetrics);
        existing.personalPatterns.fatigueTimes = this.identifyFatigueTimes(energyMetrics);
        
        // Update health indicators
        existing.healthIndicators.baselineStability = this.calculateStability(existing);
        existing.healthIndicators.adaptability = this.calculateAdaptability(existing);
        existing.healthIndicators.resilience = energyMetrics.recoveryMetrics.recoveryRate / 20;
        
        // Update metadata
        existing.lastUpdated = new Date().toISOString();
        existing.dataPoints += segments.length;
        
        return existing;
    }
    
    /**
     * Extract current metrics from analysis results
     */
    private static extractCurrentMetrics(
        biomarkers: StatisticalBiomarkers,
        rhythmMetrics: RhythmMetrics,
        disfluencyMetrics: DisfluencyMetrics,
        energyMetrics: EnergyMetrics
    ) {
        return {
            speechRate: biomarkers.speechRate.value,
            pauseDuration: biomarkers.pauseDuration.value,
            vocabularyComplexity: biomarkers.vocabularyComplexity.value,
            fluencyScore: (rhythmMetrics.fluencyScore + disfluencyMetrics.fluencyRating) / 2,
            energyLevel: energyMetrics.currentEnergyLevel,
            disfluencyRate: disfluencyMetrics.fillerWords.rate + disfluencyMetrics.repetitions.rate,
            rhythmConsistency: rhythmMetrics.rhythmConsistency
        };
    }
    
    /**
     * Update baseline metrics with exponential moving average
     */
    private static updateBaselineMetrics(
        baseline: BaselineMetrics,
        currentMetrics: any,
        newDataPoints: number
    ) {
        // Weight based on data volume (more data = more weight)
        const alpha = Math.min(0.3, newDataPoints / 100);
        
        // Update each metric
        Object.keys(baseline).forEach(metric => {
            const current = currentMetrics[metric];
            if (current !== undefined) {
                // Exponential moving average
                baseline[metric as keyof BaselineMetrics].mean = 
                    (1 - alpha) * baseline[metric as keyof BaselineMetrics].mean + alpha * current;
                
                // Update range (expand if needed)
                const range = baseline[metric as keyof BaselineMetrics].range;
                range[0] = Math.min(range[0], current);
                range[1] = Math.max(range[1], current);
                
                // Update standard deviation (simplified)
                const variance = Math.pow(current - baseline[metric as keyof BaselineMetrics].mean, 2);
                baseline[metric as keyof BaselineMetrics].stdDev = 
                    Math.sqrt((1 - alpha) * Math.pow(baseline[metric as keyof BaselineMetrics].stdDev, 2) + alpha * variance);
            }
        });
    }
    
    /**
     * Identify optimal performance hours
     */
    private static identifyOptimalHours(energyMetrics: EnergyMetrics): string[] {
        // For now, use circadian peak
        // In future, track actual performance metrics
        return [energyMetrics.circadianProfile.predictedHighPoint];
    }
    
    /**
     * Identify typical fatigue times
     */
    private static identifyFatigueTimes(energyMetrics: EnergyMetrics): string[] {
        // For now, use circadian trough
        // In future, track actual fatigue patterns
        return [energyMetrics.circadianProfile.predictedLowPoint];
    }
    
    /**
     * Identify personal stress signature
     */
    private static identifyStressPattern(
        biomarkers: StatisticalBiomarkers,
        disfluencyMetrics: DisfluencyMetrics
    ): StressPattern {
        // Initial estimates - will refine with more data
        return {
            speechAcceleration: 1.1, // 10% faster when stressed
            vocabularyConstriction: 0.8, // 20% simpler vocabulary
            disfluencyIncrease: 1.5, // 50% more disfluencies
            pauseReduction: 0.7 // 30% shorter pauses
        };
    }
    
    /**
     * Calculate baseline stability
     */
    private static calculateStability(baseline: PersonalBaseline): number {
        // Compare variability across time periods
        const metrics = ['speechRate', 'fluencyScore', 'energyLevel'];
        let totalVariability = 0;
        
        metrics.forEach(metric => {
            const morning = baseline.timeBasedNorms.morning[metric as keyof BaselineMetrics].mean;
            const afternoon = baseline.timeBasedNorms.afternoon[metric as keyof BaselineMetrics].mean;
            const evening = baseline.timeBasedNorms.evening[metric as keyof BaselineMetrics].mean;
            
            const values = [morning, afternoon, evening];
            const mean = values.reduce((a, b) => a + b) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            
            totalVariability += Math.sqrt(variance) / mean;
        });
        
        // Convert to stability score (inverse of variability)
        return Math.max(0, 1 - totalVariability / metrics.length);
    }
    
    /**
     * Calculate adaptability score
     */
    private static calculateAdaptability(baseline: PersonalBaseline): number {
        // Compare workday vs weekend patterns
        const workday = baseline.contextualNorms.workday;
        const weekend = baseline.contextualNorms.weekend;
        
        // If similar performance across contexts = high adaptability
        const speechDiff = Math.abs(workday.speechRate.mean - weekend.speechRate.mean) / workday.speechRate.mean;
        const energyDiff = Math.abs(workday.energyLevel.mean - weekend.energyLevel.mean) / workday.energyLevel.mean;
        
        return Math.max(0, 1 - (speechDiff + energyDiff) / 2);
    }
    
    /**
     * Calculate deviations from baseline
     */
    private static calculateDeviations(
        currentMetrics: any,
        baseline: BaselineMetrics,
        thresholds: PersonalBaseline['alertThresholds']
    ) {
        const deviations: any = {};
        
        // Speech rate deviation
        const speechRate = currentMetrics.biomarkers.speechRate.value;
        deviations.speechRate = {
            value: speechRate,
            expected: baseline.speechRate.mean,
            zScore: (speechRate - baseline.speechRate.mean) / baseline.speechRate.stdDev,
            isAbnormal: speechRate < thresholds.speechRate.lower || speechRate > thresholds.speechRate.upper
        };
        
        // Energy deviation
        const energy = currentMetrics.energy.currentEnergyLevel;
        deviations.energy = {
            value: energy,
            expected: baseline.energyLevel.mean,
            zScore: (energy - baseline.energyLevel.mean) / baseline.energyLevel.stdDev,
            isAbnormal: energy < thresholds.energy.warning
        };
        
        // Fluency deviation
        const fluency = (currentMetrics.rhythm.fluencyScore + currentMetrics.disfluency.fluencyRating) / 2;
        deviations.fluency = {
            value: fluency,
            expected: baseline.fluencyScore.mean,
            zScore: (fluency - baseline.fluencyScore.mean) / baseline.fluencyScore.stdDev,
            isAbnormal: fluency < thresholds.fluency.warning
        };
        
        // Cognitive load
        const cognitiveLoad = currentMetrics.rhythm.cognitiveLoadIndicator;
        deviations.cognitiveLoad = {
            value: cognitiveLoad,
            isAbnormal: cognitiveLoad > thresholds.cognitive.concern
        };
        
        return deviations;
    }
    
    /**
     * Create deviation analysis report
     */
    private static createDeviationAnalysis(deviations: any, baseline: PersonalBaseline): DeviationAnalysis {
        const affectedMetrics: string[] = [];
        let totalDeviation = 0;
        let criticalDeviations = 0;
        
        // Check each metric
        Object.keys(deviations).forEach(metric => {
            const dev = deviations[metric];
            if (dev.isAbnormal) {
                affectedMetrics.push(metric);
                if (dev.zScore) {
                    totalDeviation += Math.abs(dev.zScore);
                    if (Math.abs(dev.zScore) > 2) criticalDeviations++;
                }
            }
        });
        
        const isSignificant = affectedMetrics.length >= 2 || criticalDeviations > 0;
        const deviationScore = Math.min(100, totalDeviation * 10);
        
        // Generate interpretation
        let interpretation = "";
        if (!isSignificant) {
            interpretation = "Performance within normal personal range.";
        } else if (deviations.energy.isAbnormal && deviations.energy.value < 40) {
            interpretation = "Significant fatigue detected. Energy levels well below your baseline.";
        } else if (deviations.cognitiveLoad.isAbnormal) {
            interpretation = "High cognitive load detected. Speech patterns indicate mental strain.";
        } else if (deviations.fluency.isAbnormal) {
            interpretation = "Reduced fluency compared to baseline. May indicate stress or fatigue.";
        } else {
            interpretation = "Multiple metrics outside normal range. Monitor closely.";
        }
        
        // Generate recommendations
        const recommendations: string[] = [];
        if (deviations.energy.isAbnormal) {
            recommendations.push("Consider taking a 15-20 minute break");
            recommendations.push(`Your optimal recovery time is typically ${baseline.personalPatterns.recoveryDuration} minutes`);
        }
        if (deviations.cognitiveLoad.isAbnormal) {
            recommendations.push("Simplify current tasks or delegate if possible");
            recommendations.push("Practice deep breathing to reduce cognitive load");
        }
        if (affectedMetrics.length >= 3) {
            recommendations.push("Multiple indicators suggest you need rest");
            recommendations.push(`Next predicted low energy: ${baseline.personalPatterns.fatigueTimes[0]}`);
        }
        
        return {
            isSignificant,
            deviationScore,
            affectedMetrics,
            interpretation,
            recommendations
        };
    }
}