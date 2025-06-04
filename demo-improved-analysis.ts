#!/usr/bin/env node

import { ImprovedSpeechBiomarkerAnalyzer } from "./src/improved-speech-biomarkers.js";

// Simulate the data we had from earlier (126 user segments)
function createSimulatedData() {
    const segments = [];
    const baseTime = new Date('2025-06-04T13:00:00Z');
    
    // Simulate realistic speech data based on what we observed
    for (let i = 0; i < 126; i++) {
        const words = Math.floor(Math.random() * 20) + 5; // 5-25 words
        const duration = (words / 150) * 60000 + Math.random() * 5000; // ~150 WPM with variation
        const wpm = (words / duration) * 60000;
        
        segments.push({
            id: `segment_${i}`,
            title: `Simulated conversation ${i}`,
            startTime: new Date(baseTime.getTime() + i * 60000).toISOString(),
            endTime: new Date(baseTime.getTime() + i * 60000 + duration).toISOString(),
            contents: [{
                type: 'blockquote',
                content: `This is simulated speech content with ${words} words. It represents realistic conversation data for biomarker analysis.`,
                startOffsetMs: 0,
                endOffsetMs: duration,
                speakerName: 'You',
                speakerIdentifier: 'user' as const
            }]
        });
    }
    
    return segments;
}

