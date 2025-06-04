#!/usr/bin/env node

import { getLifelogs } from "./src/limitless-client.js";
import { ImprovedSpeechBiomarkerAnalyzer } from "./src/improved-speech-biomarkers.js";

const API_KEY = "sk-9b033962-9a1a-45ea-a2c0-8287294f6d09";

async function testImprovedAnalysis() {
    try {
        console.log("🧠 IMPROVED SPEECH BIOMARKER ANALYSIS WITH STATISTICAL RIGOR");
        console.log("=".repeat(80));
        
        // Get recent lifelogs
        console.log("\n📊 Fetching recent lifelogs...");
        const recentLogs = await getLifelogs(API_KEY, {
            limit: 50,
            includeMarkdown: true,
            includeHeadings: true,
            direction: 'desc'
        });
        
        console.log(`Found ${recentLogs.length} lifelogs`);
        
        if (recentLogs.length === 0) {
            console.log("❌ No lifelogs found.");
            return;
        }
        
        // Analyze with improved methodology
        console.log("\n🔬 Running improved statistical analysis...");
        const biomarkers = ImprovedSpeechBiomarkerAnalyzer.analyzeSpeechPatternsWithStats(recentLogs);
        
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
        
        console.log(`Pause Duration: ${biomarkers.pauseDuration.value.toFixed(2)} seconds [${biomarkers.pauseDuration.confidenceInterval[0].toFixed(2)}, ${biomarkers.pauseDuration.confidenceInterval[1].toFixed(2)}]`);
        console.log(`  Sample size: n=${biomarkers.pauseDuration.sampleSize}, SE=${biomarkers.pauseDuration.standardError.toFixed(3)}`);
        
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
        
        // Weekly Trends
        if (biomarkers.weeklyTrends.length > 1) {
            console.log("\n📅 WEEKLY TRENDS:");
            biomarkers.weeklyTrends.forEach(week => {
                console.log(`Week ${week.week}: ${week.speechRate.value.toFixed(1)} WPM [${week.speechRate.confidenceInterval[0].toFixed(1)}, ${week.speechRate.confidenceInterval[1].toFixed(1)}] (n=${week.segmentCount})`);
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
        } else if (biomarkers.reliability === "medium") {
            console.log("⚠️  Results are moderately reliable - collect more data for better precision");
        } else {
            console.log("❌ Results have low reliability - significantly more data needed");
        }
        
        // Effect size interpretation
        if (biomarkers.speechRateTrend.significance === "significant") {
            const effectSize = Math.abs(biomarkers.speechRateTrend.slope);
            if (effectSize > 5) {
                console.log("🔴 LARGE speech rate change detected - clinically significant");
            } else if (effectSize > 2) {
                console.log("🟡 MODERATE speech rate change detected");
            } else {
                console.log("🟢 SMALL speech rate change detected");
            }
        }
        
        // Comparison to norms
        console.log(`\n📊 COMPARISON TO POPULATION NORMS:`);
        if (biomarkers.percentileRankings.speechRate > 85) {
            console.log("🟢 Speech rate: Above average (faster than 85% of population)");
        } else if (biomarkers.percentileRankings.speechRate < 15) {
            console.log("🟡 Speech rate: Below average (slower than 85% of population)");
        } else {
            console.log("✅ Speech rate: Within normal range");
        }
        
        // Clinical context
        console.log("\n🏥 CLINICAL CONTEXT:");
        console.log("• Normal speech rate: 120-180 WPM");
        console.log("• Normal pause duration: 0.5-2.0 seconds");
        console.log("• Vocabulary complexity: Higher scores indicate more diverse language use");
        console.log("• Confidence intervals: Narrow intervals = more precise estimates");
        console.log("• p-values < 0.05: Statistically significant changes");
        
        console.log("\n" + "=".repeat(80));
        console.log(`Analysis completed: ${new Date(biomarkers.analysisDate).toLocaleString()}`);
        console.log(`Total analysis time: ${(biomarkers.totalAnalysisTime / 60000).toFixed(1)} minutes of speech`);
        
    } catch (error) {
        console.error("❌ Error during improved analysis:", error);
    }
}

// Run the improved test
testImprovedAnalysis();