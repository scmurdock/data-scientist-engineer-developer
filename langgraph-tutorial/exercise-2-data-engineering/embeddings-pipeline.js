const { StateGraph, END, START } = require("@langchain/langgraph");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ChromaClient } = require("chromadb");
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
dotenv = require('dotenv');
dotenv.config();


// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({ 
    region: process.env.BEDROCK_AWS_REGION || "us-east-1",
    region: process.env.AWS_REGION || "us-east-1" 
});

// Initialize ChromaDB client in embedded mode (like SQLite)
const chroma = new ChromaClient();

// LangGraph state interface for our pipeline
class PipelineState {
    constructor() {
        this.inputData = null;
        this.processedContent = [];
        this.embeddings = [];
        this.storedVectors = [];
        this.errors = [];
        this.metrics = {
            processed: 0,
            embedded: 0,
            stored: 0,
            failed: 0
        };
    }
}

class EmbeddingsPipeline {
    constructor() {
        this.collectionName = "tech-content-vectors";
        this.graph = null;
        this.initializePipeline();
    }
    
    initializePipeline() {
        // Create LangGraph workflow
        const workflow = new StateGraph(PipelineState);
        
        // Define nodes (pipeline stages)
        workflow.addNode("loadData", this.loadData.bind(this));
        workflow.addNode("processContent", this.processContent.bind(this));
        workflow.addNode("generateEmbeddings", this.generateEmbeddings.bind(this));
        workflow.addNode("storeVectors", this.storeVectors.bind(this));
        workflow.addNode("generateReport", this.generateReport.bind(this));
        
        // Define edges (pipeline flow)
        workflow.addEdge(START, "loadData");
        workflow.addEdge("loadData", "processContent");
        workflow.addEdge("processContent", "generateEmbeddings");
        workflow.addEdge("generateEmbeddings", "storeVectors");
        workflow.addEdge("storeVectors", "generateReport");
        workflow.addEdge("generateReport", END);
        
        this.graph = workflow.compile();
    }
    
    async loadData(state) {
        console.log("📂 Loading data from Data Science analysis...");
        
        try {
            const dataPath = './data-science-output.json';
            if (!fs.existsSync(dataPath)) {
                throw new Error('Data Science output not found. Run Exercise 1 first.');
            }
            
            const inputData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            state.inputData = inputData;
            
            console.log(`✅ Loaded ${inputData.contentData?.length || 0} articles from analysis`);
            
        } catch (error) {
            console.error("❌ Failed to load input data:", error.message);
            state.errors.push({ stage: 'loadData', error: error.message });
        }
        
        return state;
    }
    
    async processContent(state) {
        // TODO: Implement content processing for embedding pipeline
        // Hints:
        // 1. Take content from state.inputData.contentData
        // 2. Clean and chunk content for optimal embedding
        // 3. Add metadata (title, url, keywords, etc.)
        // 4. Handle different content types and sizes
        
        console.log("🔄 Processing content for embeddings...");
        
        if (!state.inputData?.contentData) {
            state.errors.push({ stage: 'processContent', error: 'No content data available' });
            return state;
        }
        
        try {
            for (const article of state.inputData.contentData) {
                console.log(`Processing: ${article.title}`);
                
                // TODO: Implement text chunking strategy
                // const chunks = this.chunkContent(article.content, 500); // 500 words per chunk
                
                // For now, create simple chunks (replace with actual implementation)
                const chunks = this.createSimpleChunks(article.content, 500);
                
                chunks.forEach((chunk, index) => {
                    // TODO: Create rich metadata for each chunk
                    const processedChunk = {
                        id: uuidv4(),
                        content: chunk,
                        metadata: {
                            title: article.title,
                            url: article.url,
                            chunkIndex: index,
                            totalChunks: chunks.length,
                            keywords: article.topKeywords,
                            qualityScore: article.qualityScore,
                            wordCount: chunk.split(' ').length,
                            processedAt: new Date().toISOString()
                        }
                    };
                    
                    state.processedContent.push(processedChunk);
                });
                
                state.metrics.processed++;
            }
            
            console.log(`✅ Processed ${state.processedContent.length} content chunks`);
            
        } catch (error) {
            console.error("❌ Content processing failed:", error.message);
            state.errors.push({ stage: 'processContent', error: error.message });
            state.metrics.failed++;
        }
        
        return state;
    }
    
