import { Lifelog, LifelogContentNode } from "./limitless-client.js";

// =============================================================================
// TRANSCRIPT EXTRACTION AND FORMATTING
// =============================================================================

export interface TranscriptOptions {
    format: "raw_text" | "verbatim" | "structured" | "timestamps" | "speakers_only";
    includeTimestamps?: boolean;
    includeSpeakers?: boolean;
    includeContext?: boolean;
    preserveFormatting?: boolean;
    timeFormat?: "offset" | "absolute" | "duration";
    speakerFormat?: "names" | "identifiers" | "both";
}

export interface TranscriptSegment {
    speaker?: string;
    speakerIdentifier?: "user" | null;
    content: string;
    startTime?: string;
    endTime?: string;
    startOffsetMs?: number;
    endOffsetMs?: number;
    duration?: number;
    type: string;
}

export interface DetailedTranscript {
    lifelogId: string;
    title: string;
    startTime: string;
    endTime: string;
    totalDuration: number;
    segments: TranscriptSegment[];
    metadata: {
        speakerCount: number;
        uniqueSpeakers: string[];
        wordCount: number;
        averageSegmentLength: number;
        technicalTermsFound: string[];
        numbersAndFigures: string[];
        keyPhrases: string[];
    };
    rawText: string;
    formattedTranscript: string;
}

export class TranscriptExtractor {
    
    /**
     * Extract raw, unformatted transcript from lifelog data
     * Optimized for AI processing with maximum context preservation
     */
    static extractRawTranscript(lifelog: Lifelog, options: TranscriptOptions = { format: "structured" }): DetailedTranscript {
        const {
            format = "structured",
            includeTimestamps = true,
            includeSpeakers = true,
            includeContext = true,
            preserveFormatting = false,
            timeFormat = "absolute",
            speakerFormat = "names"
        } = options;

        if (!lifelog.contents || lifelog.contents.length === 0) {
            return this.createEmptyTranscript(lifelog);
        }

        // Extract all conversation segments with full context
        const segments = this.extractSegments(lifelog.contents, {
            includeTimestamps,
            includeSpeakers,
            includeContext,
            timeFormat,
            speakerFormat
        });

        // Analyze content for technical terms, figures, and key phrases
        const metadata = this.analyzeContent(segments);

        // Generate different format outputs
        const rawText = this.generateRawText(segments, preserveFormatting);
        const formattedTranscript = this.generateFormattedTranscript(segments, format, options);

        const totalDuration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();

        return {
            lifelogId: lifelog.id,
            title: lifelog.title || "Untitled Conversation",
            startTime: lifelog.startTime,
            endTime: lifelog.endTime,
            totalDuration,
            segments,
            metadata,
            rawText,
            formattedTranscript
        };
    }

    /**
     * Extract segments with maximum detail preservation
     */
    private static extractSegments(
        contents: LifelogContentNode[], 
        options: {
            includeTimestamps: boolean;
            includeSpeakers: boolean;
            includeContext: boolean;
            timeFormat: "offset" | "absolute" | "duration";
            speakerFormat: "names" | "identifiers" | "both";
        }
    ): TranscriptSegment[] {
        const segments: TranscriptSegment[] = [];

        for (const node of contents) {
            if (!node.content || node.content.trim().length === 0) continue;

            // Preserve all content types, not just blockquotes
            const segment: TranscriptSegment = {
                content: node.content.trim(),
                type: node.type,
                startTime: node.startTime,
                endTime: node.endTime,
                startOffsetMs: node.startOffsetMs,
                endOffsetMs: node.endOffsetMs
            };

            // Calculate duration if timestamps available
            if (node.startOffsetMs !== undefined && node.endOffsetMs !== undefined) {
                segment.duration = node.endOffsetMs - node.startOffsetMs;
            }

            // Include speaker information with full context
            if (options.includeSpeakers && node.speakerName) {
                switch (options.speakerFormat) {
                    case "names":
                        segment.speaker = node.speakerName;
                        break;
                    case "identifiers":
                        segment.speaker = node.speakerIdentifier || node.speakerName;
                        break;
                    case "both":
                        segment.speaker = node.speakerName;
                        segment.speakerIdentifier = node.speakerIdentifier;
                        break;
                }
            }

            segments.push(segment);

            // Process children recursively to preserve nested content
            if (node.children && node.children.length > 0) {
                const childSegments = this.extractSegments(node.children, options);
                segments.push(...childSegments);
            }
        }

        return segments;
    }

