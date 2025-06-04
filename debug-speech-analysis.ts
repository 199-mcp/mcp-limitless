#!/usr/bin/env node

import { getLifelogs } from "./src/limitless-client.js";

const API_KEY = "sk-9b033962-9a1a-45ea-a2c0-8287294f6d09";

async function debugSpeechAnalysis() {
    try {
        console.log("🔍 DEBUGGING WHAT WAS ACTUALLY ANALYZED");
        console.log("=".repeat(80));
        
        // Get the same data as the original test
        const recentLogs = await getLifelogs(API_KEY, {
            limit: 50,
            includeMarkdown: true,
            includeHeadings: true,
            direction: 'desc'
        });
        
        console.log(`Found ${recentLogs.length} lifelogs`);
        
        // Replicate the exact filtering logic from speech-biomarkers.ts
        let totalSegments = 0;
        let filteredSegments = 0;
        let userSegments = 0;
        
        const speakerBreakdown = new Map<string, number>();
        const identifierBreakdown = new Map<string, number>();
        
        for (const lifelog of recentLogs) {
            if (!lifelog.contents) continue;
            
            for (const node of lifelog.contents) {
                totalSegments++;
                
                // Track all speakers
                const speaker = node.speakerName || '[null]';
                speakerBreakdown.set(speaker, (speakerBreakdown.get(speaker) || 0) + 1);
                
                // Track all identifiers
                const identifier = node.speakerIdentifier || '[null]';
                identifierBreakdown.set(identifier, (identifierBreakdown.get(identifier) || 0) + 1);
                
                // Apply the EXACT same filter as speech-biomarkers.ts
                if (node.speakerIdentifier === "user" && 
                    node.content && 
                    node.startOffsetMs !== undefined && 
                    node.endOffsetMs !== undefined) {
                    
                    userSegments++;
                    
                    if (filteredSegments < 5) {
                        console.log(`\nUser segment ${filteredSegments + 1}:`);
                        console.log(`  Speaker: ${node.speakerName}`);
                        console.log(`  Identifier: ${node.speakerIdentifier}`);
                        console.log(`  Content: "${node.content.substring(0, 100)}..."`);
                        console.log(`  Timing: ${node.startOffsetMs}ms - ${node.endOffsetMs}ms`);
                    }
                    
                    filteredSegments++;
                }
            }
        }
        
        console.log(`\n📊 FILTERING RESULTS:`);
        console.log(`Total content nodes: ${totalSegments}`);
        console.log(`Nodes with speakerIdentifier === "user": ${userSegments}`);
        console.log(`Nodes passing all filters: ${filteredSegments}`);
        
        console.log(`\n👥 SPEAKER BREAKDOWN:`);
        Array.from(speakerBreakdown.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([speaker, count]) => {
                console.log(`  ${speaker}: ${count} segments`);
            });
        
        console.log(`\n🏷️  IDENTIFIER BREAKDOWN:`);
        Array.from(identifierBreakdown.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([identifier, count]) => {
                console.log(`  ${identifier}: ${count} segments`);
            });
            
        // Now let's see what the original test ACTUALLY analyzed
        // Maybe it was using a different filtering method or there's cached data?
        
        console.log(`\n❓ MYSTERY: Original test claimed 126 segments, but filter shows ${filteredSegments}`);
        
        if (filteredSegments === 0) {
            console.log(`\n⚠️  CRITICAL FINDING: The speech biomarker test analyzed ZERO user segments!`);
            console.log(`This means the "results" were either:`);
            console.log(`1. Completely fabricated (empty data structure)`);
            console.log(`2. Analyzing data from a different source`);
            console.log(`3. Using a different filtering logic`);
            console.log(`4. Operating on cached/stale data`);
        }
        
    } catch (error) {
        console.error("❌ Error during debug analysis:", error);
    }
}

// Run the debug
debugSpeechAnalysis();