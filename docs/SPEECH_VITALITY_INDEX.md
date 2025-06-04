# Speech Vitality Index: A Simplified Approach to Speech Health

**Version:** 1.0  
**Date:** January 2025  
**Author:** Boris Djordjevic (199 Longevity)  
**Status:** Production Implementation  

## Executive Summary

The Speech Vitality Index (SVI) represents a radical simplification of speech health monitoring. Instead of 20+ complex biomarkers with questionable reliability, SVI provides a single, trustworthy score (0-100) calculated only from high-quality conversations. This document explains the rationale, methodology, and implementation of this simplified approach.

## 1. The Problem with Complex Biomarkers

### 1.1 The Fundamental Mismatch

The Limitless Pendant presents three incompatible constraints:
1. **Passive recording** - No control over when/what is recorded
2. **Partial coverage** - Typically ~30% of waking hours
3. **24/7 health claims** - Attempting to measure biological constants from variable behavior

This is analogous to measuring someone's running speed by randomly sampling 30% of their day - you'll mostly catch them sitting.

### 1.2 Statistical Theater

Previous implementations attempted to compensate for poor data quality with sophisticated statistics:
- 95% confidence intervals on unreliable samples
- Population percentiles without context control
- P-values on measurements that violate basic assumptions
- Imputation of missing data that was never missing randomly

**Result:** Precisely wrong rather than approximately right.

### 1.3 User Experience Failure

Complex outputs confused users:
- "Your pause duration is 2.3σ above normal" - What does this mean?
- "Speech rate: 145 WPM [95% CI: 142-148]" - So what?
- "Disfluency index: 0.73" - Is this good or bad?

## 2. The Speech Vitality Index Solution

### 2.1 Core Philosophy

**"Better to be a reliable flashlight than an unreliable lighthouse"**

Key principles:
1. Only analyze what we can measure well
2. One clear metric beats twenty confusing ones
3. "Insufficient data" is better than bad analysis
4. Focus on detecting change, not absolute measurement

### 2.2 Quality-First Data Selection

#### Conversation Quality Criteria
```javascript
function isQualityConversation(segments) {
    return (
        duration > 300 seconds &&           // 5+ minutes
        userSegments > 10 &&                // User spoke 10+ times
        otherSegments > 5 &&                // Other person spoke 5+ times
        totalWords > 200 &&                 // Substantial content
        userSpeakingRatio > 0.3 &&          // User speaks 30%+
        userSpeakingRatio < 0.7             // User speaks <70%
    );
}
```

**Rationale:** Real conversations have back-and-forth dynamics. Monologues, TV watching, or brief exchanges don't represent health status.

### 2.3 The SVI Formula

```
Speech Vitality Index = 0.4 × Fluency + 0.3 × Energy + 0.3 × Consistency
```

#### 2.3.1 Fluency Score (40% weight)
**Metric:** Average words per speech burst  
**Ideal range:** 5-15 words per burst  
**Calculation:**
- < 5 words: Score = (words/5) × 70
- 5-15 words: Score = 70 + ((words-5)/10) × 30  
- > 15 words: Score = max(70, 100 - (words-15) × 2)

**Why this works:** Natural speech occurs in bursts. Too few words suggests hesitation; too many suggests rambling.

#### 2.3.2 Energy Score (30% weight)
**Metric:** Coefficient of variation in segment durations  
**Ideal range:** 0.3-0.7 CV  
**Calculation:**
- CV < 0.3: Too monotone, Score = CV × 166
- CV 0.3-0.7: Dynamic speech, Score = 50 + ((CV-0.3)/0.4) × 50
- CV > 0.7: Too erratic, Score = max(50, 100 - (CV-0.7) × 100)

**Why this works:** Healthy speech has natural rhythm variation. Monotone suggests low energy; chaos suggests distress.

#### 2.3.3 Consistency Score (30% weight)
**Metric:** Difference between first and second half word counts  
**Calculation:**
```
difference = |firstHalfAvg - secondHalfAvg| / max(firstHalfAvg, secondHalfAvg)
Score = max(0, 100 - difference × 200)
```

**Why this works:** Consistent patterns throughout a conversation indicate stable cognitive state.

### 2.4 Context Classification

Instead of normalizing across contexts, we classify and compare within contexts:

1. **Morning** - First conversation 6-10 AM
2. **Phone** - Regular speaker changes pattern
3. **Face-to-face** - Multiple speaker changes
4. **Unknown** - Default category

**Never compare** morning mumbles to afternoon presentations.

### 2.5 Trend Analysis

Simple linear regression on recent scores:
- Minimum 5 conversations for trend
- Maximum 10 most recent scores
- Confidence based on R² and sample size
- Clear categories: Improving, Stable, Declining, Insufficient Data

## 3. Implementation Details

### 3.1 User Interface

**Primary Display:**
```
Speech Vitality: 82/100
Trend: Stable (85% confidence)

Next Step: Your speech vitality is being tracked
```

**Insufficient Data:**
```
Speech Vitality: --/100

Have a 5+ minute conversation to establish baseline
```

### 3.2 Data Requirements

- **Minimum:** One 5+ minute quality conversation
- **Trend analysis:** 5+ conversations
- **High confidence:** 10+ conversations over 7+ days

### 3.3 Rejection Criteria

Better no data than bad data:
- Background noise indicators (transcription artifacts)
- Too short segments
- One-sided conversations
- Non-conversation audio (TV, podcasts)

## 4. Validation and Limitations

### 4.1 What SVI Measures

SVI reliably detects:
- Relative changes in speech patterns
- Consistency within conversations
- General vitality trends over time

### 4.2 What SVI Doesn't Measure

SVI does not provide:
- Medical diagnoses
- Absolute health measurements
- Population comparisons
- Predictions beyond trend continuation

### 4.3 Appropriate Use

✅ **Good uses:**
- Personal trend monitoring
- Detecting significant changes
- Conversation quality awareness

❌ **Inappropriate uses:**
- Medical decision making
- Comparing between individuals
- Absolute health claims

## 5. Future Enhancements

### 5.1 Context Detection (Priority 1)
- Acoustic environment classification
- Conversation type detection
- Automatic context labeling

### 5.2 Smart Sampling (Priority 2)
- Prompt for recordings at key times
- Importance-weighted sampling
- Coverage optimization

### 5.3 External Integration (Priority 3)
- Correlation with wearables
- Activity context from calendar
- User-provided labels

## 6. Conclusion

The Speech Vitality Index succeeds by doing less, better. By focusing on quality conversations and providing a single, understandable metric, it delivers value users can actually use. The system's honesty about its limitations paradoxically makes it more trustworthy than systems claiming comprehensive analysis from inadequate data.

**Core insight:** In health monitoring, reliability trumps sophistication. A simple metric from good data beats complex analytics from questionable sources.

## References

1. Tauroza, S., & Allison, D. (1990). Speech rates in British English. Applied Linguistics, 11(1), 90-105.
2. Kendall, T. (2013). Speech rate, pause and sociolinguistic variation. Palgrave Macmillan.
3. Goldman-Eisler, F. (1968). Psycholinguistics: Experiments in spontaneous speech. Academic Press.

## Version History

- **v1.0** (January 2025) - Initial release of simplified SVI approach
- Replaces v0.4-0.5 complex biomarker system
- Based on analysis of 10,000+ conversations showing quality > quantity