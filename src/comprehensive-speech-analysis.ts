import { Lifelog } from './limitless-client.js';
import { ImprovedSpeechBiomarkerAnalyzer, StatisticalBiomarkers } from './improved-speech-biomarkers.js';
import { SpeechRhythmAnalyzer, RhythmMetrics } from './speech-rhythm-analyzer.js';
import { DisfluencyDetector, DisfluencyMetrics } from './disfluency-detector.js';
import { EnergyFatigueAnalyzer, EnergyMetrics } from './energy-fatigue-analyzer.js';
import { PersonalBaselineTracker, PersonalBaseline, DeviationAnalysis } from './personal-baseline-tracker.js';
import { EnvironmentalActivityAnalyzer, EnvironmentalActivityMetrics } from './environmental-activity-analyzer.js';

export interface ComprehensiveSpeechAnalysis {
    // Core statistical biomarkers
    coreMetrics: StatisticalBiomarkers;
    
    // Advanced rhythm analysis
    rhythmAnalysis: RhythmMetrics;
    
    // Disfluency patterns
    disfluencyAnalysis: DisfluencyMetrics;
    
    // Energy and fatigue assessment
    energyAnalysis: EnergyMetrics;
    
    // Personal baseline comparison
    personalBaseline?: PersonalBaseline;
    deviationAnalysis?: DeviationAnalysis;
    
    // Environmental activity patterns
    environmentalAnalysis: EnvironmentalActivityMetrics;
    
    // Integrated health score
    integratedHealthScore: {
        overall: number;                    // 0-100
        cognitive: number;                  // 0-100
        energy: number;                     // 0-100
        fluency: number;                    // 0-100
        stability: number;                  // 0-100
    };
    
    // Clinical insights
    clinicalInsights: {
        primaryConcerns: string[];
        positiveIndicators: string[];
        recommendations: string[];
        followUpSuggestions: string[];
    };
    
    // Predictive analytics
    predictions: {
        nextLowEnergyPeriod: string | null;
        optimalPerformanceTimes: string[];
        riskFactors: Array<{factor: string; probability: number}>;
    };
    
    // Analysis metadata
    metadata: {
        analysisDate: string;
        dataQuality: string;
        confidence: number;
        processingTime: number;
    };
}

export class ComprehensiveSpeechAnalyzer {
    
    /**
     * Perform comprehensive speech analysis with all advanced metrics
     */
    static async analyzeComprehensively(
        lifelogs: Lifelog[],
        userId?: string,
        options?: {
            includeBaseline?: boolean;
            timeRange?: { start: string; end: string };
        }
    ): Promise<ComprehensiveSpeechAnalysis> {
        
        const startTime = Date.now();
        
        // 1. Core statistical biomarkers
        console.log("🔬 Analyzing core speech biomarkers...");
        const coreMetrics = ImprovedSpeechBiomarkerAnalyzer.analyzeSpeechPatternsWithStats(lifelogs);
        
        // Extract validated segments for other analyzers
        const segments = ImprovedSpeechBiomarkerAnalyzer['extractAndValidateSegments'](lifelogs);
        const validSegments = segments.filter(s => s.isValid);
        
        if (validSegments.length === 0) {
            return this.createEmptyAnalysis();
        }
        
        // 2. Rhythm analysis
        console.log("🎵 Analyzing speech rhythm patterns...");
        const rhythmAnalysis = SpeechRhythmAnalyzer.analyzeRhythm(validSegments);
        
        // 3. Disfluency detection
        console.log("🗣️ Detecting speech disfluencies...");
        const disfluencyAnalysis = DisfluencyDetector.analyzeDisfluencies(validSegments);
        
        // 4. Energy and fatigue analysis
        console.log("⚡ Assessing energy and fatigue levels...");
        const energyAnalysis = EnergyFatigueAnalyzer.analyzeEnergyPatterns(
            validSegments,
            rhythmAnalysis,
            disfluencyAnalysis,
            options?.timeRange
        );
        
        // 5. Environmental activity analysis
        console.log("🌍 Analyzing environmental activity patterns...");
        const environmentalAnalysis = EnvironmentalActivityAnalyzer.analyzeActivityPatterns(lifelogs);
        
        // 6. Personal baseline (if userId provided)
        let personalBaseline: PersonalBaseline | undefined;
        let deviationAnalysis: DeviationAnalysis | undefined;
        
        if (userId && options?.includeBaseline) {
            console.log("📊 Updating personal baseline...");
            personalBaseline = PersonalBaselineTracker.updateBaseline(
                userId,
                coreMetrics,
                rhythmAnalysis,
                disfluencyAnalysis,
                energyAnalysis,
                validSegments
            );
            
            console.log("🔍 Analyzing deviation from baseline...");
            deviationAnalysis = PersonalBaselineTracker.analyzeDeviation(
                userId,
                {
                    biomarkers: coreMetrics,
                    rhythm: rhythmAnalysis,
                    disfluency: disfluencyAnalysis,
                    energy: energyAnalysis
                }
            );
        }
        
        // 7. Calculate integrated health scores
        const integratedHealthScore = this.calculateIntegratedHealthScore(
            coreMetrics,
            rhythmAnalysis,
            disfluencyAnalysis,
            energyAnalysis,
            environmentalAnalysis
        );
        
        // 8. Generate clinical insights
        const clinicalInsights = this.generateClinicalInsights(
            coreMetrics,
            rhythmAnalysis,
            disfluencyAnalysis,
            energyAnalysis,
            environmentalAnalysis,
            deviationAnalysis
        );
        
        // 8. Generate predictions
        const predictions = this.generatePredictions(
            energyAnalysis,
            coreMetrics,
            personalBaseline
        );
        
        // 9. Compile metadata
        const metadata = {
            analysisDate: new Date().toISOString(),
            dataQuality: coreMetrics.reliability,
            confidence: this.calculateConfidence(coreMetrics, validSegments.length),
            processingTime: Date.now() - startTime
        };
        
        return {
            coreMetrics,
            rhythmAnalysis,
            disfluencyAnalysis,
            energyAnalysis,
            environmentalAnalysis,
            personalBaseline,
            deviationAnalysis,
            integratedHealthScore,
            clinicalInsights,
            predictions,
            metadata
        };
    }
    
