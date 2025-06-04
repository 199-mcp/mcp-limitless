// =============================================================================
// STATISTICAL UTILITIES FOR SPEECH BIOMARKER ANALYSIS
// =============================================================================

export interface StatisticalResult {
    value: number;
    confidenceInterval: [number, number];
    standardError: number;
    sampleSize: number;
    pValue?: number;
}

export interface TrendAnalysis {
    slope: number;
    rSquared: number;
    pValue: number;
    significance: "significant" | "not_significant" | "insufficient_data";
    confidenceInterval: [number, number];
}

export interface DataQualityMetrics {
    totalSegments: number;
    validSegments: number;
    outliers: number;
    qualityScore: number; // 0-1
    reliability: "high" | "medium" | "low";
}

/**
 * Statistical utilities for speech biomarker analysis
 */
export class StatisticalUtils {
    
    /**
     * Calculate confidence interval for a mean
     */
    static calculateConfidenceInterval(
        values: number[], 
        confidenceLevel: number = 0.95
    ): [number, number] {
        if (values.length < 2) return [0, 0];
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        const standardError = Math.sqrt(variance / values.length);
        
        // Use t-distribution for small samples
        const tValue = this.getTValue(values.length - 1, confidenceLevel);
        const marginOfError = tValue * standardError;
        
        return [mean - marginOfError, mean + marginOfError];
    }
    
    /**
     * Calculate statistical result with confidence intervals
     */
    static calculateStatisticalResult(values: number[]): StatisticalResult {
        if (values.length === 0) {
            return {
                value: 0,
                confidenceInterval: [0, 0],
                standardError: 0,
                sampleSize: 0
            };
        }
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.length > 1 ? 
            values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1) : 0;
        const standardError = values.length > 1 ? Math.sqrt(variance / values.length) : 0;
        const confidenceInterval = this.calculateConfidenceInterval(values);
        
