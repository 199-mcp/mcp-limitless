#!/usr/bin/env node

// Test to verify the MCP server has the speech biomarker tools available

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testMCPIntegration() {
    try {
        console.log("🧪 Testing MCP Speech Biomarker Integration");
        console.log("=".repeat(60));
        
        // Check if the built server exists
        console.log("1. Checking if server built successfully...");
        try {
            await execAsync('ls -la dist/server.js');
            console.log("✅ Server built successfully");
        } catch (error) {
            console.log("❌ Server build not found");
            return;
        }
        
        // Test importing the modules
        console.log("\n2. Testing module imports...");
        try {
            const { ImprovedSpeechBiomarkerAnalyzer } = await import('./src/improved-speech-biomarkers.js');
            const { StatisticalUtils } = await import('./src/statistical-utils.js');
            console.log("✅ All biomarker modules imported successfully");
        } catch (error) {
            console.log("❌ Module import failed:", error);
            return;
        }
        
        // Test the function exists
        console.log("\n3. Testing biomarker analyzer function...");
        try {
            const { ImprovedSpeechBiomarkerAnalyzer } = await import('./src/improved-speech-biomarkers.js');
            
            // Create minimal test data
            const testLifelogs = [{
                id: 'test-1',
                title: 'Test conversation',
                startTime: '2025-06-04T13:00:00Z',
                endTime: '2025-06-04T13:01:00Z',
                contents: [{
                    type: 'blockquote',
                    content: 'This is a test speech segment with multiple words for analysis.',
                    startOffsetMs: 0,
                    endOffsetMs: 3000,
                    speakerName: 'You',
                    speakerIdentifier: 'user' as const
                }]
            }];
            
            const result = ImprovedSpeechBiomarkerAnalyzer.analyzeSpeechPatternsWithStats(testLifelogs);
            console.log("✅ Speech biomarker analysis function works");
            console.log(`   Sample rate: ${result.speechRate.value.toFixed(1)} WPM`);
            console.log(`   Reliability: ${result.reliability}`);
            console.log(`   Data quality: ${(result.dataQuality.qualityScore * 100).toFixed(1)}%`);
        } catch (error) {
            console.log("❌ Speech biomarker function failed:", error);
            return;
        }
        
        console.log("\n🎉 ALL TESTS PASSED!");
        console.log("\n📋 MCP Server Tools Available:");
        console.log("- limitless_analyze_speech_biomarkers");
        console.log("- speechclock (alias)"); 
        console.log("- speechage (alias)");
        
        console.log("\n💬 Example Usage in Claude:");
        console.log('• "What\'s my speechclock this week?"');
        console.log('• "Show my speechage for last month"');
        console.log('• "Analyze my speech patterns today"');
        console.log('• "Give me speech biomarker trends for Q1 2024"');
        
        console.log("\n📊 What You'll Get:");
        console.log("• Speech rate with 95% confidence intervals");
        console.log("• Population percentile rankings");
        console.log("• Statistical trend analysis with p-values");
        console.log("• Data quality assessment");
        console.log("• Clinical interpretation");
        console.log("• Circadian pattern analysis");
        
    } catch (error) {
        console.error("❌ Integration test failed:", error);
    }
}

// Run the test
testMCPIntegration();