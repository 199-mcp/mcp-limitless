import { ImprovedSpeechSegment } from './improved-speech-biomarkers.js';

export interface DisfluencyMetrics {
    // Core disfluency counts
    fillerWords: {
        count: number;
        rate: number;                    // Per 100 words
        types: Map<string, number>;      // Specific filler frequencies
    };
    
    repetitions: {
        wordRepetitions: number;         // "the the", "I I"
        phraseRepetitions: number;       // "you know you know"
        rate: number;                    // Per 100 words
    };
    
    repairs: {
        selfCorrections: number;         // "I mean", "rather", "actually"
        restarts: number;                // Incomplete sentences
        revisions: number;               // Changed mid-sentence
        rate: number;                    // Per 100 words
    };
    
    hesitations: {
        silentPauses: number;            // From pause analysis
        filledPauses: number;            // "um", "uh", "er"
        elongations: number;             // "sooo", "welll"
        rate: number;                    // Per 100 words
    };
    
    // Advanced metrics
    disfluencyPatterns: {
        atSentenceStart: number;         // Disfluencies at beginning
        midSentence: number;             // Disfluencies in middle
        beforeComplexWords: number;      // Before technical terms
    };
    
    // Clinical indicators
    fluencyRating: number;               // 0-100, higher = more fluent
    cognitiveLoadMarkers: number;       // Count of load indicators
    speechPlanningDifficulty: number;   // 0-1, higher = more difficulty
    
    // Contextual analysis
    topicShifts: number;                 // Abrupt topic changes
    incompleteThoughts: number;          // Abandoned sentences
    wordSearchingBehaviors: number;      // "What's the word", "you know what I mean"
}

export interface DisfluencyPattern {
    pattern: RegExp;
    type: 'filler' | 'repetition' | 'repair' | 'hesitation' | 'search';
    severity: number;  // 1-3, clinical impact
}

export class DisfluencyDetector {
    
