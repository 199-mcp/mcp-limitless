import { Lifelog } from './limitless-client.js';
import { ImprovedSpeechSegment } from './improved-speech-biomarkers.js';
import { StatisticalUtils } from './statistical-utils.js';

export interface EnvironmentalActivityMetrics {
    // Daily activity patterns
    dailyPatterns: {
        speakingHours: number;                     // Total hours spent speaking
        listeningHours: number;                    // Total hours in conversations (not speaking)
        silentHours: number;                       // Hours with no conversation detected
        recordingHours: number;                    // Total hours recorded
        coveragePercentage: number;                // % of day covered by recording
    };
    
    // Speaking vs listening analysis
    conversationDynamics: {
        speakingRatio: number;                     // Your speaking time / total conversation time
        averageTurnLength: number;                 // Seconds per speaking turn
        conversationalDominance: 'dominant' | 'balanced' | 'listener' | 'minimal';
        interactionIntensity: number;              // Conversations per hour
    };
    
    // Hourly activity breakdown
    hourlyActivity: Array<{
        hour: number;                              // 0-23
        speakingMinutes: number;                   // Minutes you spoke
        conversationMinutes: number;               // Minutes in any conversation
        silenceMinutes: number;                    // Minutes of silence
        activityLevel: 'high' | 'medium' | 'low' | 'silent';
        dominanceRatio: number;                    // Your speaking / total speaking this hour
    }>;
    
    // Environmental sound patterns
    environmentalPatterns: {
        quietPeriods: Array<{start: string; end: string; duration: number}>;
        activePeriods: Array<{start: string; end: string; intensity: number}>;
        longestSilence: { start: string; duration: number };
        busiestHour: { hour: number; interactions: number };
        quietestHour: { hour: number; interactions: number };
    };
    
    // Sleep detection
    sleepAnalysis: {
        probableSleepPeriods: Array<{
            start: string;
            end: string;
            confidence: number;                    // 0-1 confidence this is sleep
            duration: number;                      // Hours
        }>;
        estimatedSleepHours: number;
        sleepConsistency: number;                  // 0-1, how regular
        typicalBedtime: string | null;
        typicalWakeTime: string | null;
    };
    
    // Social patterns
    socialPatterns: {
        peakSocialHours: number[];                 // Hours with most interaction
        isolationPeriods: number;                  // Count of 2+ hour silent periods
        socialIntensityScore: number;              // 0-100, overall social activity
        conversationClusters: Array<{
            start: string;
            end: string;
            intensity: number;
            participants: number;
        }>;
    };
    
    // Activity classification
    dailyActivityProfile: {
        morningActivity: 'high' | 'medium' | 'low';
        afternoonActivity: 'high' | 'medium' | 'low';
        eveningActivity: 'high' | 'medium' | 'low';
        nightActivity: 'minimal' | 'some' | 'significant';
        consistencyScore: number;                  // 0-1, how consistent across days
    };
    
    // Insights and recommendations
    insights: {
        primaryPattern: string;                    // Main behavioral pattern
        unusualPatterns: string[];                 // Deviations from norm
        recommendations: string[];                 // Based on patterns
    };
}

export interface ActivitySegment {
    timestamp: Date;
    type: 'speaking' | 'listening' | 'silent';
    duration: number;                              // milliseconds
    intensity: number;                             // 0-1, conversation density
    speakerCount: number;                          // Number of speakers detected
}

export class EnvironmentalActivityAnalyzer {
    