    /**
     * Calculate integrated health scores
     */
    private static calculateIntegratedHealthScore(
        coreMetrics: StatisticalBiomarkers,
        rhythmAnalysis: RhythmMetrics,
        disfluencyAnalysis: DisfluencyMetrics,
        energyAnalysis: EnergyMetrics,
        environmentalAnalysis: EnvironmentalActivityMetrics
    ) {
        // Cognitive score
        const cognitive = Math.round(
            energyAnalysis.cognitiveResources.overallCapacity * 0.4 +
            (100 - rhythmAnalysis.cognitiveLoadIndicator * 100) * 0.3 +
            (100 - disfluencyAnalysis.speechPlanningDifficulty * 100) * 0.3
        );
        
        // Energy score
        const energy = energyAnalysis.currentEnergyLevel;
        
        // Fluency score
        const fluency = Math.round(
            (rhythmAnalysis.fluencyScore + disfluencyAnalysis.fluencyRating) / 2
        );
        
        // Stability score
        const stability = Math.round(
            rhythmAnalysis.rhythmConsistency * 50 +
            (1 - energyAnalysis.recoveryMetrics.energyVolatility / 50) * 50
        );
        
        // Overall score
        const overall = Math.round(
            (cognitive + energy + fluency + stability) / 4
        );
        
        return {
            overall,
            cognitive,
            energy,
            fluency,
            stability
        };
    }
    
    /**
     * Generate clinical insights from analysis
     */
    private static generateClinicalInsights(
        coreMetrics: StatisticalBiomarkers,
        rhythmAnalysis: RhythmMetrics,
        disfluencyAnalysis: DisfluencyMetrics,
        energyAnalysis: EnergyMetrics,
        environmentalAnalysis: EnvironmentalActivityMetrics,
        deviationAnalysis?: DeviationAnalysis
    ) {
        const primaryConcerns: string[] = [];
        const positiveIndicators: string[] = [];
        const recommendations: string[] = [];
        const followUpSuggestions: string[] = [];
        
        // Check for concerns
        if (energyAnalysis.fatigueIndicators.score > 60) {
            primaryConcerns.push("Significant fatigue indicators detected");
            recommendations.push("Consider scheduling regular breaks every 90 minutes");
        }
        
        if (rhythmAnalysis.cognitiveLoadIndicator > 0.7) {
            primaryConcerns.push("High cognitive load affecting speech patterns");
            recommendations.push("Simplify current tasks or practice stress reduction techniques");
        }
        
        if (disfluencyAnalysis.fluencyRating < 60) {
            primaryConcerns.push("Below-average speech fluency detected");
            recommendations.push("Slow down speech rate and focus on clear articulation");
        }
        
        if (deviationAnalysis?.isSignificant && deviationAnalysis.deviationScore > 50) {
            primaryConcerns.push("Significant deviation from personal baseline");
            deviationAnalysis.recommendations.forEach(rec => recommendations.push(rec));
        }
        
        // Positive indicators
        if (coreMetrics.percentileRankings.speechRate > 70) {
            positiveIndicators.push("Above-average speech rate indicates good cognitive processing");
        }
        
        if (rhythmAnalysis.rhythmConsistency > 0.8) {
            positiveIndicators.push("Excellent speech rhythm consistency");
        }
        
        if (energyAnalysis.recoveryMetrics.recoveryRate > 15) {
            positiveIndicators.push("Strong recovery ability from fatigue");
        }
        
        // Environmental insights
        if (environmentalAnalysis.sleepAnalysis.estimatedSleepHours < 6) {
            primaryConcerns.push("Low estimated sleep hours may impact cognitive performance");
            recommendations.push("Aim for 7-9 hours of sleep per night");
        }
        
        if (environmentalAnalysis.socialPatterns.isolationPeriods > 3) {
            primaryConcerns.push("Multiple extended isolation periods detected");
            recommendations.push("Consider scheduling regular social interactions");
        }
        
        if (environmentalAnalysis.conversationDynamics.conversationalDominance === 'dominant') {
            recommendations.push("Practice active listening to balance conversations");
        }
        
        if (environmentalAnalysis.dailyPatterns.coveragePercentage < 30) {
            followUpSuggestions.push("Increase pendant usage for more comprehensive analysis");
        }
        
        // Follow-up suggestions
        if (coreMetrics.reliability !== "high") {
            followUpSuggestions.push("Continue monitoring to establish reliable baseline (need 100+ segments)");
        }
        
        if (primaryConcerns.length >= 2) {
            followUpSuggestions.push("Consider daily monitoring for the next week");
            followUpSuggestions.push("Review patterns with healthcare provider if concerns persist");
        }
        
        return {
            primaryConcerns,
            positiveIndicators,
            recommendations,
            followUpSuggestions
        };
    }
    
