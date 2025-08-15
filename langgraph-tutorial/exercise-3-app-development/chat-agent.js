const { StateGraph, END, START } = require("@langchain/langgraph");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ChromaApi, Configuration } = require("chromadb");
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Initialize clients
const bedrockClient = new BedrockRuntimeClient({ 
    region: process.env.AWS_REGION || "us-east-1" 
});

const chroma = new ChromaApi(new Configuration({
    basePath: "http://localhost:8000"
}));

// Agent state for conversation management
class AgentState {
    constructor() {
        this.messages = [];
        this.currentQuery = "";
        this.retrievedContext = [];
        this.response = "";
        this.conversationId = uuidv4();
        this.metadata = {
            searchResults: 0,
            tokensUsed: 0,
            responseTime: 0
        };
    }
}

class RAGChatAgent {
    constructor() {
        this.collectionName = "tech-content-vectors";
        this.collection = null;
        this.graph = null;
        this.conversationHistory = new Map();
        this.initializeAgent();
    }
    
    async initializeAgent() {
        // Check if vector database is ready
        await this.verifyVectorDatabase();
        
        // Create LangGraph agent workflow
        const workflow = new StateGraph(AgentState);
        
        // Define agent nodes
        workflow.addNode("processQuery", this.processQuery.bind(this));
        workflow.addNode("searchVectorDatabase", this.searchVectorDatabase.bind(this));
        workflow.addNode("generateResponse", this.generateResponse.bind(this));
        workflow.addNode("updateMemory", this.updateMemory.bind(this));
        
        // Define agent flow
        workflow.addEdge(START, "processQuery");
        workflow.addEdge("processQuery", "searchVectorDatabase");
        workflow.addEdge("searchVectorDatabase", "generateResponse");
        workflow.addEdge("generateResponse", "updateMemory");
        workflow.addEdge("updateMemory", END);
        
        this.graph = workflow.compile();
        console.log("🤖 RAG Chat Agent initialized");
    }
    
    async verifyVectorDatabase() {
        try {
            const configPath = './vector-db-config.json';
            if (!fs.existsSync(configPath)) {
                throw new Error('Vector database config not found. Run Exercise 2 first.');
            }
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.ready) {
                throw new Error('Vector database not ready. Complete Exercise 2 first.');
            }
            
            console.log(`✅ Vector database ready: ${config.vectorCount} vectors available`);
            
        } catch (error) {
            console.error("❌ Vector database verification failed:", error.message);
            throw error;
        }
    }
    
    async processQuery(state) {
        console.log(`🔍 Processing query: "${state.currentQuery}"`);
        
        // TODO: Add query preprocessing
        // Hints:
        // 1. Clean and normalize the query
        // 2. Extract key terms for better search
        // 3. Check conversation history for context
        // 4. Determine search strategy
        
        try {
            // Basic query cleaning
            const cleanQuery = state.currentQuery.trim().toLowerCase();
            
            // TODO: Add more sophisticated query processing
            // - Extract entities (names, technologies, concepts)
            // - Expand abbreviations (ML -> Machine Learning) 
            // - Add context from conversation history
            
            state.processedQuery = cleanQuery;
            
            console.log(`✅ Query processed: "${state.processedQuery}"`);
            
        } catch (error) {
            console.error("❌ Query processing failed:", error.message);
            state.response = "I'm having trouble understanding your question. Could you rephrase it?";
        }
        
        return state;
    }
    
    async searchVectorDatabase(state) {
        // TODO: Implement semantic search against ChromaDB
        // Hints:
        // 1. Get collection from ChromaDB
        // 2. Query with the processed query text
        // 3. Retrieve top K most similar vectors
        // 4. Extract content and metadata from results
        
        console.log("🔎 Searching vector database...");
        
        try {
            // TODO: Query ChromaDB for similar content
            // const results = await this.collection.query({
            //     queryTexts: [state.processedQuery],
            //     nResults: 5,
            //     include: ["documents", "metadatas", "distances"]
            // });
            
            // For now, create mock search results (replace with actual ChromaDB query)
            const mockResults = {
                documents: [[
                    "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed for every task.",
                    "JavaScript has become increasingly popular for data science tasks, with libraries like TensorFlow.js enabling machine learning directly in browsers.",
                    "AWS Bedrock provides access to foundation models through a unified API, making it easier to integrate AI capabilities into applications."
                ]],
                metadatas: [[
                    { title: "Introduction to Machine Learning", url: "https://example.com/ml-intro", qualityScore: 8.5 },
                    { title: "JavaScript for Data Science", url: "https://example.com/js-datascience", qualityScore: 7.2 },
                    { title: "AWS Bedrock Guide", url: "https://example.com/bedrock", qualityScore: 9.1 }
                ]],
                distances: [[0.2, 0.35, 0.4]]
            };
            
            // Process search results
            if (mockResults.documents[0].length > 0) {
                state.retrievedContext = mockResults.documents[0].map((doc, index) => ({
                    content: doc,
                    metadata: mockResults.metadatas[0][index],
                    similarity: 1 - mockResults.distances[0][index] // Convert distance to similarity
                }));
                
                state.metadata.searchResults = state.retrievedContext.length;
                
                console.log(`✅ Found ${state.retrievedContext.length} relevant documents`);
                state.retrievedContext.forEach((result, i) => {
                    console.log(`  ${i + 1}. ${result.metadata.title} (similarity: ${result.similarity.toFixed(2)})`);
                });
            } else {
                console.log("⚠️  No relevant documents found");
                state.retrievedContext = [];
            }
            
        } catch (error) {
            console.error("❌ Vector search failed:", error.message);
            state.retrievedContext = [];
        }
        
        return state;
    }
    
    async generateResponse(state) {
        // TODO: Generate response using AWS Bedrock Claude with retrieved context
        // Hints:
        // 1. Build prompt with retrieved context
        // 2. Include conversation history if available
        // 3. Call Bedrock Claude model
        // 4. Add source attribution to response
        
        console.log("🧠 Generating response with Claude...");
        
        const startTime = Date.now();
        
        try {
            // Build context-aware prompt
            const contextText = state.retrievedContext
                .map(item => `Source: ${item.metadata.title}\nContent: ${item.content}`)
                .join('\n\n');
            
            const prompt = this.buildRAGPrompt(state.currentQuery, contextText, state.conversationId);
            
            // TODO: Call AWS Bedrock Claude
            // const response = await this.callBedrockClaude(prompt);
            
            // For now, create mock response (replace with actual Bedrock call)
            const response = await this.mockBedrockClaude(prompt, state);
            
            state.response = response;
            state.metadata.responseTime = Date.now() - startTime;
            
            console.log(`✅ Response generated (${state.metadata.responseTime}ms)`);
            
        } catch (error) {
            console.error("❌ Response generation failed:", error.message);
            state.response = "I apologize, but I'm having trouble generating a response right now. Please try again.";
        }
        
        return state;
    }
    
    buildRAGPrompt(query, context, conversationId) {
        // TODO: Create an effective RAG prompt template
        return `You are a helpful AI assistant specializing in technology and machine learning topics. 

Use the following context from relevant documents to answer the user's question. If the context doesn't contain relevant information, say so clearly.

CONTEXT:
${context}

USER QUESTION: ${query}

Please provide a helpful, accurate response based on the context above. Include references to specific sources when possible.

RESPONSE:`;
    }