    // Comprehensive filler word patterns
    private static readonly FILLER_PATTERNS: DisfluencyPattern[] = [
        // Classic fillers
        { pattern: /\b(um+|uh+|er+|ah+)\b/gi, type: 'filler', severity: 1 },
        { pattern: /\b(hmm+|mmm+)\b/gi, type: 'filler', severity: 1 },
        
        // Discourse markers used as fillers
        { pattern: /\b(like|you know|I mean|kind of|sort of|basically|literally)\b/gi, type: 'filler', severity: 1 },
        { pattern: /\b(actually|really|just|so)\b/gi, type: 'filler', severity: 1 },
        
        // Hesitation phrases
        { pattern: /\b(well|let me see|let's see)\b/gi, type: 'hesitation', severity: 1 },
        { pattern: /\b(how do I say|what's the word|you know what I mean)\b/gi, type: 'search', severity: 2 },
    ];
    
    // Self-correction and repair patterns
    private static readonly REPAIR_PATTERNS: DisfluencyPattern[] = [
        { pattern: /\b(I mean|that is|rather|or rather|sorry)\b/gi, type: 'repair', severity: 1 },
        { pattern: /\b(no wait|wait|actually no|I meant)\b/gi, type: 'repair', severity: 2 },
        { pattern: /\b(what I meant to say|let me rephrase|to put it another way)\b/gi, type: 'repair', severity: 2 },
    ];
    
    /**
     * Analyze speech for disfluencies with clinical precision
     */
    static analyzeDisfluencies(segments: ImprovedSpeechSegment[]): DisfluencyMetrics {
        const validSegments = segments.filter(s => s.isValid);
        
        if (validSegments.length === 0) {
            return this.createEmptyDisfluencyMetrics();
        }
        
        // Analyze each type of disfluency
        const fillerWords = this.detectFillerWords(validSegments);
        const repetitions = this.detectRepetitions(validSegments);
        const repairs = this.detectRepairs(validSegments);
        const hesitations = this.detectHesitations(validSegments);
        
        // Analyze disfluency patterns
        const disfluencyPatterns = this.analyzeDisfluencyPatterns(validSegments);
        
        // Calculate advanced metrics
        const topicShifts = this.detectTopicShifts(validSegments);
        const incompleteThoughts = this.detectIncompleteThoughts(validSegments);
        const wordSearchingBehaviors = this.detectWordSearching(validSegments);
        
        // Calculate cognitive load markers
        const cognitiveLoadMarkers = this.calculateCognitiveLoadMarkers(
            fillerWords, repetitions, repairs, hesitations
        );
        
        // Calculate speech planning difficulty
        const speechPlanningDifficulty = this.calculateSpeechPlanningDifficulty(
            repairs, hesitations, incompleteThoughts, wordSearchingBehaviors
        );
        
        // Calculate overall fluency rating (0-100)
        const fluencyRating = this.calculateFluencyRating(
            fillerWords, repetitions, repairs, hesitations, validSegments
        );
        
        return {
            fillerWords,
            repetitions,
            repairs,
            hesitations,
            disfluencyPatterns,
            fluencyRating,
            cognitiveLoadMarkers,
            speechPlanningDifficulty,
            topicShifts,
            incompleteThoughts,
            wordSearchingBehaviors
        };
    }
    
    /**
     * Detect filler words and discourse markers
     */
    private static detectFillerWords(segments: ImprovedSpeechSegment[]): DisfluencyMetrics['fillerWords'] {
        const types = new Map<string, number>();
        let totalCount = 0;
        let totalWords = 0;
        
        segments.forEach(segment => {
            const content = segment.content.toLowerCase();
            totalWords += segment.wordCount;
            
            this.FILLER_PATTERNS.forEach(pattern => {
                if (pattern.type === 'filler') {
                    const matches = content.match(pattern.pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const normalized = match.toLowerCase().trim();
                            types.set(normalized, (types.get(normalized) || 0) + 1);
                            totalCount++;
                        });
                    }
                }
            });
        });
        
        const rate = totalWords > 0 ? (totalCount / totalWords) * 100 : 0;
        
        return { count: totalCount, rate, types };
    }
    
    /**
     * Detect word and phrase repetitions
     */
    private static detectRepetitions(segments: ImprovedSpeechSegment[]): DisfluencyMetrics['repetitions'] {
        let wordRepetitions = 0;
        let phraseRepetitions = 0;
        let totalWords = 0;
        
        segments.forEach(segment => {
            const words = segment.content.toLowerCase().split(/\s+/);
            totalWords += words.length;
            
            // Detect word repetitions (consecutive identical words)
            for (let i = 1; i < words.length; i++) {
                if (words[i] === words[i-1] && words[i].length > 1) {
                    wordRepetitions++;
                }
            }
            
            // Detect phrase repetitions (2-3 word sequences)
            for (let i = 2; i < words.length; i++) {
                // Check 2-word repetitions
                if (i >= 2 && words[i-1] + words[i] === words[i-3] + words[i-2]) {
                    phraseRepetitions++;
                }
                // Check 3-word repetitions
                if (i >= 5 && 
                    words[i-2] + words[i-1] + words[i] === 
                    words[i-5] + words[i-4] + words[i-3]) {
                    phraseRepetitions++;
                }
            }
            
            // Also check for stuttering patterns (partial word repetitions)
            const stutterPattern = /\b(\w{1,3})\1+\w*\b/gi;
            const stutters = segment.content.match(stutterPattern);
            if (stutters) {
                wordRepetitions += stutters.length;
            }
        });
        
        const rate = totalWords > 0 ? ((wordRepetitions + phraseRepetitions) / totalWords) * 100 : 0;
        
        return { wordRepetitions, phraseRepetitions, rate };
    }
    
    /**
     * Detect self-corrections and repairs
     */
    private static detectRepairs(segments: ImprovedSpeechSegment[]): DisfluencyMetrics['repairs'] {
        let selfCorrections = 0;
        let restarts = 0;
        let revisions = 0;
        let totalWords = 0;
        
        segments.forEach(segment => {
            const content = segment.content;
            totalWords += segment.wordCount;
            
            // Count repair markers
            this.REPAIR_PATTERNS.forEach(pattern => {
                const matches = content.match(pattern.pattern);
                if (matches) {
                    selfCorrections += matches.length;
                }
            });
            
            // Detect restarts (sentences that don't complete)
            // Look for capital letters not after sentence endings
            const restartPattern = /[a-z]\s+[A-Z][a-z]+/g;
            const potentialRestarts = content.match(restartPattern);
            if (potentialRestarts) {
                restarts += potentialRestarts.length;
            }
            
            // Detect revisions (contradiction patterns)
            const revisionPatterns = [
                /\b(no|not|wait|sorry),?\s+(I mean|actually|rather)\b/gi,
                /\b(or|well|actually)\s+no\b/gi
            ];
            
            revisionPatterns.forEach(pattern => {
                const matches = content.match(pattern);
                if (matches) {
                    revisions += matches.length;
                }
            });
        });
        
        const rate = totalWords > 0 ? ((selfCorrections + restarts + revisions) / totalWords) * 100 : 0;
        
        return { selfCorrections, restarts, revisions, rate };
    }
    
    /**
     * Detect hesitation patterns
     */
    private static detectHesitations(segments: ImprovedSpeechSegment[]): DisfluencyMetrics['hesitations'] {
        let filledPauses = 0;
        let elongations = 0;
        let totalWords = 0;
        
        segments.forEach(segment => {
            const content = segment.content;
            totalWords += segment.wordCount;
            
            // Count filled pauses (um, uh, er, ah)
            const filledPausePattern = /\b(um+|uh+|er+|ah+|hmm+)\b/gi;
            const pauseMatches = content.match(filledPausePattern);
            if (pauseMatches) {
                filledPauses += pauseMatches.length;
            }
            
            // Detect elongations (repeated letters indicating hesitation)
            const elongationPattern = /\b\w*([aeiou])\1{2,}\w*\b/gi;
            const elongationMatches = content.match(elongationPattern);
            if (elongationMatches) {
                // Filter out legitimate words with double letters
                const filtered = elongationMatches.filter(word => {
                    const normalized = word.toLowerCase();
                    return !['too', 'see', 'been', 'keep', 'feel', 'need'].includes(normalized);
                });
                elongations += filtered.length;
            }
        });
        
        // Note: silentPauses would come from pause analysis in rhythm analyzer
        const silentPauses = 0; // Placeholder - integrate with rhythm analysis
        
        const rate = totalWords > 0 ? ((filledPauses + elongations) / totalWords) * 100 : 0;
        
        return { silentPauses, filledPauses, elongations, rate };
    }
    
    /**
     * Analyze where disfluencies occur in speech
     */
    private static analyzeDisfluencyPatterns(segments: ImprovedSpeechSegment[]): DisfluencyMetrics['disfluencyPatterns'] {
        let atSentenceStart = 0;
        let midSentence = 0;
        let beforeComplexWords = 0;
        
        segments.forEach(segment => {
            const sentences = segment.content.split(/[.!?]+/).filter(s => s.trim());
            
            sentences.forEach(sentence => {
                const trimmed = sentence.trim();
                if (!trimmed) return;
                
                // Check for disfluencies at sentence start
                const startPattern = /^(um|uh|well|so|like|you know|I mean)/i;
                if (startPattern.test(trimmed)) {
                    atSentenceStart++;
                }
                
                // Check for mid-sentence disfluencies
                const words = trimmed.split(/\s+/);
                for (let i = 1; i < words.length - 1; i++) {
                    if (/^(um|uh|like|you know)$/i.test(words[i])) {
                        midSentence++;
                        
                        // Check if next word is complex (long or technical)
                        if (i < words.length - 1 && words[i + 1].length > 8) {
                            beforeComplexWords++;
                        }
                    }
                }
            });
        });
        
        return { atSentenceStart, midSentence, beforeComplexWords };
    }
    
    /**
     * Detect abrupt topic shifts
     */
    private static detectTopicShifts(segments: ImprovedSpeechSegment[]): number {
        let shifts = 0;
        
        // Look for markers of topic change
        const shiftMarkers = [
            /\b(anyway|anyhow|by the way|speaking of|that reminds me|oh)\b/gi,
            /\b(changing the subject|different topic|another thing)\b/gi,
            /\b(but|however|although)\s+(anyway|so|um)/gi
        ];
        
        segments.forEach(segment => {
            shiftMarkers.forEach(pattern => {
                const matches = segment.content.match(pattern);
                if (matches) {
                    shifts += matches.length;
                }
            });
        });
        
        return shifts;
    }
    
    /**
     * Detect incomplete thoughts and abandoned sentences
     */
    private static detectIncompleteThoughts(segments: ImprovedSpeechSegment[]): number {
        let incomplete = 0;
        
        segments.forEach(segment => {
            const content = segment.content;
            
            // Patterns indicating incomplete thoughts
            const patterns = [
                /\b(but|and|so|because|if)\s*$/gi,          // Ending with conjunction
                /\b(I was going to|I wanted to|I thought)\s*$/gi,  // Unfinished intention
                /\.{3,}/g,                                    // Ellipsis indicating trailing off
                /\b(um|uh|well)\s*$/gi,                      // Ending with filler
                /-\s*$/g                                      // Dash at end indicating interruption
            ];
            
            patterns.forEach(pattern => {
                if (pattern.test(content)) {
                    incomplete++;
                }
            });
        });
        
        return incomplete;
    }
    
    /**
     * Detect word searching behaviors
     */
    private static detectWordSearching(segments: ImprovedSpeechSegment[]): number {
        let wordSearching = 0;
        
        const searchPatterns = [
            /\b(what's the word|what do you call it|how do you say)\b/gi,
            /\b(you know what I mean|you know the|that thing)\b/gi,
            /\b(I forgot the word|I can't remember|tip of my tongue)\b/gi,
            /\b(what's it called|the uh|the um)\b/gi,
            /\b(thing(y|ie)?|stuff|whatchamacallit|thingamajig)\b/gi
        ];
        
        segments.forEach(segment => {
            searchPatterns.forEach(pattern => {
                const matches = segment.content.match(pattern);
                if (matches) {
                    wordSearching += matches.length;
                }
            });
        });
        
        return wordSearching;
    }
    
    /**
     * Calculate cognitive load markers from disfluencies
     */
    private static calculateCognitiveLoadMarkers(
        fillerWords: DisfluencyMetrics['fillerWords'],
        repetitions: DisfluencyMetrics['repetitions'],
        repairs: DisfluencyMetrics['repairs'],
        hesitations: DisfluencyMetrics['hesitations']
    ): number {
        // Count significant disfluencies that indicate cognitive load
        let markers = 0;
        
        // High filler rate
        if (fillerWords.rate > 5) markers += Math.floor(fillerWords.rate / 5);
        
        // Repetitions indicate processing difficulty
        markers += repetitions.wordRepetitions + repetitions.phraseRepetitions;
        
        // Repairs show planning difficulties
        markers += repairs.selfCorrections + repairs.revisions;
        
        // Hesitations indicate word retrieval issues
        markers += hesitations.filledPauses + Math.floor(hesitations.elongations / 2);
        
        return markers;
    }
    
    /**
     * Calculate speech planning difficulty score
     */
    private static calculateSpeechPlanningDifficulty(
        repairs: DisfluencyMetrics['repairs'],
        hesitations: DisfluencyMetrics['hesitations'],
        incompleteThoughts: number,
        wordSearchingBehaviors: number
    ): number {
        // Normalize each factor to 0-1 range
        const repairScore = Math.min((repairs.selfCorrections + repairs.restarts + repairs.revisions) / 20, 1);
        const hesitationScore = Math.min((hesitations.filledPauses + hesitations.elongations) / 20, 1);
        const incompleteScore = Math.min(incompleteThoughts / 10, 1);
        const searchScore = Math.min(wordSearchingBehaviors / 5, 1);
        
        // Weighted combination
        const difficulty = (
            repairScore * 0.3 +
            hesitationScore * 0.3 +
            incompleteScore * 0.2 +
            searchScore * 0.2
        );
        
        return Math.max(0, Math.min(1, difficulty));
    }
    
    /**
     * Calculate overall fluency rating (0-100)
     */
    private static calculateFluencyRating(
        fillerWords: DisfluencyMetrics['fillerWords'],
        repetitions: DisfluencyMetrics['repetitions'],
        repairs: DisfluencyMetrics['repairs'],
        hesitations: DisfluencyMetrics['hesitations'],
        segments: ImprovedSpeechSegment[]
    ): number {
        // Base score starts at 100
        let score = 100;
        
        // Deduct for filler words (up to 20 points)
        score -= Math.min(fillerWords.rate * 4, 20);
        
        // Deduct for repetitions (up to 15 points)
        score -= Math.min(repetitions.rate * 5, 15);
        
        // Deduct for repairs (up to 15 points)
        score -= Math.min(repairs.rate * 5, 15);
        
        // Deduct for hesitations (up to 10 points)
        score -= Math.min(hesitations.rate * 3, 10);
        
        // Bonus for long fluent segments
        const avgSegmentLength = segments.reduce((sum, s) => sum + s.wordCount, 0) / segments.length;
        if (avgSegmentLength > 20) {
            score += 5;
        }
        
        return Math.round(Math.max(0, Math.min(100, score)));
    }
    
    /**
     * Create empty disfluency metrics for edge cases
     */
    static createEmptyDisfluencyMetrics(): DisfluencyMetrics {
        return {
            fillerWords: {
                count: 0,
                rate: 0,
                types: new Map()
            },
            repetitions: {
                wordRepetitions: 0,
                phraseRepetitions: 0,
                rate: 0
            },
            repairs: {
                selfCorrections: 0,
                restarts: 0,
                revisions: 0,
                rate: 0
            },
            hesitations: {
                silentPauses: 0,
                filledPauses: 0,
                elongations: 0,
                rate: 0
            },
            disfluencyPatterns: {
                atSentenceStart: 0,
                midSentence: 0,
                beforeComplexWords: 0
            },
            fluencyRating: 0,
            cognitiveLoadMarkers: 0,
            speechPlanningDifficulty: 0,
            topicShifts: 0,
            incompleteThoughts: 0,
            wordSearchingBehaviors: 0
        };
    }
}