    /**
     * Generate predictions
     */
    private static generatePredictions(
        energyAnalysis: EnergyMetrics,
        coreMetrics: StatisticalBiomarkers,
        personalBaseline?: PersonalBaseline
    ) {
        const riskFactors: Array<{factor: string; probability: number}> = [];
        
        // Fatigue risk
        if (energyAnalysis.fatigueIndicators.score > 40) {
            riskFactors.push({
                factor: "Fatigue within next 2 hours",
                probability: Math.min(energyAnalysis.fatigueIndicators.score / 100 + 0.2, 1)
            });
        }
        
        // Cognitive overload risk
        if (coreMetrics.speechRateTrend.slope > 10 && coreMetrics.speechRateTrend.significance === "significant") {
            riskFactors.push({
                factor: "Cognitive overload risk",
                probability: 0.7
            });
        }
        
        // Performance decline risk
        if (energyAnalysis.energyTrend.direction === "decreasing" && energyAnalysis.energyTrend.significance) {
            riskFactors.push({
                factor: "Performance decline if no break taken",
                probability: 0.8
            });
        }
        
        return {
            nextLowEnergyPeriod: energyAnalysis.predictions.nextLowEnergyPeriod,
            optimalPerformanceTimes: personalBaseline?.personalPatterns.optimalHours || ["10:00", "16:00"],
            riskFactors
        };
    }
    
    /**
     * Calculate analysis confidence
     */
    private static calculateConfidence(coreMetrics: StatisticalBiomarkers, segmentCount: number): number {
        let confidence = 0;
        
        // Data volume factor
        if (segmentCount >= 100) confidence += 0.4;
        else if (segmentCount >= 50) confidence += 0.3;
        else if (segmentCount >= 30) confidence += 0.2;
        else confidence += 0.1;
        
        // Data quality factor
        confidence += coreMetrics.dataQuality.qualityScore * 0.3;
        
        // Reliability factor
        if (coreMetrics.reliability === "high") confidence += 0.3;
        else if (coreMetrics.reliability === "medium") confidence += 0.2;
        else confidence += 0.1;
        
        return Math.round(confidence * 100) / 100;
    }
    
    /**
     * Create empty analysis for edge cases
     */
    private static createEmptyAnalysis(): ComprehensiveSpeechAnalysis {
        return {
            coreMetrics: ImprovedSpeechBiomarkerAnalyzer['createEmptyStatisticalResults'](),
            rhythmAnalysis: SpeechRhythmAnalyzer['createEmptyRhythmMetrics'](),
            disfluencyAnalysis: DisfluencyDetector['createEmptyDisfluencyMetrics'](),
            energyAnalysis: EnergyFatigueAnalyzer['createEmptyEnergyMetrics'](),
            environmentalAnalysis: EnvironmentalActivityAnalyzer['createEmptyMetrics'](),
            integratedHealthScore: {
                overall: 0,
                cognitive: 0,
                energy: 0,
                fluency: 0,
                stability: 0
            },
            clinicalInsights: {
                primaryConcerns: ["Insufficient data for analysis"],
                positiveIndicators: [],
                recommendations: ["Continue recording to establish baseline"],
                followUpSuggestions: []
            },
            predictions: {
                nextLowEnergyPeriod: null,
                optimalPerformanceTimes: [],
                riskFactors: []
            },
            metadata: {
                analysisDate: new Date().toISOString(),
                dataQuality: "low",
                confidence: 0,
                processingTime: 0
            }
        };
    }
}