    /**
     * Analyze environmental and activity patterns from lifelogs
     */
    static analyzeActivityPatterns(lifelogs: Lifelog[]): EnvironmentalActivityMetrics {
        // Analyzing environmental activity patterns
        
        if (lifelogs.length === 0) {
            return this.createEmptyMetrics();
        }
        
        // Extract all segments with speaker information
        const allSegments = this.extractAllSegments(lifelogs);
        
        // Create activity timeline
        const activityTimeline = this.createActivityTimeline(lifelogs, allSegments);
        
        // Calculate daily patterns
        const dailyPatterns = this.calculateDailyPatterns(activityTimeline, lifelogs);
        
        // Analyze conversation dynamics
        const conversationDynamics = this.analyzeConversationDynamics(allSegments);
        
        // Calculate hourly activity
        const hourlyActivity = this.calculateHourlyActivity(activityTimeline);
        
        // Detect environmental patterns
        const environmentalPatterns = this.detectEnvironmentalPatterns(activityTimeline);
        
        // Analyze sleep patterns
        const sleepAnalysis = this.analyzeSleepPatterns(activityTimeline, hourlyActivity);
        
        // Identify social patterns
        const socialPatterns = this.identifySocialPatterns(activityTimeline, allSegments);
        
        // Create daily activity profile
        const dailyActivityProfile = this.createDailyActivityProfile(hourlyActivity);
        
        // Generate insights
        const insights = this.generateInsights(
            dailyPatterns,
            conversationDynamics,
            sleepAnalysis,
            socialPatterns
        );
        
        return {
            dailyPatterns,
            conversationDynamics,
            hourlyActivity,
            environmentalPatterns,
            sleepAnalysis,
            socialPatterns,
            dailyActivityProfile,
            insights
        };
    }
    
