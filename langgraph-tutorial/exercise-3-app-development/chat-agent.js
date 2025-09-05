const { StateGraph, END, START } = require("@langchain/langgraph");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ChromaClient, Configuration } = require("chromadb");
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Initialize clients
const bedrockClient = new BedrockRuntimeClient({ 
    region: process.env.AWS_REGION || "us-east-1" 
});

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
        this.chromaClient = null;
        this.useChromaClient = false;
        this.graph = null;
        this.conversationHistory = new Map();
    this.initialized = false; // prevent double init
    this.initializeAgentPromise = this.initializeAgent();
    // In-memory cache for local vector fallback
    this.localVectorIndex = null; // { vectors: [{id, vector: number[], content, metadata}], dim }
    this.embeddingCache = new Map(); // query -> embedding array
    }
    
    async initializeAgent() {
    if (this.initialized) return; // idempotent
        // Try to connect to ChromaDB using ChromaClient (embedded mode)
        try {
            this.chromaClient = new ChromaClient({ path: "./chroma_db" });
            await this.chromaClient.listCollections();
            this.useChromaClient = true;
            console.log("✅ Connected to ChromaDB using ChromaClient (embedded mode)");
        } catch (err) {
            this.useChromaClient = false;
            console.warn("⚠️  Could not connect to ChromaDB with ChromaClient, will use local file storage fallback.");
        }

        // Check if vector database is ready (file-based fallback or ChromaClient)
        await this.verifyVectorDatabase();

        // Create LangGraph agent workflow
        // Define explicit state channels for LangGraph
        const workflow = new StateGraph({
            channels: {
                currentQuery: {},
                processedQuery: {},
                retrievedContext: {},
                response: {},
                conversationId: {},
                metadata: {},
                messages: {} // reserved for future memory features
            }
        });

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
    this.initialized = true;
    }
    
    async verifyVectorDatabase() {
        try {
            if (this.useChromaClient) {
                // Try to get collection info from ChromaClient
                const collections = await this.chromaClient.listCollections();
                const found = collections.find(c => c.name === this.collectionName);
                if (!found) throw new Error(`Collection '${this.collectionName}' not found in ChromaDB`);
                console.log(`✅ Vector database ready (ChromaClient): ${found.count} vectors available`);
            } else {
                // Fallback: check vector-db-config.json
                const configPath = './vector-db-config.json';
                if (!fs.existsSync(configPath)) throw new Error('vector-db-config.json not found');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!config.ready) throw new Error('Vector DB not marked as ready');
                console.log(`✅ Vector database ready (file): ${config.vectorCount} vectors available`);
            }
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
        // Try ChromaClient first, fallback to file-based search
        console.log("🔎 Searching vector database...");
        try {
            let results;
            if (this.useChromaClient) {
                // Use ChromaClient for semantic search (assume collection exists)
                const collection = await this.chromaClient.getCollection({ name: this.collectionName });
                // For demo: use .query() if available, else fallback to mock
                if (collection && collection.query) {
                    results = await collection.query({
                        queryTexts: [state.processedQuery],
                        nResults: 3
                    });
                } else {
                    throw new Error('ChromaClient collection.query not available');
                }
            } else {
                // Improved semantic fallback: load local vectors + compute cosine similarity to embedded query
                const ranked = await this.semanticLocalSearch(state.processedQuery, 3);
                results = {
                    documents: [ranked.map(r => r.content)],
                    metadatas: [ranked.map(r => r.metadata)],
                    // Convert similarity to pseudo-distance (1 - cosine) for consistency
                    distances: [ranked.map(r => 1 - r.similarity)]
                };
            }
            // Process search results
            if (results.documents[0].length > 0) {
                state.retrievedContext = results.documents[0].map((content, i) => ({
                    content,
                    metadata: results.metadatas[0][i],
                    similarity: results.distances[0][i]
                }));
                state.metadata.searchResults = results.documents[0].length;
                console.log(`✅ Found ${state.retrievedContext.length} relevant documents`);
                state.retrievedContext.forEach((result, i) => {
                    console.log(`  ${i + 1}. ${result.metadata.title} (similarity: ${result.similarity.toFixed(2)})`);
                });
            } else {
                console.log("⚠️  No relevant documents found");
                state.retrievedContext = [];
                state.metadata.searchResults = 0;
            }
        } catch (error) {
            console.error("❌ Vector search failed:", error.message);
            state.retrievedContext = [];
            state.metadata.searchResults = 0;
        }
        return state;
    }

    /* ================= Semantic Fallback Helpers ================= */
    async ensureLocalVectorIndex() {
        if (this.localVectorIndex) return this.localVectorIndex;
        // Prefer local exercise-3 copy; fallback to exercise-2 path if needed
        const candidatePaths = [
            './chroma_db/tech-content-vectors.json',
            '../exercise-2-data-engineering/chroma_db/tech-content-vectors.json',
            '../exercise-2-data-engineering/chroma_db/tech-content-vectors.json'.replace('exercise-3-app-development/', 'exercise-2-data-engineering/')
        ];
        let foundPath = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) { foundPath = p; break; }
        }
        if (!foundPath) throw new Error('Local vector file tech-content-vectors.json not found in expected paths');
        const raw = JSON.parse(fs.readFileSync(foundPath, 'utf8'));
        // Support two possible shapes: { embeddings: [{vector, document, metadata}] } OR flat array
        let records = [];
        if (Array.isArray(raw)) {
            records = raw;
        } else if (raw.embeddings) {
            records = raw.embeddings.map(e => ({
                id: e.id,
                vector: e.vector || e.embedding || [],
                content: e.document || e.content || '',
                metadata: e.metadata || {}
            }));
        } else if (raw.vectors) {
            records = raw.vectors;
        }
        if (!records.length) throw new Error('No vectors found in local vector file');
        const dim = records[0].vector.length;
        // Filter out malformed
        records = records.filter(r => Array.isArray(r.vector) && r.vector.length === dim);
        this.localVectorIndex = { vectors: records, dim };
        console.log(`📄 Loaded ${records.length} local vectors (dim=${dim}) for semantic fallback`);
        return this.localVectorIndex;
    }

    async embedQuery(text) {
        const key = text;
        if (this.embeddingCache.has(key)) return this.embeddingCache.get(key);
        // Allow opting out (use keyword fallback) via env var
        if (process.env.SKIP_EMBEDDING_FALLBACK === '1') {
            return null;
        }
        try {
            const body = JSON.stringify({ inputText: text });
            const command = new InvokeModelCommand({
                modelId: process.env.BEDROCK_EMBED_MODEL || 'amazon.titan-embed-text-v2',
                contentType: 'application/json',
                accept: 'application/json',
                body
            });
            const response = await bedrockClient.send(command);
            const payload = JSON.parse(new TextDecoder().decode(response.body));
            const embedding = payload.embedding || payload.Embeddings || payload.vector;
            if (!embedding || !Array.isArray(embedding)) throw new Error('No embedding array returned');
            this.embeddingCache.set(key, embedding);
            return embedding;
        } catch (err) {
            console.warn('⚠️  Bedrock embedding failed, falling back to keyword similarity:', err.message);
            return null; // Signal to use keyword scoring
        }
    }

    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return -1;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            const x = a[i];
            const y = b[i];
            dot += x * y;
            na += x * x;
            nb += y * y;
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-12;
        return dot / denom;
    }

    keywordScore(query, text) {
        const qTerms = [...new Set(query.split(/\W+/).filter(Boolean))];
        const lower = text.toLowerCase();
        let hits = 0;
        for (const t of qTerms) if (lower.includes(t)) hits++;
        return hits / (qTerms.length || 1);
    }

    async semanticLocalSearch(query, k = 3) {
        const index = await this.ensureLocalVectorIndex();
        const queryEmbedding = await this.embedQuery(query);
        let scored;
        if (queryEmbedding && queryEmbedding.length === index.dim) {
            scored = index.vectors.map(r => ({
                ...r,
                similarity: this.cosineSimilarity(queryEmbedding, r.vector)
            }));
        } else {
            // Fallback to keyword scoring if embedding unavailable
            scored = index.vectors.map(r => ({
                ...r,
                similarity: this.keywordScore(query.toLowerCase(), (r.content || ''))
            }));
        }
        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, k);
    }
    /* ============================================================= */
    
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