    /**
     * Analyze content for technical terms, figures, and important details
     */
    private static analyzeContent(segments: TranscriptSegment[]): any {
        const allText = segments.map(s => s.content).join(" ");
        const uniqueSpeakers = new Set(segments.map(s => s.speaker).filter(Boolean));

        // Extract technical terms (scientific, medical, business)
        const technicalTerms = this.extractTechnicalTerms(allText);
        
        // Extract numbers, figures, percentages, dates
        const numbersAndFigures = this.extractNumbersAndFigures(allText);
        
        // Extract key phrases and important concepts
        const keyPhrases = this.extractKeyPhrases(allText);

        // Calculate statistics
        const wordCount = allText.split(/\s+/).length;
        const averageSegmentLength = segments.length > 0 ? wordCount / segments.length : 0;

        return {
            speakerCount: uniqueSpeakers.size,
            uniqueSpeakers: Array.from(uniqueSpeakers),
            wordCount,
            averageSegmentLength: Math.round(averageSegmentLength),
            technicalTermsFound: technicalTerms,
            numbersAndFigures,
            keyPhrases
        };
    }

    /**
     * Extract technical terminology with precision
     */
    private static extractTechnicalTerms(text: string): string[] {
        const technicalPatterns = [
            // Scientific terms
            /\b[A-Z][a-z]+(?:ine|ase|oid|gen|ide|ate|ium|sis|tion|logy|graphy|metry|scopy)\b/g,
            // Medical terms  
            /\b(?:diagnosis|treatment|therapy|syndrome|pathology|cardio|neuro|gastro|pulmonary|hepatic|renal|oncology|immunology)\w*\b/gi,
            // Technical abbreviations
            /\b[A-Z]{2,6}\b(?:\s*[A-Z]{2,6})*\b/g,
            // Chemical formulas and compounds
            /\b[A-Z][a-z]?(?:\d+[A-Za-z]*)*\b/g,
            // Units and measurements
            /\b\d+(?:\.\d+)?\s*(?:mg|kg|ml|cm|mm|km|hz|ghz|mb|gb|tb|fps|rpm|°[CF]|%)\b/gi,
            // Software/tech terms
            /\b(?:API|SDK|REST|GraphQL|JSON|XML|HTTP|HTTPS|SQL|NoSQL|CI\/CD|DevOps|ML|AI|GPU|CPU|RAM|SSD|IoT|VR|AR)\b/gi
        ];

        const terms = new Set<string>();
        for (const pattern of technicalPatterns) {
            const matches = text.match(pattern) || [];
            matches.forEach(match => {
                if (match.length > 2) { // Filter out very short matches
                    terms.add(match);
                }
            });
        }

        return Array.from(terms).slice(0, 20); // Top 20 technical terms
    }

    /**
     * Extract numbers, figures, percentages, and quantitative data
     */
    private static extractNumbersAndFigures(text: string): string[] {
        const numberPatterns = [
            // Percentages
            /\b\d+(?:\.\d+)?%\b/g,
            // Currency
            /\$\d+(?:,\d{3})*(?:\.\d{2})?\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD|EUR|GBP)\b/gi,
            // Large numbers with commas
            /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,
            // Decimal numbers with context
            /\b\d+\.\d+\s*(?:million|billion|thousand|k)\b/gi,
            // Time/duration
            /\b\d+(?:\.\d+)?\s*(?:hours?|minutes?|seconds?|days?|weeks?|months?|years?)\b/gi,
            // Ratios and fractions
            /\b\d+:\d+\b|\b\d+\/\d+\b/g,
            // Scientific notation
            /\b\d+(?:\.\d+)?[eE][+-]?\d+\b/g,
            // Dates with specific formats
            /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
            // Version numbers
            /\bv?\d+\.\d+(?:\.\d+)*\b/gi
        ];

        const figures = new Set<string>();
        for (const pattern of numberPatterns) {
            const matches = text.match(pattern) || [];
            matches.forEach(match => figures.add(match));
        }