    createSimpleChunks(content, maxWords) {
        // TODO: Implement smart chunking (sentence boundaries, etc.)
        const words = content.split(' ');
        const chunks = [];
        
        for (let i = 0; i < words.length; i += maxWords) {
            chunks.push(words.slice(i, i + maxWords).join(' '));
        }
        
        return chunks;
    }
    
    async generateEmbeddings(state) {
        // TODO: Generate embeddings using AWS Bedrock Titan
        // Hints:
        // 1. Use Bedrock InvokeModelCommand with Titan embeddings
        // 2. Handle rate limiting with retries
        // 3. Batch requests for efficiency
        // 4. Validate embedding dimensions
        
        console.log("🧠 Generating embeddings with AWS Bedrock...");
        
        if (state.processedContent.length === 0) {
            state.errors.push({ stage: 'generateEmbeddings', error: 'No processed content available' });
            return state;
        }
        
        try {
            for (const chunk of state.processedContent) {
                console.log(`Embedding chunk: ${chunk.id.substring(0, 8)}...`);
                
                // TODO: Call Bedrock Titan embeddings
                
                // For now, create mock embeddings (replace with actual Bedrock call)
                const embedding = await this.mockBedrockEmbeddings(chunk.content);
                
                if (embedding) {
                    state.embeddings.push({
                        id: chunk.id,
                        vector: embedding,
                        content: chunk.content,
                        metadata: chunk.metadata
                    });
                    state.metrics.embedded++;
                } else {
                    state.metrics.failed++;
                }
                
                // TODO: Add rate limiting delay
                await this.delay(100); // Be respectful to Bedrock API
            }
            
            console.log(`✅ Generated ${state.embeddings.length} embeddings`);
            
        } catch (error) {
            console.error("❌ Embedding generation failed:", error.message);
            state.errors.push({ stage: 'generateEmbeddings', error: error.message });
        }
        
        return state;
    }
    
    async mockBedrockEmbeddings(text) {
        // TODO: Replace with actual Bedrock call
        
        // Mock 1536-dimensional embedding (Titan default)
        return Array.from({ length: 1536 }, () => Math.random() - 0.5);
    }
    
    async storeVectors(state) {
        // TODO: Store embeddings in ChromaDB with metadata
        // Hints:
        // 1. Create/get collection with proper configuration
        // 2. Batch insert for better performance
        // 3. Include all metadata for search functionality
        // 4. Validate storage success
        
        console.log("💾 Storing vectors in ChromaDB...");
        
        if (state.embeddings.length === 0) {
            state.errors.push({ stage: 'storeVectors', error: 'No embeddings to store' });
            return state;
        }
        
        try {
            // TODO: Initialize ChromaDB collection
            
            // For now, simulate successful storage
            console.log(`Creating collection: ${this.collectionName}`);
            
            // TODO: Batch insert embeddings
            const batchSize = 10;
            for (let i = 0; i < state.embeddings.length; i += batchSize) {
                const batch = state.embeddings.slice(i, i + batchSize);
                
                // TODO: Implement actual ChromaDB insertion

                
                console.log(`Stored batch ${Math.floor(i/batchSize) + 1}: ${batch.length} vectors`);
                state.storedVectors.push(...batch);
                state.metrics.stored += batch.length;
            }
            
            console.log(`✅ Stored ${state.storedVectors.length} vectors in ChromaDB`);
            
        } catch (error) {
            console.error("❌ Vector storage failed:", error.message);
            state.errors.push({ stage: 'storeVectors', error: error.message });
        }
        
        return state;
    }
    