        return {
            value: mean,
            confidenceInterval,
            standardError,
            sampleSize: values.length
        };
    }
    
    /**
     * Perform simple linear regression for trend analysis
     */
    static linearRegression(x: number[], y: number[]): TrendAnalysis {
        if (x.length !== y.length || x.length < 3) {
            return {
                slope: 0,
                rSquared: 0,
                pValue: 1,
                significance: "insufficient_data",
                confidenceInterval: [0, 0]
            };
        }
        
        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        const sumYY = y.reduce((sum, val) => sum + val * val, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate R-squared
        const yMean = sumY / n;
        const totalSumSquares = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
        const residualSumSquares = y.reduce((sum, val, i) => {
            const predicted = slope * x[i] + intercept;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const rSquared = 1 - (residualSumSquares / totalSumSquares);
        
        // Calculate p-value for slope (simplified t-test)
        const slopeStandardError = this.calculateSlopeStandardError(x, y, slope, intercept);
        const tStatistic = Math.abs(slope / slopeStandardError);
        const pValue = this.getTTestPValue(tStatistic, n - 2);
        
        const significance = pValue < 0.05 ? "significant" : "not_significant";
        
        // Confidence interval for slope
        const tValue = this.getTValue(n - 2, 0.95);
        const marginOfError = tValue * slopeStandardError;
        const confidenceInterval: [number, number] = [slope - marginOfError, slope + marginOfError];
        
        return {
            slope,
            rSquared,
            pValue,
            significance,
            confidenceInterval
        };
    }
    
    /**
     * Calculate data quality metrics
     */
    static assessDataQuality(
        rawValues: number[],
        validValues: number[],
        outliers: number[]
    ): DataQualityMetrics {
        const totalSegments = rawValues.length;
        const validSegments = validValues.length;
        const outlierCount = outliers.length;
        
        // Quality score based on data completeness and outlier rate
        const completeness = totalSegments > 0 ? validSegments / totalSegments : 0;
        const outlierRate = totalSegments > 0 ? outlierCount / totalSegments : 0;
        const qualityScore = completeness * (1 - outlierRate);
        
        let reliability: "high" | "medium" | "low";
        if (validSegments >= 50 && qualityScore >= 0.8) {
            reliability = "high";
        } else if (validSegments >= 20 && qualityScore >= 0.6) {
            reliability = "medium";
        } else {
            reliability = "low";
        }
        
        return {
            totalSegments,
            validSegments,
            outliers: outlierCount,
            qualityScore,
            reliability
        };
    }
    
    /**
     * Remove outliers using IQR method
     */
    static removeOutliers(values: number[]): { cleaned: number[], outliers: number[] } {
        if (values.length < 4) return { cleaned: values, outliers: [] };
        
        const sorted = [...values].sort((a, b) => a - b);
        const q1Index = Math.floor(sorted.length * 0.25);
        const q3Index = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Index];
        const q3 = sorted[q3Index];
        const iqr = q3 - q1;
        
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        const cleaned: number[] = [];
        const outliers: number[] = [];
        
        for (const value of values) {
            if (value >= lowerBound && value <= upperBound) {
                cleaned.push(value);
            } else {
                outliers.push(value);
            }
        }
        
        return { cleaned, outliers };
    }
    
    /**
     * Calculate percentile ranking
     */
    static calculatePercentile(value: number, population: number[]): number {
        if (population.length === 0) return 50; // Default to median
        
        const belowCount = population.filter(x => x < value).length;
        const equalCount = population.filter(x => x === value).length;
        
        // Use average rank for ties
        const percentile = ((belowCount + equalCount / 2) / population.length) * 100;
        return Math.round(percentile);
    }
    
    /**
     * Perform Welch's t-test for comparing two groups
     */
    static welchTTest(group1: number[], group2: number[]): {
        tStatistic: number;
        pValue: number;
        significant: boolean;
    } {
        if (group1.length < 2 || group2.length < 2) {
            return { tStatistic: 0, pValue: 1, significant: false };
        }
        
        const mean1 = group1.reduce((sum, x) => sum + x, 0) / group1.length;
        const mean2 = group2.reduce((sum, x) => sum + x, 0) / group2.length;
        
        const var1 = group1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (group1.length - 1);
        const var2 = group2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (group2.length - 1);
        
        const se1 = var1 / group1.length;
        const se2 = var2 / group2.length;
        const standardError = Math.sqrt(se1 + se2);
        
        const tStatistic = (mean1 - mean2) / standardError;
        
        // Approximate degrees of freedom for Welch's t-test
        const df = Math.pow(se1 + se2, 2) / (Math.pow(se1, 2) / (group1.length - 1) + Math.pow(se2, 2) / (group2.length - 1));
        
        const pValue = this.getTTestPValue(Math.abs(tStatistic), df);
        const significant = pValue < 0.05;
        
        return { tStatistic, pValue, significant };
    }
    
    // =============================================================================
    // HELPER METHODS
    // =============================================================================
    
    /**
     * Get t-value for given degrees of freedom and confidence level
     */
    private static getTValue(df: number, confidenceLevel: number): number {
        // Simplified t-table lookup for common values
        const alpha = 1 - confidenceLevel;
        
        if (df >= 30) {
            // Use normal approximation for large samples
            return confidenceLevel === 0.95 ? 1.96 : 
                   confidenceLevel === 0.99 ? 2.58 : 1.96;
        }
        
        // Simplified t-values for small samples (95% confidence)
        const tTable: { [key: number]: number } = {
            1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57,
            6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23,
            15: 2.13, 20: 2.09, 25: 2.06, 30: 2.04
        };
        
        // Find closest df
        const closestDf = Object.keys(tTable)
            .map(Number)
            .reduce((prev, curr) => Math.abs(curr - df) < Math.abs(prev - df) ? curr : prev);
        
        return tTable[closestDf] || 2.0;
    }
    
    /**
     * Calculate standard error for regression slope
     */
    private static calculateSlopeStandardError(x: number[], y: number[], slope: number, intercept: number): number {
        const n = x.length;
        const residuals = y.map((yi, i) => yi - (slope * x[i] + intercept));
        const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
        
        const xMean = x.reduce((sum, xi) => sum + xi, 0) / n;
        const sumSquaredDeviations = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
        
        return Math.sqrt(mse / sumSquaredDeviations);
    }
    
    /**
     * Approximate p-value for t-test (two-tailed)
     */
    private static getTTestPValue(tStatistic: number, df: number): number {
        // Simplified p-value calculation
        if (df < 1) return 1;
        
        const absT = Math.abs(tStatistic);
        
        // Rough approximation for p-values
        if (absT > 3) return 0.01;
        if (absT > 2.5) return 0.02;
        if (absT > 2) return 0.05;
        if (absT > 1.5) return 0.15;
        if (absT > 1) return 0.30;
        return 0.50;
    }
}