async function demonstrateImprovedAnalysis() {
    try {
        console.log("🧠 IMPROVED SPEECH BIOMARKER ANALYSIS DEMONSTRATION");
        console.log("=".repeat(80));
        console.log("Using simulated data based on your actual API structure");
        
        // Create simulated data
        const simulatedLifelogs = createSimulatedData();
        console.log(`\n📊 Analyzing ${simulatedLifelogs.length} simulated lifelogs...`);
        
        // Analyze with improved methodology
        console.log("\n🔬 Running improved statistical analysis...");
        const biomarkers = ImprovedSpeechBiomarkerAnalyzer.analyzeSpeechPatternsWithStats(simulatedLifelogs);
        
        // Display results with proper statistical reporting
        console.log("\n" + "=".repeat(80));
        console.log("📊 RIGOROUS SPEECH BIOMARKER ANALYSIS RESULTS");
        console.log("=".repeat(80));
        
        // Data Quality Assessment
        console.log("\n🔍 DATA QUALITY ASSESSMENT:");
        console.log(`Total segments analyzed: ${biomarkers.dataQuality.totalSegments}`);
        console.log(`Valid segments: ${biomarkers.dataQuality.validSegments} (${((biomarkers.dataQuality.validSegments/biomarkers.dataQuality.totalSegments)*100).toFixed(1)}%)`);
        console.log(`Outliers removed: ${biomarkers.dataQuality.outliers}`);
        console.log(`Quality score: ${(biomarkers.dataQuality.qualityScore * 100).toFixed(1)}%`);
        console.log(`Data reliability: ${biomarkers.reliability.toUpperCase()}`);
        console.log(`Analysis timespan: ${biomarkers.dataTimespan}`);
        
        // Core Speech Metrics with Confidence Intervals
        console.log("\n📈 CORE SPEECH METRICS (with 95% Confidence Intervals):");
        console.log(`Speech Rate: ${biomarkers.speechRate.value.toFixed(1)} WPM [${biomarkers.speechRate.confidenceInterval[0].toFixed(1)}, ${biomarkers.speechRate.confidenceInterval[1].toFixed(1)}]`);
        console.log(`  Sample size: n=${biomarkers.speechRate.sampleSize}, SE=${biomarkers.speechRate.standardError.toFixed(2)}`);
        
        if (biomarkers.pauseDuration.sampleSize > 0) {
            console.log(`Pause Duration: ${biomarkers.pauseDuration.value.toFixed(2)} seconds [${biomarkers.pauseDuration.confidenceInterval[0].toFixed(2)}, ${biomarkers.pauseDuration.confidenceInterval[1].toFixed(2)}]`);
            console.log(`  Sample size: n=${biomarkers.pauseDuration.sampleSize}, SE=${biomarkers.pauseDuration.standardError.toFixed(3)}`);
        }
        
        console.log(`Vocabulary Complexity: ${biomarkers.vocabularyComplexity.value.toFixed(2)} [${biomarkers.vocabularyComplexity.confidenceInterval[0].toFixed(2)}, ${biomarkers.vocabularyComplexity.confidenceInterval[1].toFixed(2)}]`);
        console.log(`  Sample size: n=${biomarkers.vocabularyComplexity.sampleSize}, SE=${biomarkers.vocabularyComplexity.standardError.toFixed(3)}`);
        
        console.log(`Words per Turn: ${biomarkers.wordsPerTurn.value.toFixed(1)} [${biomarkers.wordsPerTurn.confidenceInterval[0].toFixed(1)}, ${biomarkers.wordsPerTurn.confidenceInterval[1].toFixed(1)}]`);
        console.log(`  Sample size: n=${biomarkers.wordsPerTurn.sampleSize}, SE=${biomarkers.wordsPerTurn.standardError.toFixed(2)}`);
        
        // Trend Analysis with Statistical Significance
        console.log("\n📊 TREND ANALYSIS:");
        console.log(`Speech rate trend: ${biomarkers.speechRateTrend.slope.toFixed(3)} WPM/hour`);
        console.log(`  R² = ${biomarkers.speechRateTrend.rSquared.toFixed(3)}, p = ${biomarkers.speechRateTrend.pValue.toFixed(3)}`);
        console.log(`  95% CI: [${biomarkers.speechRateTrend.confidenceInterval[0].toFixed(3)}, ${biomarkers.speechRateTrend.confidenceInterval[1].toFixed(3)}]`);
        console.log(`  Statistical significance: ${biomarkers.speechRateTrend.significance.toUpperCase()}`);
        
        // Population Percentile Rankings
        console.log("\n🎯 POPULATION PERCENTILE RANKINGS:");
        console.log(`Speech Rate: ${biomarkers.percentileRankings.speechRate}th percentile (vs. normal adults 120-180 WPM)`);
        console.log(`Pause Duration: ${biomarkers.percentileRankings.pauseDuration}th percentile (vs. normal 0.5-2.0 seconds)`);
        console.log(`Vocabulary Complexity: ${biomarkers.percentileRankings.vocabularyComplexity}th percentile (vs. typical conversation)`);
        
        // Time-of-Day Analysis
        console.log("\n⏰ TIME-OF-DAY ANALYSIS:");
        console.log(`Significant circadian variation: ${biomarkers.timeOfDayEffects.significantVariation ? 'YES' : 'NO'} (p = ${biomarkers.timeOfDayEffects.pValue.toFixed(3)})`);
        if (biomarkers.timeOfDayEffects.pattern.length > 0) {
            console.log("Hourly patterns with confidence intervals:");
            biomarkers.timeOfDayEffects.pattern.forEach(hour => {
                const timeStr = `${hour.hour.toString().padStart(2, '0')}:00`;
                console.log(`  ${timeStr}: ${hour.meanWPM.toFixed(1)} WPM [${hour.confidenceInterval[0].toFixed(1)}, ${hour.confidenceInterval[1].toFixed(1)}]`);
            });
        }
        
        // Data Recommendations
        if (biomarkers.minimumDataRecommendations.length > 0) {
            console.log("\n💡 DATA COLLECTION RECOMMENDATIONS:");
            biomarkers.minimumDataRecommendations.forEach((rec, i) => {
                console.log(`${i + 1}. ${rec}`);
            });
        }
        
        // Statistical Interpretation
        console.log("\n" + "=".repeat(80));
        console.log("📋 STATISTICAL INTERPRETATION:");
        
        // Reliability assessment
        console.log(`\n🔬 RELIABILITY: ${biomarkers.reliability.toUpperCase()}`);
        if (biomarkers.reliability === "high") {
            console.log("✅ Results are statistically reliable for trend detection");
            console.log("✅ Sample size adequate for clinical-grade analysis");
            console.log("✅ Confidence intervals narrow enough for precise estimates");
        } else if (biomarkers.reliability === "medium") {
            console.log("⚠️  Results are moderately reliable - collect more data for better precision");
            console.log("⚠️  Confidence intervals may be wide - interpret with caution");
        } else {
            console.log("❌ Results have low reliability - significantly more data needed");
            console.log("❌ Cannot make reliable clinical inferences from current data");
        }
        
        // Effect size interpretation
        if (biomarkers.speechRateTrend.significance === "significant") {
            const effectSize = Math.abs(biomarkers.speechRateTrend.slope);
            if (effectSize > 5) {
                console.log("🔴 LARGE speech rate change detected - clinically significant");
                console.log("   Consider consultation if this represents a sudden change");
            } else if (effectSize > 2) {
                console.log("🟡 MODERATE speech rate change detected");
                console.log("   Monitor trends over time");
            } else {
                console.log("🟢 SMALL speech rate change detected - likely normal variation");
            }
        } else {
            console.log("📊 No statistically significant trend detected");
            console.log("   Speech patterns appear stable over analysis period");
        }
        
        // Comparison to norms
        console.log(`\n📊 COMPARISON TO POPULATION NORMS:`);
        if (biomarkers.percentileRankings.speechRate > 85) {
            console.log("🟢 Speech rate: Above average (faster than 85% of population)");
            console.log("   May indicate high cognitive processing speed");
        } else if (biomarkers.percentileRankings.speechRate < 15) {
            console.log("🟡 Speech rate: Below average (slower than 85% of population)");
            console.log("   Consider monitoring if this represents a change");
        } else {
            console.log("✅ Speech rate: Within normal range (15th-85th percentile)");
        }
        
        // Clinical context with evidence base
        console.log("\n🏥 CLINICAL EVIDENCE BASE:");
        console.log("• Normal speech rate: 120-180 WPM (Tauroza & Allison, 1990)");
        console.log("• Speech rate decline: Early indicator in neurological conditions");
        console.log("• Pause patterns: Reflect cognitive processing and planning");
        console.log("• Vocabulary complexity: Correlates with cognitive reserve");
        console.log("• Statistical significance: p < 0.05 indicates reliable change");
        console.log("• Confidence intervals: 95% CI means 95% confidence true value is in range");
        
        console.log("\n" + "=".repeat(80));
        console.log("🎯 KEY IMPROVEMENTS OVER PREVIOUS VERSION:");
        console.log("✅ Proper confidence intervals for all metrics");
        console.log("✅ Statistical significance testing for trends");
        console.log("✅ Population-based percentile rankings");
        console.log("✅ Data quality assessment and outlier removal");
        console.log("✅ Evidence-based interpretation guidelines");
        console.log("✅ Reliability assessment based on sample size");
        console.log("✅ No arbitrary health scores - only validated metrics");
        
        console.log("\n" + "=".repeat(80));
        console.log(`Analysis completed: ${new Date(biomarkers.analysisDate).toLocaleString()}`);
        console.log(`Total analysis time: ${(biomarkers.totalAnalysisTime / 60000).toFixed(1)} minutes of speech`);
        
    } catch (error) {
        console.error("❌ Error during demonstration:", error);
    }
}

// Run the demonstration
demonstrateImprovedAnalysis();