    async generateReport(state) {
        console.log("\n📊 Generating pipeline report...");
        
        const report = {
            pipelineRun: {
                timestamp: new Date().toISOString(),
                status: state.errors.length === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
                duration: '45 seconds', // TODO: Calculate actual duration
            },
            metrics: state.metrics,
            dataQuality: {
                inputArticles: state.inputData?.contentData?.length || 0,
                processedChunks: state.processedContent.length,
                successfulEmbeddings: state.embeddings.length,
                storedVectors: state.storedVectors.length,
                errorRate: state.errors.length / Math.max(1, state.processedContent.length)
            },
            vectorDatabase: {
                collection: this.collectionName,
                totalVectors: state.storedVectors.length,
                dimensions: 1536, // Titan embedding size
                ready: state.storedVectors.length > 0
            },
            errors: state.errors,
            nextSteps: [
                "Vector database ready for semantic search",
                "Proceed to Exercise 3 for chat agent development",
                "Connection details exported to exercise-3-app-development"
            ]
        };
        
        // Export for Exercise 3
        fs.writeFileSync('../exercise-3-app-development/vector-db-config.json', 
            JSON.stringify({
                collection: this.collectionName,
                vectorCount: state.storedVectors.length,
                ready: true,
                createdAt: new Date().toISOString()
            }, null, 2));
        
        // Save pipeline report
        fs.writeFileSync('./pipeline-report.json', JSON.stringify(report, null, 2));
        
        this.displayReport(report);
        state.report = report;
        
        return state;
    }
    
    displayReport(report) {
        console.log('\n=== EMBEDDINGS PIPELINE RESULTS ===');
        console.log(`Status: ${report.pipelineRun.status}`);
        console.log(`Processed: ${report.metrics.processed} articles`);
        console.log(`Generated: ${report.metrics.embedded} embeddings`);
        console.log(`Stored: ${report.metrics.stored} vectors`);
        console.log(`Errors: ${report.errors.length}`);
        console.log(`Quality Score: ${(10 - report.dataQuality.errorRate * 10).toFixed(1)}/10`);
        console.log(`Ready for: Chat agent deployment`);
        console.log('=====================================\n');
        
        if (report.errors.length > 0) {
            console.log('⚠️  Errors encountered:');
            report.errors.forEach((error, i) => {
                console.log(`${i + 1}. ${error.stage}: ${error.error}`);
            });
            console.log();
        }
        
        console.log('📁 Output files generated:');
        console.log('  - pipeline-report.json (detailed metrics)');
        console.log('  - ../exercise-3-app-development/vector-db-config.json');
    }
    
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async run() {
        console.log('🚀 Starting embeddings pipeline...\n');
        
        const initialState = new PipelineState();
        const finalState = await this.graph.invoke(initialState);
        
        return finalState;
    }
}

// Main execution
async function main() {
    console.log('='.repeat(50));
    console.log('  EXERCISE 2: DATA ENGINEERING - EMBEDDINGS');
    console.log('='.repeat(50));
    console.log('Role: Data Engineer');
    console.log('Task: Build embeddings pipeline with LangGraph\n');
    
    // TODO: Uncomment when you've completed the TODO items above
    // const pipeline = new EmbeddingsPipeline();
    // await pipeline.run();
    
    // For now, show the scaffolding structure
    console.log('📋 TODO LIST:');
    console.log('1. ✅ Review LangGraph pipeline structure');
    console.log('2. ❌ Complete processContent() node');
    console.log('3. ❌ Complete generateEmbeddings() with Bedrock');
    console.log('4. ❌ Complete storeVectors() with ChromaDB');
    console.log('5. ❌ Test end-to-end pipeline');
    console.log('\n💡 Tip: Make sure Exercise 1 output file exists first');
    console.log('💡 Configure AWS credentials: aws configure');
    console.log('💡 Start ChromaDB: docker run -p 8000:8000 chromadb/chroma');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { EmbeddingsPipeline, PipelineState };