    /**
     * Extract all segments including speaker identification
     */
    private static extractAllSegments(lifelogs: Lifelog[]): Array<{
        segment: any;
        timestamp: Date;
        isUser: boolean;
        lifelog: Lifelog;
    }> {
        const segments: any[] = [];
        
        lifelogs.forEach(lifelog => {
            if (!lifelog.contents) return;
            
            const startTime = new Date(lifelog.startTime);
            
            lifelog.contents.forEach(node => {
                if (node.content && node.startOffsetMs !== undefined) {
                    const timestamp = new Date(startTime.getTime() + node.startOffsetMs);
                    segments.push({
                        segment: node,
                        timestamp,
                        isUser: node.speakerIdentifier === 'user' || node.speakerName === 'You',
                        lifelog
                    });
                }
            });
        });
        
        return segments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    
    /**
     * Create activity timeline from segments
     */
    private static createActivityTimeline(
        lifelogs: Lifelog[],
        segments: any[]
    ): ActivitySegment[] {
        const timeline: ActivitySegment[] = [];
        
        // Group segments by time windows (1-minute resolution)
        const minuteWindows = new Map<number, any[]>();
        
        segments.forEach(seg => {
            const minuteKey = Math.floor(seg.timestamp.getTime() / 60000) * 60000;
            if (!minuteWindows.has(minuteKey)) {
                minuteWindows.set(minuteKey, []);
            }
            minuteWindows.get(minuteKey)!.push(seg);
        });
        
        // Create activity segments for each minute
        minuteWindows.forEach((segs, timestamp) => {
            const userSegments = segs.filter(s => s.isUser).length;
            const otherSegments = segs.filter(s => !s.isUser).length;
            const totalSegments = segs.length;
            
            let type: 'speaking' | 'listening' | 'silent';
            let intensity = 0;
            
            if (userSegments > 0) {
                type = 'speaking';
                intensity = Math.min(userSegments / 10, 1); // Normalize to 0-1
            } else if (otherSegments > 0) {
                type = 'listening';
                intensity = Math.min(otherSegments / 10, 1);
            } else {
                type = 'silent';
                intensity = 0;
            }
            
            // Count unique speakers
            const uniqueSpeakers = new Set(segs.map(s => s.segment.speakerName)).size;
            
            timeline.push({
                timestamp: new Date(timestamp),
                type,
                duration: 60000, // 1 minute
                intensity,
                speakerCount: uniqueSpeakers
            });
        });
        
        // Fill in gaps with silence (for recorded but quiet periods)
        const filledTimeline = this.fillTimelineGaps(timeline, lifelogs);
        
        return filledTimeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    
    /**
     * Fill gaps in timeline with silence for recorded periods
     */
    private static fillTimelineGaps(
        timeline: ActivitySegment[],
        lifelogs: Lifelog[]
    ): ActivitySegment[] {
        const filled: ActivitySegment[] = [];
        
        lifelogs.forEach(lifelog => {
            const startTime = new Date(lifelog.startTime).getTime();
            const endTime = new Date(lifelog.endTime).getTime();
            
            // Create minute-by-minute coverage
            for (let time = startTime; time < endTime; time += 60000) {
                const existing = timeline.find(seg => 
                    Math.abs(seg.timestamp.getTime() - time) < 60000
                );
                
                if (existing) {
                    filled.push(existing);
                } else {
                    // Fill with silence
                    filled.push({
                        timestamp: new Date(time),
                        type: 'silent',
                        duration: 60000,
                        intensity: 0,
                        speakerCount: 0
                    });
                }
            }
        });
        
        return filled;
    }
    
    /**
     * Calculate daily activity patterns
     */
    private static calculateDailyPatterns(
        timeline: ActivitySegment[],
        lifelogs: Lifelog[]
    ): EnvironmentalActivityMetrics['dailyPatterns'] {
        
        const speakingMinutes = timeline.filter(seg => seg.type === 'speaking').length;
        const listeningMinutes = timeline.filter(seg => seg.type === 'listening').length;
        const silentMinutes = timeline.filter(seg => seg.type === 'silent').length;
        const totalMinutes = timeline.length;
        
        // Calculate total recording hours
        let recordingMs = 0;
        lifelogs.forEach(log => {
            const start = new Date(log.startTime).getTime();
            const end = new Date(log.endTime).getTime();
            recordingMs += (end - start);
        });
        
        const recordingHours = recordingMs / (1000 * 60 * 60);
        
        // Calculate coverage (assuming analysis over unique days)
        const uniqueDays = new Set(lifelogs.map(log => 
            new Date(log.startTime).toDateString()
        )).size;
        const coveragePercentage = (recordingHours / (uniqueDays * 24)) * 100;
        
        return {
            speakingHours: speakingMinutes / 60,
            listeningHours: listeningMinutes / 60,
            silentHours: silentMinutes / 60,
            recordingHours,
            coveragePercentage
        };
    }
    
    /**
     * Analyze conversation dynamics
     */
    private static analyzeConversationDynamics(
        segments: any[]
    ): EnvironmentalActivityMetrics['conversationDynamics'] {
        
        const userSegments = segments.filter(s => s.isUser);
        const allSegments = segments.length;
        
        if (allSegments === 0) {
            return {
                speakingRatio: 0,
                averageTurnLength: 0,
                conversationalDominance: 'minimal',
                interactionIntensity: 0
            };
        }
        
        // Calculate speaking ratio
        const speakingRatio = userSegments.length / allSegments;
        
        // Calculate average turn length
        let totalTurnDuration = 0;
        userSegments.forEach(seg => {
            if (seg.segment.endOffsetMs && seg.segment.startOffsetMs) {
                totalTurnDuration += seg.segment.endOffsetMs - seg.segment.startOffsetMs;
            }
        });
        const averageTurnLength = userSegments.length > 0 ? 
            (totalTurnDuration / userSegments.length) / 1000 : 0; // Convert to seconds
        
        // Determine conversational dominance
        let conversationalDominance: 'dominant' | 'balanced' | 'listener' | 'minimal';
        if (speakingRatio > 0.6) {
            conversationalDominance = 'dominant';
        } else if (speakingRatio > 0.4) {
            conversationalDominance = 'balanced';
        } else if (speakingRatio > 0.1) {
            conversationalDominance = 'listener';
        } else {
            conversationalDominance = 'minimal';
        }
        
        // Calculate interaction intensity (conversations per hour)
        const timeSpanHours = this.calculateTimeSpan(segments) / (1000 * 60 * 60);
        const interactionIntensity = timeSpanHours > 0 ? allSegments / timeSpanHours : 0;
        
        return {
            speakingRatio,
            averageTurnLength,
            conversationalDominance,
            interactionIntensity
        };
    }
    
    /**
     * Calculate hourly activity breakdown
     */
    private static calculateHourlyActivity(
        timeline: ActivitySegment[]
    ): EnvironmentalActivityMetrics['hourlyActivity'] {
        
        const hourlyData: any[] = [];
        
        // Initialize all hours
        for (let hour = 0; hour < 24; hour++) {
            hourlyData[hour] = {
                hour,
                speakingMinutes: 0,
                conversationMinutes: 0,
                silenceMinutes: 0,
                activityLevel: 'silent' as any,
                dominanceRatio: 0,
                totalSpeaking: 0,
                userSpeaking: 0
            };
        }
        
        // Aggregate by hour
        timeline.forEach(seg => {
            const hour = seg.timestamp.getHours();
            
            if (seg.type === 'speaking') {
                hourlyData[hour].speakingMinutes++;
                hourlyData[hour].conversationMinutes++;
                hourlyData[hour].userSpeaking++;
            } else if (seg.type === 'listening') {
                hourlyData[hour].conversationMinutes++;
            } else {
                hourlyData[hour].silenceMinutes++;
            }
            
            if (seg.type !== 'silent') {
                hourlyData[hour].totalSpeaking++;
            }
        });
        
        // Calculate activity levels and dominance
        return hourlyData.map(hour => {
            const totalMinutes = hour.speakingMinutes + hour.conversationMinutes + hour.silenceMinutes;
            
            // Determine activity level
            let activityLevel: 'high' | 'medium' | 'low' | 'silent';
            if (hour.conversationMinutes > 30) {
                activityLevel = 'high';
            } else if (hour.conversationMinutes > 10) {
                activityLevel = 'medium';
            } else if (hour.conversationMinutes > 0) {
                activityLevel = 'low';
            } else {
                activityLevel = 'silent';
            }
            
            // Calculate dominance ratio
            const dominanceRatio = hour.totalSpeaking > 0 ? 
                hour.userSpeaking / hour.totalSpeaking : 0;
            
            return {
                hour: hour.hour,
                speakingMinutes: hour.speakingMinutes,
                conversationMinutes: hour.conversationMinutes,
                silenceMinutes: hour.silenceMinutes,
                activityLevel,
                dominanceRatio
            };
        });
    }
    
    /**
     * Detect environmental patterns
     */
    private static detectEnvironmentalPatterns(
        timeline: ActivitySegment[]
    ): EnvironmentalActivityMetrics['environmentalPatterns'] {
        
        const quietPeriods: any[] = [];
        const activePeriods: any[] = [];
        
        // Detect continuous quiet/active periods
        let currentPeriod: any = null;
        
        timeline.forEach((seg, idx) => {
            if (seg.type === 'silent') {
                if (!currentPeriod || currentPeriod.type !== 'quiet') {
                    if (currentPeriod && currentPeriod.type === 'active') {
                        activePeriods.push(currentPeriod);
                    }
                    currentPeriod = {
                        type: 'quiet',
                        start: seg.timestamp,
                        end: seg.timestamp,
                        duration: 0
                    };
                }
                currentPeriod.end = seg.timestamp;
            } else {
                if (!currentPeriod || currentPeriod.type !== 'active') {
                    if (currentPeriod && currentPeriod.type === 'quiet') {
                        quietPeriods.push(currentPeriod);
                    }
                    currentPeriod = {
                        type: 'active',
                        start: seg.timestamp,
                        end: seg.timestamp,
                        intensity: 0,
                        count: 0
                    };
                }
                currentPeriod.end = seg.timestamp;
                currentPeriod.intensity += seg.intensity;
                currentPeriod.count++;
            }
        });
        
        // Finalize last period
        if (currentPeriod) {
            if (currentPeriod.type === 'quiet') {
                quietPeriods.push(currentPeriod);
            } else {
                activePeriods.push(currentPeriod);
            }
        }
        
        // Process periods
        const processedQuiet = quietPeriods.map(p => ({
            start: p.start.toISOString(),
            end: p.end.toISOString(),
            duration: (p.end.getTime() - p.start.getTime()) / (1000 * 60) // minutes
        })).filter(p => p.duration > 30); // Only periods > 30 minutes
        
        const processedActive = activePeriods.map(p => ({
            start: p.start.toISOString(),
            end: p.end.toISOString(),
            intensity: p.intensity / p.count
        }));
        
        // Find longest silence
        const longestSilence = processedQuiet.reduce((max, period) => 
            period.duration > max.duration ? period : max,
            { start: '', end: '', duration: 0 }
        );
        
        // Find busiest/quietest hours
        const hourlyActivity = this.calculateHourlyActivity(timeline);
        const busiestHour = hourlyActivity.reduce((max, hour) => 
            hour.conversationMinutes > max.interactions ? 
            { hour: hour.hour, interactions: hour.conversationMinutes } : max,
            { hour: 0, interactions: 0 }
        );
        
        const quietestHour = hourlyActivity.reduce((min, hour) => 
            hour.conversationMinutes < min.interactions ? 
            { hour: hour.hour, interactions: hour.conversationMinutes } : min,
            { hour: 0, interactions: Infinity }
        );
        
        return {
            quietPeriods: processedQuiet,
            activePeriods: processedActive,
            longestSilence: {
                start: longestSilence.start,
                duration: longestSilence.duration / 60 // Convert to hours
            },
            busiestHour,
            quietestHour: quietestHour.interactions === Infinity ? 
                { hour: 0, interactions: 0 } : quietestHour
        };
    }
    
    /**
     * Analyze sleep patterns from activity data
     */
    private static analyzeSleepPatterns(
        timeline: ActivitySegment[],
        hourlyActivity: any[]
    ): EnvironmentalActivityMetrics['sleepAnalysis'] {
        
        const sleepPeriods: any[] = [];
        
        // Look for extended quiet periods during typical sleep hours (10pm - 8am)
        const quietPeriods = this.detectEnvironmentalPatterns(timeline).quietPeriods;
        
        quietPeriods.forEach(period => {
            const startHour = new Date(period.start).getHours();
            const endHour = new Date(period.end).getHours();
            const duration = period.duration / 60; // hours
            
            // High confidence if:
            // - Period is > 4 hours
            // - Occurs during typical sleep hours
            // - Minimal activity before/after
            let confidence = 0;
            
            if (duration > 4) confidence += 0.3;
            if (duration > 6) confidence += 0.2;
            
            // Check if it spans typical sleep hours
            const typicalSleepHours = [22, 23, 0, 1, 2, 3, 4, 5, 6, 7];
            const spansTypicalHours = typicalSleepHours.includes(startHour) || 
                                     typicalSleepHours.includes(endHour);
            if (spansTypicalHours) confidence += 0.3;
            
            // Check activity levels around the period
            const hourBefore = (startHour - 1 + 24) % 24;
            const hourAfter = (endHour + 1) % 24;
            
            if (hourlyActivity[hourBefore].activityLevel === 'low' || 
                hourlyActivity[hourBefore].activityLevel === 'silent') {
                confidence += 0.1;
            }
            
            if (hourlyActivity[hourAfter].activityLevel === 'low' || 
                hourlyActivity[hourAfter].activityLevel === 'silent') {
                confidence += 0.1;
            }
            
            if (confidence > 0.5) {
                sleepPeriods.push({
                    start: period.start,
                    end: period.end,
                    confidence: Math.min(confidence, 1),
                    duration
                });
            }
        });
        
        // Calculate total estimated sleep
        const estimatedSleepHours = sleepPeriods.reduce((sum, period) => 
            sum + period.duration, 0
        );
        
        // Determine typical bed/wake times
        let typicalBedtime = null;
        let typicalWakeTime = null;
        
        if (sleepPeriods.length > 0) {
            const bedtimes = sleepPeriods.map(p => new Date(p.start).getHours());
            const waketimes = sleepPeriods.map(p => new Date(p.end).getHours());
            
            // Simple average (could be improved with circular statistics)
            typicalBedtime = Math.round(bedtimes.reduce((a, b) => a + b) / bedtimes.length) + ':00';
            typicalWakeTime = Math.round(waketimes.reduce((a, b) => a + b) / waketimes.length) + ':00';
        }
        
        // Calculate sleep consistency (variance in sleep times)
        const sleepConsistency = this.calculateSleepConsistency(sleepPeriods);
        
        return {
            probableSleepPeriods: sleepPeriods,
            estimatedSleepHours,
            sleepConsistency,
            typicalBedtime,
            typicalWakeTime
        };
    }
    
    /**
     * Identify social patterns
     */
    private static identifySocialPatterns(
        timeline: ActivitySegment[],
        segments: any[]
    ): EnvironmentalActivityMetrics['socialPatterns'] {
        
        // Find peak social hours
        const hourlyActivity = this.calculateHourlyActivity(timeline);
        const peakSocialHours = hourlyActivity
            .filter(h => h.conversationMinutes > 20)
            .map(h => h.hour)
            .sort((a, b) => 
                hourlyActivity[b].conversationMinutes - hourlyActivity[a].conversationMinutes
            )
            .slice(0, 3);
        
        // Count isolation periods (2+ hours of silence)
        let isolationPeriods = 0;
        let currentSilence = 0;
        
        timeline.forEach(seg => {
            if (seg.type === 'silent') {
                currentSilence++;
                if (currentSilence === 120) { // 2 hours
                    isolationPeriods++;
                }
            } else {
                currentSilence = 0;
            }
        });
        
        // Calculate social intensity score
        const totalMinutes = timeline.length;
        const socialMinutes = timeline.filter(s => s.type !== 'silent').length;
        const socialIntensityScore = Math.round((socialMinutes / totalMinutes) * 100);
        
        // Identify conversation clusters
        const conversationClusters = this.identifyConversationClusters(segments);
        
        return {
            peakSocialHours,
            isolationPeriods,
            socialIntensityScore,
            conversationClusters
        };
    }
    
    /**
     * Create daily activity profile
     */
    private static createDailyActivityProfile(
        hourlyActivity: any[]
    ): EnvironmentalActivityMetrics['dailyActivityProfile'] {
        
        // Morning (6-12), Afternoon (12-18), Evening (18-24), Night (0-6)
        const morning = hourlyActivity.slice(6, 12);
        const afternoon = hourlyActivity.slice(12, 18);
        const evening = hourlyActivity.slice(18, 24);
        const night = [...hourlyActivity.slice(0, 6)];
        
        const categorizeActivity = (hours: any[]): 'high' | 'medium' | 'low' => {
            const avgMinutes = hours.reduce((sum, h) => sum + h.conversationMinutes, 0) / hours.length;
            if (avgMinutes > 20) return 'high';
            if (avgMinutes > 5) return 'medium';
            return 'low';
        };
        
        const categorizeNight = (hours: any[]): 'minimal' | 'some' | 'significant' => {
            const totalMinutes = hours.reduce((sum, h) => sum + h.conversationMinutes, 0);
            if (totalMinutes < 10) return 'minimal';
            if (totalMinutes < 60) return 'some';
            return 'significant';
        };
        
        // Calculate consistency (low variance = high consistency)
        const allActivities = hourlyActivity.map(h => h.conversationMinutes);
        const variance = StatisticalUtils.standardDeviation(allActivities);
        const consistencyScore = Math.max(0, 1 - (variance / 30)); // Normalize
        
        return {
            morningActivity: categorizeActivity(morning),
            afternoonActivity: categorizeActivity(afternoon),
            eveningActivity: categorizeActivity(evening),
            nightActivity: categorizeNight(night),
            consistencyScore
        };
    }
    
    /**
     * Generate insights and recommendations
     */
    private static generateInsights(
        dailyPatterns: any,
        conversationDynamics: any,
        sleepAnalysis: any,
        socialPatterns: any
    ): EnvironmentalActivityMetrics['insights'] {
        
        const insights = {
            primaryPattern: '',
            unusualPatterns: [] as string[],
            recommendations: [] as string[]
        };
        
        // Determine primary pattern
        if (dailyPatterns.speakingHours > 6) {
            insights.primaryPattern = 'Highly verbal - you spend significant time in conversation';
        } else if (conversationDynamics.conversationalDominance === 'listener') {
            insights.primaryPattern = 'Active listener - you engage but speak less than others';
        } else if (socialPatterns.isolationPeriods > 3) {
            insights.primaryPattern = 'Intermittent social - alternating between interaction and solitude';
        } else {
            insights.primaryPattern = 'Balanced communicator - moderate speaking and listening';
        }
        
        // Identify unusual patterns
        if (dailyPatterns.coveragePercentage > 80) {
            insights.unusualPatterns.push('Extended recording periods detected (>80% of day)');
        }
        
        if (sleepAnalysis.estimatedSleepHours < 6) {
            insights.unusualPatterns.push('Low estimated sleep hours');
        }
        
        if (socialPatterns.socialIntensityScore > 70) {
            insights.unusualPatterns.push('Very high social interaction levels');
        }
        
        if (conversationDynamics.averageTurnLength > 30) {
            insights.unusualPatterns.push('Long speaking turns - possible monologuing');
        }
        
        // Generate recommendations
        if (socialPatterns.isolationPeriods > 5) {
            insights.recommendations.push('Consider scheduling regular social check-ins to reduce isolation periods');
        }
        
        if (conversationDynamics.conversationalDominance === 'dominant') {
            insights.recommendations.push('Practice active listening - aim for more balanced conversations');
        }
        
        if (sleepAnalysis.sleepConsistency < 0.5) {
            insights.recommendations.push('Work on sleep schedule consistency for better rest');
        }
        
        if (dailyPatterns.silentHours > dailyPatterns.speakingHours * 3) {
            insights.recommendations.push('Long quiet periods detected - ensure pendant is worn during active times');
        }
        
        return insights;
    }
    
    /**
     * Helper: Calculate time span of segments
     */
    private static calculateTimeSpan(segments: any[]): number {
        if (segments.length === 0) return 0;
        
        const first = segments[0].timestamp.getTime();
        const last = segments[segments.length - 1].timestamp.getTime();
        
        return last - first;
    }
    
    /**
     * Helper: Calculate sleep consistency
     */
    private static calculateSleepConsistency(sleepPeriods: any[]): number {
        if (sleepPeriods.length < 2) return 0.5;
        
        const bedtimes = sleepPeriods.map(p => {
            const hour = new Date(p.start).getHours();
            // Convert to minutes after midnight (handling wraparound)
            return hour < 12 ? hour * 60 : (hour - 24) * 60;
        });
        
        const variance = StatisticalUtils.standardDeviation(bedtimes);
        // Lower variance = higher consistency
        return Math.max(0, 1 - (variance / 120)); // Normalize by 2 hours
    }
    
    /**
     * Helper: Identify conversation clusters
     */
    private static identifyConversationClusters(segments: any[]): any[] {
        const clusters: any[] = [];
        let currentCluster: any = null;
        
        segments.forEach((seg, idx) => {
            const isConversation = seg.segment.content && seg.segment.content.trim().length > 0;
            
            if (isConversation) {
                if (!currentCluster) {
                    currentCluster = {
                        start: seg.timestamp,
                        end: seg.timestamp,
                        segments: [seg],
                        speakers: new Set([seg.segment.speakerName])
                    };
                } else {
                    // Check if this is part of the same cluster (within 5 minutes)
                    const timeDiff = seg.timestamp.getTime() - currentCluster.end.getTime();
                    if (timeDiff < 5 * 60 * 1000) {
                        currentCluster.end = seg.timestamp;
                        currentCluster.segments.push(seg);
                        currentCluster.speakers.add(seg.segment.speakerName);
                    } else {
                        // Finalize current cluster and start new one
                        clusters.push(currentCluster);
                        currentCluster = {
                            start: seg.timestamp,
                            end: seg.timestamp,
                            segments: [seg],
                            speakers: new Set([seg.segment.speakerName])
                        };
                    }
                }
            }
        });
        
        // Finalize last cluster
        if (currentCluster && currentCluster.segments.length > 5) {
            clusters.push(currentCluster);
        }
        
        // Process clusters
        return clusters
            .filter(c => c.segments.length > 10) // Significant conversations only
            .map(c => ({
                start: c.start.toISOString(),
                end: c.end.toISOString(),
                intensity: c.segments.length / ((c.end - c.start) / 60000), // segments per minute
                participants: c.speakers.size
            }))
            .slice(0, 10); // Top 10 clusters
    }
    
    /**
     * Create empty metrics for edge cases
     */
    static createEmptyMetrics(): EnvironmentalActivityMetrics {
        return {
            dailyPatterns: {
                speakingHours: 0,
                listeningHours: 0,
                silentHours: 0,
                recordingHours: 0,
                coveragePercentage: 0
            },
            conversationDynamics: {
                speakingRatio: 0,
                averageTurnLength: 0,
                conversationalDominance: 'minimal',
                interactionIntensity: 0
            },
            hourlyActivity: [],
            environmentalPatterns: {
                quietPeriods: [],
                activePeriods: [],
                longestSilence: { start: '', duration: 0 },
                busiestHour: { hour: 0, interactions: 0 },
                quietestHour: { hour: 0, interactions: 0 }
            },
            sleepAnalysis: {
                probableSleepPeriods: [],
                estimatedSleepHours: 0,
                sleepConsistency: 0,
                typicalBedtime: null,
                typicalWakeTime: null
            },
            socialPatterns: {
                peakSocialHours: [],
                isolationPeriods: 0,
                socialIntensityScore: 0,
                conversationClusters: []
            },
            dailyActivityProfile: {
                morningActivity: 'low',
                afternoonActivity: 'low',
                eveningActivity: 'low',
                nightActivity: 'minimal',
                consistencyScore: 0
            },
            insights: {
                primaryPattern: 'Insufficient data for analysis',
                unusualPatterns: [],
                recommendations: ['Continue recording to establish patterns']
            }
        };
    }
}