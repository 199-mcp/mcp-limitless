#!/usr/bin/env node

import { getLifelogs } from "./src/limitless-client.js";

const API_KEY = "sk-9b033962-9a1a-45ea-a2c0-8287294f6d09";

async function diagnosticAnalysis() {
    try {
        console.log("🔍 DIAGNOSTIC ANALYSIS OF LIMITLESS DATA STRUCTURE");
        console.log("=".repeat(80));
        
        // Get recent lifelogs
        const recentLogs = await getLifelogs(API_KEY, {
            limit: 10,
            includeMarkdown: true,
            includeHeadings: true,
            direction: 'desc'
        });
        
        console.log(`\n📊 Analyzing ${recentLogs.length} lifelogs...\n`);
        
        // Speaker Analysis
        const speakerStats = new Map<string, {
            count: number,
            totalWords: number,
            identifiers: Set<string>,
            sampleContent: string[]
        }>();
        
        let totalNodes = 0;
        let nodesWithSpeaker = 0;
        let nodesWithIdentifier = 0;
        let nodesWithContent = 0;
        let nodesWithTiming = 0;
        
        for (const lifelog of recentLogs) {
            console.log(`\n📄 Lifelog: ${lifelog.id}`);
            console.log(`   Title: ${lifelog.title || 'No title'}`);
            console.log(`   Time: ${lifelog.startTime} - ${lifelog.endTime}`);
            console.log(`   Nodes: ${lifelog.contents?.length || 0}`);
            
            if (lifelog.contents) {
                for (const node of lifelog.contents) {
                    totalNodes++;
                    
                    if (node.content) nodesWithContent++;
                    if (node.speakerName) nodesWithSpeaker++;
                    if (node.speakerIdentifier) nodesWithIdentifier++;
                    if (node.startOffsetMs !== undefined && node.endOffsetMs !== undefined) nodesWithTiming++;
                    
                    // Analyze speakers
                    const speakerKey = node.speakerName || '[Unknown Speaker]';
                    if (!speakerStats.has(speakerKey)) {
                        speakerStats.set(speakerKey, {
                            count: 0,
                            totalWords: 0,
                            identifiers: new Set(),
                            sampleContent: []
                        });
                    }
                    
                    const stats = speakerStats.get(speakerKey)!;
                    stats.count++;
                    
                    if (node.content) {
                        const wordCount = node.content.trim().split(/\s+/).filter(w => w.length > 0).length;
                        stats.totalWords += wordCount;
                        
                        if (stats.sampleContent.length < 3) {
                            stats.sampleContent.push(node.content.substring(0, 100) + "...");
                        }
                    }
                    
                    if (node.speakerIdentifier) {
                        stats.identifiers.add(node.speakerIdentifier);
                    }
                    
                    // Print first few nodes for inspection
                    if (totalNodes <= 5) {
                        console.log(`   Node ${totalNodes}:`);
                        console.log(`     Type: ${node.type}`);
                        console.log(`     Speaker: ${node.speakerName || 'null'}`);
                        console.log(`     Identifier: ${node.speakerIdentifier || 'null'}`);
                        console.log(`     Content: "${(node.content || '').substring(0, 50)}..."`);
                        console.log(`     Timing: ${node.startOffsetMs}ms - ${node.endOffsetMs}ms`);
                    }
                }
            }
        }
        
        // Summary Statistics
        console.log("\n🔢 DATA STRUCTURE SUMMARY:");
        console.log("=".repeat(40));
        console.log(`Total nodes analyzed: ${totalNodes}`);
        console.log(`Nodes with content: ${nodesWithContent} (${((nodesWithContent/totalNodes)*100).toFixed(1)}%)`);
        console.log(`Nodes with speaker name: ${nodesWithSpeaker} (${((nodesWithSpeaker/totalNodes)*100).toFixed(1)}%)`);
        console.log(`Nodes with speaker identifier: ${nodesWithIdentifier} (${((nodesWithIdentifier/totalNodes)*100).toFixed(1)}%)`);
        console.log(`Nodes with timing data: ${nodesWithTiming} (${((nodesWithTiming/totalNodes)*100).toFixed(1)}%)`);
        
        // Speaker Breakdown
        console.log("\n👥 SPEAKER ANALYSIS:");
        console.log("=".repeat(40));
        
        const sortedSpeakers = Array.from(speakerStats.entries()).sort((a, b) => b[1].totalWords - a[1].totalWords);
        
        for (const [speaker, stats] of sortedSpeakers) {
            console.log(`\n🎤 Speaker: ${speaker}`);
            console.log(`   Segments: ${stats.count}`);
            console.log(`   Total words: ${stats.totalWords}`);
            console.log(`   Avg words/segment: ${(stats.totalWords / stats.count).toFixed(1)}`);
            console.log(`   Identifiers: ${Array.from(stats.identifiers).join(', ') || 'none'}`);
            console.log(`   Sample content:`);
            stats.sampleContent.forEach((content, i) => {
                console.log(`     ${i+1}. "${content}"`);
            });
        }
        
        // Data Quality Issues
        console.log("\n⚠️  POTENTIAL DATA QUALITY ISSUES:");
        console.log("=".repeat(40));
        
        const issues: string[] = [];
        
        if (nodesWithSpeaker / totalNodes < 0.5) {
            issues.push(`Low speaker identification rate: ${((nodesWithSpeaker/totalNodes)*100).toFixed(1)}%`);
        }
        
        if (nodesWithIdentifier / totalNodes < 0.3) {
            issues.push(`Low speaker identifier rate: ${((nodesWithIdentifier/totalNodes)*100).toFixed(1)}%`);
        }
        
        if (nodesWithTiming / totalNodes < 0.8) {
            issues.push(`Missing timing data: ${((nodesWithTiming/totalNodes)*100).toFixed(1)}% have timing`);
        }
        
        if (speakerStats.size > 10) {
            issues.push(`High number of speakers (${speakerStats.size}) - may indicate noise or misidentification`);
        }
        
        const userSpeaker = Array.from(speakerStats.entries()).find(([_, stats]) => 
            stats.identifiers.has('user')
        );
        
        if (!userSpeaker) {
            issues.push(`No speaker identified with 'user' identifier - filtering may fail`);
        } else {
            const userPercentage = (userSpeaker[1].totalWords / Array.from(speakerStats.values()).reduce((sum, s) => sum + s.totalWords, 0)) * 100;
            console.log(`\n✅ User speaker found: ${userSpeaker[0]}`);
            console.log(`   User speech percentage: ${userPercentage.toFixed(1)}%`);
            
            if (userPercentage < 20) {
                issues.push(`User speech percentage is low (${userPercentage.toFixed(1)}%) - may indicate data collection issues`);
            }
        }
        
        if (issues.length > 0) {
            issues.forEach((issue, i) => {
                console.log(`${i+1}. ${issue}`);
            });
        } else {
            console.log("✅ No major data quality issues detected");
        }
        
        // Statistical Analysis Recommendations
        console.log("\n📊 STATISTICAL ANALYSIS REQUIREMENTS:");
        console.log("=".repeat(40));
        
        const userWordCount = userSpeaker ? userSpeaker[1].totalWords : 0;
        const userSegmentCount = userSpeaker ? userSpeaker[1].count : 0;
        
        console.log(`Current sample size: ${userSegmentCount} segments, ${userWordCount} words`);
        
        // Sample size recommendations based on speech research
        const minSegmentsForReliability = 100;  // Based on speech variability research
        const minWordsForComplexity = 500;      // Based on lexical diversity research
        const minDaysForTemporal = 7;           // Based on circadian pattern research
        
        console.log(`\nRecommended minimums for reliable analysis:`);
        console.log(`- Speech rate: ${minSegmentsForReliability} segments (current: ${userSegmentCount})`);
        console.log(`- Vocabulary: ${minWordsForComplexity} words (current: ${userWordCount})`);
        console.log(`- Temporal patterns: ${minDaysForTemporal} days of data`);
        
        if (userSegmentCount < minSegmentsForReliability) {
            console.log(`⚠️  Sample size too small for reliable speech rate analysis`);
        }
        
        if (userWordCount < minWordsForComplexity) {
            console.log(`⚠️  Insufficient words for vocabulary complexity analysis`);
        }
        
    } catch (error) {
        console.error("❌ Error during diagnostic analysis:", error);
    }
}

// Run the diagnostic
diagnosticAnalysis();