        return Array.from(figures).slice(0, 30); // Top 30 figures
    }

    /**
     * Extract key phrases and important concepts
     */
    private static extractKeyPhrases(text: string): string[] {
        const keyPhrasePatterns = [
            // Decision indicators
            /\b(?:we decided|decision was|agreed to|concluded that|determined that|final decision|going with|chose to)\s+[^.!?]*[.!?]/gi,
            // Action indicators  
            /\b(?:action item|next step|follow up|we need to|I will|should do|must complete|deadline|by \w+day)\s+[^.!?]*[.!?]/gi,
            // Important qualifiers
            /\b(?:critical|essential|important|urgent|priority|significant|major|key|primary|main|core)\s+[^.!?]*[.!?]/gi,
            // Problem/solution indicators
            /\b(?:problem is|issue with|challenge|solution|fix|resolve|address)\s+[^.!?]*[.!?]/gi,
            // Research/findings
            /\b(?:study shows|research indicates|data suggests|findings|results|analysis|statistics|evidence)\s+[^.!?]*[.!?]/gi,
            // Quotes and references
            /(?:"[^"]*"|according to|as mentioned|referenced|cited|source)/gi
        ];

        const phrases = new Set<string>();
        for (const pattern of keyPhrasePatterns) {
            const matches = text.match(pattern) || [];
            matches.forEach(match => {
                if (match.length > 10 && match.length < 200) { // Reasonable phrase length
                    phrases.add(match.trim());
                }
            });
        }

        return Array.from(phrases).slice(0, 15); // Top 15 key phrases
    }

    /**
     * Generate clean raw text optimized for AI processing
     */
    private static generateRawText(segments: TranscriptSegment[], preserveFormatting: boolean): string {
        if (!preserveFormatting) {
            // Clean text optimized for AI - remove all formatting, just content
            return segments
                .filter(s => s.type === "blockquote" || s.type.startsWith("heading"))
                .map(s => s.content)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
        }

        // Preserve some structure for readability
        return segments
            .map(s => {
                let text = s.content;
                if (s.speaker) {
                    text = `${s.speaker}: ${text}`;
                }
                return text;
            })
            .join("\n")
            .trim();
    }

    /**
     * Generate formatted transcript based on specified format
     */
    private static generateFormattedTranscript(
        segments: TranscriptSegment[], 
        format: string, 
        options: TranscriptOptions
    ): string {
        switch (format) {
            case "raw_text":
                return segments.map(s => s.content).join(" ");

            case "verbatim":
                return segments
                    .filter(s => s.speaker) // Only spoken content
                    .map(s => `${s.speaker}: ${s.content}`)
                    .join("\n");

            case "timestamps":
                return segments
                    .filter(s => s.startTime)
                    .map(s => {
                        const time = s.startTime ? new Date(s.startTime).toLocaleTimeString() : "";
                        const speaker = s.speaker ? `${s.speaker}: ` : "";
                        return `[${time}] ${speaker}${s.content}`;
                    })
                    .join("\n");

            case "speakers_only":
                return segments
                    .filter(s => s.speaker && s.type === "blockquote")
                    .map(s => `**${s.speaker}:** ${s.content}`)
                    .join("\n\n");

            case "structured":
            default:
                // Comprehensive structured format with all context
                let result = "";
                let currentSpeaker = "";
                
                for (const segment of segments) {
                    if (segment.type.startsWith("heading")) {
                        result += `\n# ${segment.content}\n\n`;
                    } else if (segment.speaker && segment.speaker !== currentSpeaker) {
                        currentSpeaker = segment.speaker;
                        const timestamp = segment.startTime ? 
                            ` (${new Date(segment.startTime).toLocaleTimeString()})` : "";
                        result += `\n**${segment.speaker}${timestamp}:**\n`;
                        result += `${segment.content}\n`;
                    } else if (segment.speaker) {
                        result += `${segment.content}\n`;
                    } else {
                        result += `\n*${segment.content}*\n`;
                    }
                }
                
                return result.trim();
        }
    }

    /**
     * Create empty transcript for lifelogs with no content
     */
    private static createEmptyTranscript(lifelog: Lifelog): DetailedTranscript {
        return {
            lifelogId: lifelog.id,
            title: lifelog.title || "Empty Lifelog",
            startTime: lifelog.startTime,
            endTime: lifelog.endTime,
            totalDuration: new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime(),
            segments: [],
            metadata: {
                speakerCount: 0,
                uniqueSpeakers: [],
                wordCount: 0,
                averageSegmentLength: 0,
                technicalTermsFound: [],
                numbersAndFigures: [],
                keyPhrases: []
            },
            rawText: "",
            formattedTranscript: "No content available."
        };
    }

    /**
     * Extract multiple lifelogs and combine into comprehensive transcript
     */
    static extractMultipleTranscripts(
        lifelogs: Lifelog[], 
        options: TranscriptOptions = { format: "structured" }
    ): {
        combinedTranscript: string;
        individualTranscripts: DetailedTranscript[];
        aggregatedMetadata: any;
    } {
        const individualTranscripts = lifelogs.map(lifelog => 
            this.extractRawTranscript(lifelog, options)
        );

        const combinedTranscript = individualTranscripts
            .map(t => t.formattedTranscript)
            .join("\n\n---\n\n");

        // Aggregate metadata across all transcripts
        const aggregatedMetadata = {
            totalLifelogs: lifelogs.length,
            totalDuration: individualTranscripts.reduce((sum, t) => sum + t.totalDuration, 0),
            totalWordCount: individualTranscripts.reduce((sum, t) => sum + t.metadata.wordCount, 0),
            uniqueSpeakersAcrossAll: Array.from(new Set(
                individualTranscripts.flatMap(t => t.metadata.uniqueSpeakers)
            )),
            allTechnicalTerms: Array.from(new Set(
                individualTranscripts.flatMap(t => t.metadata.technicalTermsFound)
            )),
            allNumbersAndFigures: Array.from(new Set(
                individualTranscripts.flatMap(t => t.metadata.numbersAndFigures)
            )),
            allKeyPhrases: Array.from(new Set(
                individualTranscripts.flatMap(t => t.metadata.keyPhrases)
            ))
        };

        return {
            combinedTranscript,
            individualTranscripts,
            aggregatedMetadata
        };
    }
}