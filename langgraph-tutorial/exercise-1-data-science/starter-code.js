const axios = require('axios');
const cheerio = require('cheerio');
const { mean, median, standardDeviation } = require('simple-statistics');
const fs = require('fs');

// Sample URLs for testing (feel free to add more)
const SAMPLE_URLS = [
    'https://blog.openai.com/gpt-4',
    'https://aws.amazon.com/blogs/machine-learning/',
    'https://developers.googleblog.com/2023/05/introducing-palm-2.html',
    // Add more URLs as needed
];

class DataAnalysisTools {
    // JavaScript equivalent of pandas basic operations
    static createDataFrame(data) {
        return {
            data: data,
            length: data.length,
            columns: Object.keys(data[0] || {}),
            
            // Basic statistics
            describe(column) {
                const values = data.map(row => row[column]).filter(v => typeof v === 'number');
                return {
                    count: values.length,
                    mean: mean(values),
                    median: median(values),
                    std: standardDeviation(values),
                    min: Math.min(...values),
                    max: Math.max(...values)
                };
            },
            
            // Group by functionality
            groupBy(column) {
                const groups = {};
                data.forEach(row => {
                    const key = row[column];
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(row);
                });
                return groups;
            },
            
            // Filter functionality  
            filter(predicate) {
                return DataAnalysisTools.createDataFrame(data.filter(predicate));
            }
        };
    }
    
    // JavaScript equivalent of numpy operations
    static numpy = {
        array: (data) => data,
        mean: (arr) => mean(arr),
        std: (arr) => standardDeviation(arr),
        unique: (arr) => [...new Set(arr)],
        countNonZero: (arr) => arr.filter(x => x !== 0 && x !== null && x !== undefined).length
    };
}

class WebContentAnalyzer {
    constructor() {
        this.results = [];
        this.insights = {};
    }

    async fetchWebContent(url) {
        // TODO: Implement web content fetching
        // Hints:
        // 1. Use axios to fetch the URL
        // 2. Handle errors gracefully (try/catch)
        // 3. Return null if fetch fails
        // 4. Use cheerio to parse HTML and extract text
        
        try {
            console.log(`Fetching content from: ${url}`);
            
            // TODO: Add axios.get() call with proper headers
            // const response = await axios.get(url, {
            //     headers: { 'User-Agent': 'Mozilla/5.0 tutorial-bot' },
            //     timeout: 10000
            // });
            
            // TODO: Parse HTML with cheerio
            // const $ = cheerio.load(response.data);
            
            // TODO: Extract text content (remove scripts, styles)
            // $('script, style, nav, footer').remove();
            // const title = $('h1').first().text().trim();
            // const content = $('p, h2, h3').text();
            
            // TODO: Return structured data
            return {
                url: url,
                title: 'Sample Title', // Replace with actual title
                content: 'Sample content...', // Replace with actual content
                wordCount: 100, // Replace with actual word count
                fetchedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`Failed to fetch ${url}:`, error.message);
            return null;
        }
    }

    analyzeTextContent(contentData) {
        // TODO: Implement text analysis (pandas-like operations)
        // Hints:
        // 1. Calculate word frequency
        // 2. Extract keywords/topics
        // 3. Measure readability
        // 4. Generate statistics
        
        console.log(`Analyzing: ${contentData.title}`);
        
        // TODO: Tokenize and analyze text
        const words = contentData.content.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
            
        // TODO: Calculate word frequency (like pandas value_counts())
        const wordFreq = {};
        // words.forEach(word => {
        //     wordFreq[word] = (wordFreq[word] || 0) + 1;
        // });
        
        // TODO: Find top keywords
        // const topWords = Object.entries(wordFreq)
        //     .sort(([,a], [,b]) => b - a)
        //     .slice(0, 10)
        //     .map(([word]) => word);
        
        // TODO: Calculate readability metrics
        const sentences = contentData.content.split(/[.!?]+/).length;
        const avgWordsPerSentence = contentData.wordCount / Math.max(sentences, 1);
        
        return {
            url: contentData.url,
            title: contentData.title,
            wordCount: contentData.wordCount,
            uniqueWords: 50, // TODO: Calculate actual unique words
            topKeywords: ['sample', 'keywords'], // TODO: Replace with actual top words
            readabilityScore: Math.min(10, avgWordsPerSentence / 2), // Simple metric
            qualityScore: this.calculateQualityScore(contentData),
            analyzedAt: new Date().toISOString()
        };
    }
    
    calculateQualityScore(content) {
        // Simple quality scoring based on content characteristics
        let score = 5; // Base score
        
        // Length bonus
        if (content.wordCount > 500) score += 2;
        if (content.wordCount > 1000) score += 1;
        
        // Title quality
        if (content.title && content.title.length > 20) score += 1;
        
        // Content depth (simple heuristic)
        const technicalWords = ['algorithm', 'model', 'data', 'analysis', 'machine', 'learning'];
        const techWordCount = technicalWords.filter(word => 
            content.content.toLowerCase().includes(word)
        ).length;
        score += Math.min(2, techWordCount * 0.5);
        
        return Math.min(10, Math.max(1, score));
    }

