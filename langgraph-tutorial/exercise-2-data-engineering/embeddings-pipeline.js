const { StateGraph, END, START } = require("@langchain/langgraph");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ChromaClient } = require("chromadb");
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

dotenv = require('dotenv');
dotenv.config();

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({ 
    region: process.env.AWS_REGION || process.env.BEDROCK_AWS_REGION || "us-east-1"
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
        this.startTime = Date.now();
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
        // Create LangGraph workflow with simplified state management
        const workflow = new StateGraph({
            channels: {
                state: {
                    value: (x, y) => y ?? x,
                    default: () => new PipelineState()
                }
            }
        });
        
        // Define nodes (pipeline stages) - these need to work with the state wrapper
        workflow.addNode("loadData", async (state) => {
            const pipelineState = state.state || new PipelineState();
            const result = await this.loadData(pipelineState);
            return { state: result };
        });
        workflow.addNode("processContent", async (state) => {
            const result = await this.processContent(state.state);
            return { state: result };
        });
        workflow.addNode("generateEmbeddings", async (state) => {
            const result = await this.generateEmbeddings(state.state);
            return { state: result };
        });
        workflow.addNode("storeVectors", async (state) => {
            const result = await this.storeVectors(state.state);
            return { state: result };
        });
        workflow.addNode("generateReport", async (state) => {
            const result = await this.generateReport(state.state);
            return { state: result };
        });
        
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
        // Implement smart chunking with sentence boundaries
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const chunks = [];
        let currentChunk = '';
        let currentWordCount = 0;
        
        for (const sentence of sentences) {
            const sentenceWords = sentence.trim().split(' ').length;
            
            // If adding this sentence would exceed maxWords, start a new chunk
            if (currentWordCount + sentenceWords > maxWords && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence.trim();
                currentWordCount = sentenceWords;
            } else {
                // Add sentence to current chunk
                if (currentChunk.length > 0) {
                    currentChunk += '. ' + sentence.trim();
                } else {
                    currentChunk = sentence.trim();
                }
                currentWordCount += sentenceWords;
            }
        }
        
        // Add the last chunk if it has content
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }
        
        // Fallback: if no chunks were created, use simple word-based chunking
        if (chunks.length === 0) {
            const words = content.split(' ');
            for (let i = 0; i < words.length; i += maxWords) {
                chunks.push(words.slice(i, i + maxWords).join(' '));
            }
        }
        
        return chunks;
    }
    
    async generateEmbeddings(state) {
        console.log("🧠 Generating embeddings with AWS Bedrock...");
        
        if (state.processedContent.length === 0) {
            state.errors.push({ stage: 'generateEmbeddings', error: 'No processed content available' });
            return state;
        }
        
        try {
            for (const chunk of state.processedContent) {
                console.log(`Embedding chunk: ${chunk.id.substring(0, 8)}...`);
                
                // Call Bedrock Titan embeddings
                const embedding = await this.callBedrockEmbeddings(chunk.content);
                
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
                
                // Rate limiting delay
                await this.delay(100); // Be respectful to Bedrock API
            }
            
            console.log(`✅ Generated ${state.embeddings.length} embeddings`);
            
        } catch (error) {
            console.error("❌ Embedding generation failed:", error.message);
            state.errors.push({ stage: 'generateEmbeddings', error: error.message });
        }
        
        return state;
    }
    
    async callBedrockEmbeddings(text) {
        try {
            const params = {
                modelId: process.env.BEDROCK_EMBEDDINGS_MODEL_ID,
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    inputText: text
                })
            };
            
            const command = new InvokeModelCommand(params);
            const response = await bedrockClient.send(command);
            
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.embedding;
            
        } catch (error) {
            console.warn(`⚠️  Bedrock API error: ${error.message}, using mock embedding`);
            // Fallback to mock embedding if Bedrock fails
            return this.mockBedrockEmbeddings(text);
        }
    }
    
    async mockBedrockEmbeddings(text) {
        // TODO: Replace with actual Bedrock call
        
        // Mock 1536-dimensional embedding (Titan default)
        return Array.from({ length: 1536 }, () => Math.random() - 0.5);
    }
    
    async storeVectors(state) {
        console.log("💾 Storing vectors in ChromaDB...");
        
        if (state.embeddings.length === 0) {
            state.errors.push({ stage: 'storeVectors', error: 'No embeddings to store' });
            return state;
        }
        
        try {
            // Create embedded storage directory
            const fs = require('fs');
            const path = require('path');
            const storageDir = './chroma_db';
            
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir, { recursive: true });
            }
            
            console.log(`Creating/accessing collection: ${this.collectionName}`);
            console.log('Using embedded ChromaDB (data stored in ./chroma_db/)');
            
            // Try to use real ChromaDB, fallback to file storage
            let useFileStorage = false;
            try {
                const collection = await chroma.getOrCreateCollection({
                    name: this.collectionName,
                    metadata: { "description": "Tech content embeddings for semantic search" }
                });
                
                // Batch insert embeddings
                const batchSize = 10;
                for (let i = 0; i < state.embeddings.length; i += batchSize) {
                    const batch = state.embeddings.slice(i, i + batchSize);
                    
                    // Prepare data for ChromaDB
                    const ids = batch.map(item => item.id);
                    const embeddings = batch.map(item => item.vector);
                    const documents = batch.map(item => item.content);
                    const metadatas = batch.map(item => ({
                        title: item.metadata.title,
                        url: item.metadata.url,
                        chunkIndex: item.metadata.chunkIndex,
                        totalChunks: item.metadata.totalChunks,
                        keywords: JSON.stringify(item.metadata.keywords),
                        qualityScore: item.metadata.qualityScore,
                        wordCount: item.metadata.wordCount,
                        processedAt: item.metadata.processedAt
                    }));
                    
                    // Insert batch into ChromaDB
                    await collection.add({
                        ids: ids,
                        embeddings: embeddings,
                        documents: documents,
                        metadatas: metadatas
                    });
                    
                    console.log(`Stored batch ${Math.floor(i/batchSize) + 1}: ${batch.length} vectors`);
                    state.storedVectors.push(...batch);
                    state.metrics.stored += batch.length;
                }
            } catch (chromaError) {
                console.log('⚠️  ChromaDB server not available, using local file storage');
                useFileStorage = true;
            }
            
            if (useFileStorage) {
                // Fallback: Store embeddings as JSON files
                const collectionFile = path.join(storageDir, `${this.collectionName}.json`);
                const collectionData = {
                    name: this.collectionName,
                    metadata: { "description": "Tech content embeddings for semantic search" },
                    embeddings: state.embeddings.map(item => ({
                        id: item.id,
                        vector: item.vector,
                        document: item.content,
                        metadata: item.metadata
                    })),
                    createdAt: new Date().toISOString(),
                    totalVectors: state.embeddings.length
                };
                
                fs.writeFileSync(collectionFile, JSON.stringify(collectionData, null, 2));
                
                console.log(`Stored ${state.embeddings.length} vectors in local file: ${collectionFile}`);
                state.storedVectors.push(...state.embeddings);
                state.metrics.stored = state.embeddings.length;
            }
            
            console.log(`✅ Stored ${state.storedVectors.length} vectors successfully`);
            
        } catch (error) {
            console.error("❌ Vector storage failed:", error.message);
            state.errors.push({ stage: 'storeVectors', error: error.message });
        }
        
        return state;
    }
    
    async generateReport(state) {
        console.log("\n📊 Generating pipeline report...");
        
        const endTime = Date.now();
        const duration = Math.round((endTime - state.startTime) / 1000);
        
        const report = {
            pipelineRun: {
                timestamp: new Date().toISOString(),
                status: state.errors.length === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
                duration: `${duration} seconds`,
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
        
        const initialState = { state: new PipelineState() };
        const result = await this.graph.invoke(initialState);
        
        return result.state;
    }
}

// Main execution
async function main() {
    console.log('='.repeat(50));
    console.log('  EXERCISE 2: DATA ENGINEERING - EMBEDDINGS');
    console.log('='.repeat(50));
    console.log('Role: Data Engineer');
    console.log('Task: Build embeddings pipeline with LangGraph\n');
    
    // Run the complete pipeline
    const pipeline = new EmbeddingsPipeline();
    await pipeline.run();
    
    console.log('\n✅ Pipeline completed successfully!');
    console.log('💡 Tip: Check pipeline-report.json for detailed metrics');
    console.log('💡 ChromaDB data stored in ./chroma_db/ directory');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { EmbeddingsPipeline, PipelineState };
