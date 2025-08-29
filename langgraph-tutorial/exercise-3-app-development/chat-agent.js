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
    
    async mockBedrockClaude(prompt, state) {
        // TODO: Replace with actual Bedrock Claude call
        
        // Mock response with source attribution
        if (state.retrievedContext.length > 0) {
            const sources = state.retrievedContext.map(item => item.metadata.title).join(", ");
            return `Based on the available documentation, here's what I can tell you about your question:

${this.generateMockAnswer(state.currentQuery)}

This information is sourced from: ${sources}

Would you like me to elaborate on any specific aspect?`;
        } else {
            return "I don't have specific information about that topic in my current knowledge base. Could you try rephrasing your question or asking about a different aspect?";
        }
    }
    
    generateMockAnswer(query) {
        // Simple mock responses based on query content
        const lowerQuery = query.toLowerCase();
        
        if (lowerQuery.includes('machine learning') || lowerQuery.includes('ml')) {
            return "Machine learning is a powerful subset of AI that allows systems to learn from data without being explicitly programmed. It's widely used in applications ranging from recommendation systems to autonomous vehicles.";
        } else if (lowerQuery.includes('javascript') || lowerQuery.includes('js')) {
            return "JavaScript has evolved significantly and now supports data science tasks through libraries like TensorFlow.js, D3.js for visualization, and various statistical computing packages.";
        } else if (lowerQuery.includes('aws') || lowerQuery.includes('bedrock')) {
            return "AWS Bedrock provides managed access to foundation models from companies like Anthropic, AI21, and Amazon, making it easier to integrate AI capabilities into applications without managing infrastructure.";
        } else {
            return "This appears to be a technology-related question. The available documentation contains information about various tech topics, tools, and best practices.";
        }
    }
    
    async updateMemory(state) {
        console.log("💾 Updating conversation memory...");
        
        // TODO: Implement conversation memory management
        // Hints:
        // 1. Store query and response in conversation history
        // 2. Implement memory limits (max turns, token limits)
        // 3. Track conversation context for future queries
        // 4. Update agent metadata
        
        try {
            // Add to conversation history
            const conversationTurn = {
                timestamp: new Date().toISOString(),
                query: state.currentQuery,
                response: state.response,
                contextUsed: state.retrievedContext.length,
                sources: state.retrievedContext.map(item => item.metadata.title)
            };
            
            // TODO: Implement proper memory management
            if (!this.conversationHistory.has(state.conversationId)) {
                this.conversationHistory.set(state.conversationId, []);
            }
            
            const history = this.conversationHistory.get(state.conversationId);
            history.push(conversationTurn);
            
            // Keep last 10 turns (memory limit)
            if (history.length > 10) {
                history.shift();
            }
            
            console.log(`✅ Memory updated (${history.length} turns stored)`);
            
        } catch (error) {
            console.error("❌ Memory update failed:", error.message);
        }
        
        return state;
    }
    
    async chat(query, conversationId = null) {
        const state = new AgentState();
        state.currentQuery = query;
        state.conversationId = conversationId || uuidv4();
        
        console.log(`\n💬 New chat request: "${query}"`);
        
        const finalState = await this.graph.invoke(state);
        
        return {
            response: finalState.response,
            conversationId: finalState.conversationId,
            metadata: finalState.metadata,
            sources: finalState.retrievedContext.map(item => ({
                title: item.metadata.title,
                url: item.metadata.url,
                similarity: item.similarity
            }))
        };
    }
    
    getConversationHistory(conversationId) {
        return this.conversationHistory.get(conversationId) || [];
    }
}

// Main execution for testing
async function main() {
    console.log('='.repeat(50));
    console.log('   EXERCISE 3: APP DEVELOPMENT - CHAT AGENT');
    console.log('='.repeat(50));
    console.log('Role: Application Developer');
    console.log('Task: Build RAG chat agent with LangGraph\n');
    
    try {
        // TODO: Uncomment when you've completed the TODO items above
        // const agent = new RAGChatAgent();
        // 
        // // Test the agent
        // const testQuery = "What is machine learning?";
        // const result = await agent.chat(testQuery);
        // 
        // console.log(`\nQ: ${testQuery}`);
        // console.log(`A: ${result.response}`);
        // console.log(`Sources: ${result.sources.map(s => s.title).join(', ')}`);
        
        // For now, show the scaffolding structure
        console.log('📋 TODO LIST:');
        console.log('1. ✅ Review LangGraph agent architecture');
        console.log('2. ❌ Complete searchVectorDatabase() function');
        console.log('3. ❌ Complete generateResponse() with Bedrock');
        console.log('4. ❌ Complete updateMemory() for conversations');
        console.log('5. ❌ Test chat functionality');
        console.log('\n💡 Tip: Make sure ChromaDB is running and Exercise 2 completed');
        console.log('💡 Test individual methods before the full agent');
        
    } catch (error) {
        console.error('❌ Agent initialization failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Run Exercise 2 first to create vector database');
        console.log('2. Start ChromaDB: docker run -p 8000:8000 chromadb/chroma');
        console.log('3. Configure AWS credentials');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { RAGChatAgent, AgentState };