    generateInsights() {
        // TODO: Generate insights using DataAnalysisTools (pandas-like analysis)
        // Hints:
        // 1. Create DataFrame from results
        // 2. Calculate summary statistics
        // 3. Identify content patterns
        // 4. Make recommendations for data engineering
        
        console.log('\n=== GENERATING INSIGHTS ===');
        
        if (this.results.length === 0) {
            console.log('No data to analyze. Run fetchAndAnalyze() first.');
            return;
        }
        
        // TODO: Use DataAnalysisTools to create DataFrame
        const df = DataAnalysisTools.createDataFrame(this.results);
        
        // TODO: Calculate statistics (like pandas.describe())
        // const wordCountStats = df.describe('wordCount');
        // const qualityStats = df.describe('qualityScore');
        
        // TODO: Find patterns and trends
        // const topTopics = this.extractTopTopics();
        // const contentRecommendations = this.generateRecommendations();
        
        this.insights = {
            totalArticles: this.results.length,
            avgWordCount: Math.round(DataAnalysisTools.numpy.mean(
                this.results.map(r => r.wordCount)
            )),
            avgQualityScore: Number(DataAnalysisTools.numpy.mean(
                this.results.map(r => r.qualityScore)
            ).toFixed(1)),
            topTopics: this.extractTopTopics(),
            recommendation: this.generateRecommendation(),
            generatedAt: new Date().toISOString()
        };
        
        this.displayInsights();
        this.exportForDataEngineering();
    }
    
    extractTopTopics() {
        // TODO: Implement topic extraction across all articles
        const allKeywords = this.results.flatMap(r => r.topKeywords);
        const keywordCount = {};
        
        allKeywords.forEach(keyword => {
            keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
        });
        
        return Object.entries(keywordCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([keyword]) => keyword);
    }
    
    generateRecommendation() {
        const avgQuality = this.insights?.avgQualityScore || 
            DataAnalysisTools.numpy.mean(this.results.map(r => r.qualityScore));
            
        if (avgQuality >= 7) {
            return 'HIGH: Process all articles for embeddings - excellent content quality';
        } else if (avgQuality >= 5) {
            return 'MEDIUM: Process articles with quality score > 6 for embeddings';
        } else {
            return 'LOW: Review content sources - quality below threshold';
        }
    }
    
    displayInsights() {
        console.log('\n=== WEB CONTENT ANALYSIS RESULTS ===');
        console.log(`Analyzed ${this.insights.totalArticles} articles`);
        console.log(`Average length: ${this.insights.avgWordCount} words`);
        console.log(`Average quality: ${this.insights.avgQualityScore}/10`);
        console.log(`Top topics: ${JSON.stringify(this.insights.topTopics)}`);
        console.log(`Recommendation: ${this.insights.recommendation}`);
        console.log('=====================================\n');
    }
    
    exportForDataEngineering() {
        // Export results for Exercise 2
        const exportData = {
            analysis: this.insights,
            contentData: this.results.filter(r => r.qualityScore >= 6), // Only high quality
            exportedAt: new Date().toISOString(),
            nextStep: 'Use this data in exercise-2-data-engineering'
        };
        
        fs.writeFileSync('../exercise-2-data-engineering/data-science-output.json', 
            JSON.stringify(exportData, null, 2));
        
        console.log('📊 Results exported to exercise-2-data-engineering/data-science-output.json');
        console.log(`✅ ${exportData.contentData.length} high-quality articles ready for embedding pipeline`);
    }
    
    async fetchAndAnalyze() {
        console.log('🚀 Starting web content analysis...\n');
        
        for (const url of SAMPLE_URLS) {
            const content = await this.fetchWebContent(url);
            if (content) {
                const analysis = this.analyzeTextContent(content);
                this.results.push(analysis);
                
                // Add small delay to be respectful to servers
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        this.generateInsights();
    }
}

// Main execution
async function main() {
    console.log('='.repeat(50));
    console.log('   EXERCISE 1: DATA SCIENCE - WEB ANALYSIS');
    console.log('='.repeat(50));
    console.log('Role: Data Scientist');
    console.log('Task: Analyze web content for embedding pipeline\n');
    
    const analyzer = new WebContentAnalyzer();
    
    // TODO: Uncomment when you've completed the TODO items above
    // await analyzer.fetchAndAnalyze();
    
    // For now, show the scaffolding structure
    console.log('📋 TODO LIST:');
    console.log('1. ✅ Review this starter code structure');
    console.log('2. ❌ Complete fetchWebContent() function');
    console.log('3. ❌ Complete analyzeTextContent() function'); 
    console.log('4. ❌ Complete generateInsights() function');
    console.log('5. ❌ Test with sample URLs');
    console.log('\n💡 Tip: Start by uncommenting the analyzer.fetchAndAnalyze() call above');
    console.log('💡 Then complete each TODO section in order');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { WebContentAnalyzer, DataAnalysisTools };
