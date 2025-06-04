#!/usr/bin/env node

import { getLifelogs } from "./src/limitless-client.js";
import { SpeechBiomarkerAnalyzer } from "./src/speech-biomarkers.js";

const API_KEY = "sk-9b033962-9a1a-45ea-a2c0-8287294f6d09";

async function testSpeechBiomarkers() {
    try {
        console.log("🧠 Testing Speech Biomarker Analysis with Real Limitless Data");
        console.log("=".repeat(70));
        
        // Get recent lifelogs (last few days)
        console.log("\n📊 Fetching recent lifelogs...");
        const recentLogs = await getLifelogs(API_KEY, {
            limit: 50,  // Get more data for better analysis
            includeMarkdown: true,
            includeHeadings: true,
            direction: 'desc'
        });
        
        console.log(`Found ${recentLogs.length} lifelogs`);
        
        if (recentLogs.length === 0) {
            console.log("❌ No lifelogs found. Make sure your Limitless Pendant is recording data.");
            return;
        }
        
        // Analyze speech patterns
        console.log("\n🔬 Analyzing speech biomarkers...");
        const biomarkers = SpeechBiomarkerAnalyzer.analyzeSpeechPatterns(recentLogs);
        
        // Display results
        console.log("\n" + "=".repeat(70));
        console.log("🎯 SPEECH BIOMARKER ANALYSIS RESULTS");
        console.log("=".repeat(70));
        
        // Core Speech Metrics
        console.log("\n📈 CORE SPEECH METRICS:");
        console.log(`Average Words Per Minute: ${biomarkers.averageWordsPerMinute.toFixed(1)} WPM`);
        console.log(`Median Words Per Minute: ${biomarkers.medianWordsPerMinute.toFixed(1)} WPM`);
        console.log(`Speech Rate Variability: ${biomarkers.speechRateVariability.toFixed(1)} (std dev)`);
        console.log(`Total Speaking Time: ${(biomarkers.totalSpeakingTime / 60000).toFixed(1)} minutes`);
        console.log(`Total Words Spoken: ${biomarkers.totalWords} words`);
        console.log(`Conversation Turns: ${biomarkers.conversationTurns}`);
        
        // Pause Analysis
        console.log("\n⏸️  PAUSE PATTERN ANALYSIS:");
        console.log(`Average Pause Duration: ${(biomarkers.averagePauseDuration / 1000).toFixed(1)} seconds`);
        console.log(`Pause Frequency: ${biomarkers.pauseFrequency.toFixed(1)} pauses per minute`);
        console.log(`Long Pauses (>2s): ${biomarkers.longPauseCount}`);
        console.log(`Pause Variability: ${(biomarkers.pauseVariability / 1000).toFixed(1)}s (std dev)`);
        
        // Cognitive Indicators
        console.log("\n🧠 COGNITIVE LOAD INDICATORS:");
        console.log(`Vocabulary Complexity: ${biomarkers.vocabularyComplexity.toFixed(1)} chars/word`);
        console.log(`Unique Word Ratio: ${(biomarkers.uniqueWordRatio * 100).toFixed(1)}%`);
        console.log(`Average Words Per Turn: ${biomarkers.averageWordsPerTurn.toFixed(1)} words`);
        
        // Health Scores
        console.log("\n🏥 HEALTH INDICATOR SCORES (0-100):");
        console.log(`Fatigue Score: ${biomarkers.fatigueScore.toFixed(0)}/100 ${getFatigueLevel(biomarkers.fatigueScore)}`);
        console.log(`Cognitive Load Score: ${biomarkers.cognitiveLoadScore.toFixed(0)}/100 ${getCognitiveLevel(biomarkers.cognitiveLoadScore)}`);
        console.log(`Stress Indicator: ${biomarkers.stressIndicator.toFixed(0)}/100 ${getStressLevel(biomarkers.stressIndicator)}`);
        
        // Temporal Patterns
        console.log("\n⏰ HOURLY SPEECH PATTERNS:");
        const activeHours = biomarkers.hourlyPatterns.filter(h => h.wordCount > 0);
        if (activeHours.length > 0) {
            activeHours.forEach(hour => {
                const timeStr = `${hour.hour.toString().padStart(2, '0')}:00`;
                console.log(`${timeStr}: ${hour.wpm.toFixed(1)} WPM (${hour.wordCount} words)`);
            });
        } else {
            console.log("No hourly data available");
        }
        
        // Generate Health Alerts
        console.log("\n🚨 HEALTH ALERTS:");
        const alerts = SpeechBiomarkerAnalyzer.generateHealthAlerts(biomarkers);
        if (alerts.length > 0) {
            alerts.forEach(alert => {
                const severityIcon = alert.severity === "high" ? "🔴" : 
                                   alert.severity === "medium" ? "🟡" : "🟢";
                console.log(`${severityIcon} [${alert.severity.toUpperCase()}] ${alert.message}`);
                console.log(`   Current: ${alert.currentValue.toFixed(1)}, Expected: ${alert.expectedRange[0]}-${alert.expectedRange[1]}`);
                console.log(`   💡 ${alert.recommendation}\n`);
            });
        } else {
            console.log("✅ No significant health alerts detected");
        }
        
        // Analysis Summary
        console.log("\n" + "=".repeat(70));
        console.log("📋 ANALYSIS SUMMARY:");
        console.log(`Analysis Date: ${new Date(biomarkers.analysisDate).toLocaleString()}`);
        console.log(`Total Recording Time: ${(biomarkers.totalRecordingTime / 60000).toFixed(1)} minutes`);
        console.log(`Speech Efficiency: ${((biomarkers.totalSpeakingTime / biomarkers.totalRecordingTime) * 100).toFixed(1)}%`);
        
        // Clinical Context
        console.log("\n🔬 CLINICAL CONTEXT:");
        console.log("Normal speech rate: 120-180 WPM");
        console.log("Optimal pause duration: 0.5-2.0 seconds");
        console.log("Healthy vocabulary complexity: 4-6 characters/word");
        console.log("Normal unique word ratio: 40-70%");
        
        // Sample segments for debugging
        if (biomarkers.segments.length > 0) {
            console.log("\n🔍 SAMPLE SPEECH SEGMENTS (first 3):");
            biomarkers.segments.slice(0, 3).forEach((segment, i) => {
                console.log(`${i + 1}. "${segment.content.substring(0, 50)}..." `);
                console.log(`   Duration: ${(segment.durationMs / 1000).toFixed(1)}s, WPM: ${segment.wordsPerMinute.toFixed(1)}`);
            });
        }
        
    } catch (error) {
        console.error("❌ Error during analysis:", error);
        if (error.message.includes("API key")) {
            console.log("🔑 Please check your Limitless API key");
        }
    }
}

function getFatigueLevel(score: number): string {
    if (score < 30) return "🟢 Normal";
    if (score < 60) return "🟡 Mild";
    if (score < 80) return "🟠 Moderate";
    return "🔴 High";
}

function getCognitiveLevel(score: number): string {
    if (score < 30) return "🟢 Low Load";
    if (score < 60) return "🟡 Moderate Load";
    if (score < 80) return "🟠 High Load";
    return "🔴 Very High";
}

function getStressLevel(score: number): string {
    if (score < 30) return "🟢 Relaxed";
    if (score < 60) return "🟡 Mild Stress";
    if (score < 80) return "🟠 Elevated Stress";
    return "🔴 High Stress";
}

// Run the test
testSpeechBiomarkers();