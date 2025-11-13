const { StateGraph, END, START } = require("@langchain/langgraph");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ChromaClient } = require("chromadb");
const fs = require('fs');
const path = require('path');
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
                const configPath = path.join(__dirname, 'vector-db-config.json');
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
        
        // Query preprocessing & lightweight enrichment
        // Steps:
        // 1. Normalize query (trim, lowercase)
        // 2. Remove stopwords for a distilled search form
        // 3. Expand common abbreviations (e.g., ML -> machine learning)
        // 4. Pull recent conversation turns for implicit context (last 3)
        // 5. Decide a search strategy hint (keyword vs semantic) based on length / presence of tech terms
        
        try {
            const raw = state.currentQuery || '';
            const cleanQuery = raw.trim().toLowerCase();

            const abbreviationMap = {
                'ml': 'machine learning',
                'ai': 'artificial intelligence',
                'llm': 'large language model',
                'rag': 'retrieval augmented generation'
            };

            const stopwords = new Set(['the','a','an','and','or','in','on','for','to','is','are','what','how','of','explain','tell','me','about','with']);
            const tokens = cleanQuery.split(/[^a-z0-9+]+/).filter(Boolean);
            const expandedTokens = tokens.flatMap(t => abbreviationMap[t] ? abbreviationMap[t].split(' ') : [t]);
            const keyTerms = expandedTokens.filter(t => !stopwords.has(t) && t.length > 2);

            // Basic entity/tech extraction (heuristic: camelCase / presence of digits / known tech terms)
            const techLexicon = ['python','javascript','node','aws','bedrock','lambda','vector','embedding','chroma','semantic','similarity','machine','learning','model','dataset'];
            const entities = [...new Set(keyTerms.filter(t => techLexicon.includes(t)))];

            // Pull short conversation context (recent queries) if available
            let historyContext = '';
            if (this.conversationHistory.has(state.conversationId)) {
                const hist = this.conversationHistory.get(state.conversationId);
                const recent = hist.slice(-3).map(h => h.query).join(' | ');
                if (recent) historyContext = recent;
            }

            // Form processed query (boost entities, unify)
            const processed = [...keyTerms];
            // Add entities again to weight them (simple heuristic)
            entities.forEach(e => processed.push(e));
            let processedQuery = processed.join(' ').trim();

            // If very short query & we have history context, append hint
            if (processedQuery.split(' ').length < 3 && historyContext) {
                processedQuery = processedQuery + ' ' + historyContext;
            }

            state.processedQuery = processedQuery || cleanQuery || raw;
            state.metadata.queryTerms = keyTerms.length;
            state.metadata.entities = entities.length;
            
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
        // Prefer local exercise-3 copy (relative to this file); fallback to exercise-2 path if needed
        const candidatePaths = [
            path.join(__dirname, 'chroma_db', 'tech-content-vectors.json'),
            path.join(__dirname, '..', 'exercise-2-data-engineering', 'chroma_db', 'tech-content-vectors.json'),
            path.join(process.cwd(), 'exercise-2-data-engineering', 'chroma_db', 'tech-content-vectors.json')
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
        console.log("🧠 Generating response with Claude...");
        
        const startTime = Date.now();
        
        try {
            // Build context-aware prompt
            const contextText = state.retrievedContext
                .map(item => `Source: ${item.metadata.title}\nContent: ${item.content}`)
                .join('\n\n');
            
            const prompt = this.buildRAGPrompt(state.currentQuery, contextText, state.conversationId);
            
            // Try real Bedrock call; fallback to mock
            let response;
            try {
                if (process.env.USE_MOCK_BEDROCK === '1') {
                    throw new Error('Mock forced via USE_MOCK_BEDROCK');
                }
                response = await this.invokeClaude(prompt, state);
            } catch (bedrockErr) {
                console.warn('⚠️  Bedrock generation failed, using mock response:', bedrockErr.message);
                response = await this.mockBedrockClaude(prompt, state);
            }
            
            state.response = response;
            state.metadata.responseTime = Date.now() - startTime;
            // Naive token accounting
            const promptTokens = prompt.split(/\s+/).length;
            const respTokens = state.response.split(/\s+/).length;
            state.metadata.tokensUsed += promptTokens + respTokens;
            
            console.log(`✅ Response generated (${state.metadata.responseTime}ms)`);
            
        } catch (error) {
            console.error("❌ Response generation failed:", error.message);
            state.response = "I apologize, but I'm having trouble generating a response right now. Please try again.";
        }
        
        return state;
    }
    
    buildRAGPrompt(query, context, conversationId) {
        // Build a structured RAG prompt with instructions & safety
        // Include short conversation history for continuity
        let historySnippet = '';
        if (this.conversationHistory.has(conversationId)) {
            const hist = this.conversationHistory.get(conversationId).slice(-5); // last 5 turns
            if (hist.length) {
                historySnippet = hist.map(h => `User: ${h.query}\nAssistant: ${h.response.split('\n')[0]}`)
                    .join('\n---\n');
            }
        }

        return `SYSTEM ROLE: You are a concise, accurate AI assistant specializing in software engineering, data, cloud, and machine learning. You strictly use supplied context; if unsure or absent, you say you don't know.

CONTEXT DOCUMENTS (Topical excerpts with titles):\n${context || '<<NO RELEVANT CONTEXT FOUND>>'}

RECENT CONVERSATION (for continuity, do not repeat):\n${historySnippet || '<<FIRST TURN OR NO PRIOR CONTEXT RETAINED>>'}

USER QUESTION: ${query}

REQUIREMENTS:
1. If context supports the answer, cite sources by title in parentheses.
2. If answer is partially supported, clearly separate supported vs general knowledge.
3. If context lacks answer, explicitly state that and offer a clarifying follow-up question.
4. Keep answer under ~200 words unless user asks for more depth.
5. Never fabricate sources.

FINAL ANSWER:`;
    }
    
    async mockBedrockClaude(prompt, state) {
        
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
    
    async invokeClaude(prompt, state) {
        const modelId = process.env.BEDROCK_CLAUDE_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0';
        const maxTokens = Number(process.env.CLAUDE_MAX_TOKENS || 512);
        const body = JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: maxTokens,
            messages: [
                { role: 'user', content: [ { type: 'text', text: prompt } ] }
            ]
        });
        const command = new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body
        });
        const response = await bedrockClient.send(command);
        const json = JSON.parse(new TextDecoder().decode(response.body));
        // Claude Bedrock messages return content array
        if (json.content && Array.isArray(json.content)) {
            const textPart = json.content.find(p => p.type === 'text');
            if (textPart) return textPart.text.trim();
        }
        // Fallback paths
        return (json.output_text || json.completion || JSON.stringify(json)).trim();
    }

    async updateMemory(state) {
        console.log("💾 Updating conversation memory...");
        
        // Conversation memory management
        // 1. Persist turn
        // 2. Enforce max turns & soft token budget
        // 3. Track aggregate stats
        // 4. Provide future context via processQuery / buildRAGPrompt
        
        try {
            // Add to conversation history
            const conversationTurn = {
                timestamp: new Date().toISOString(),
                query: state.currentQuery,
                response: state.response,
                contextUsed: state.retrievedContext.length,
                sources: state.retrievedContext.map(item => item.metadata.title)
            };
            
            if (!this.conversationHistory.has(state.conversationId)) {
                this.conversationHistory.set(state.conversationId, []);
            }
            
            const history = this.conversationHistory.get(state.conversationId);
            history.push(conversationTurn);
            
            // Limit: keep last 12 turns
            if (history.length > 12) history.splice(0, history.length - 12);

            // Soft token pruning (approx) if conversation grows (> 4000 tokens approx)
            const approxTokens = history.reduce((acc, t) => acc + t.query.split(/\s+/).length + t.response.split(/\s+/).length, 0);
            if (approxTokens > 4000) {
                // Drop oldest until under threshold * 0.8
                while (history.length > 1 && history.reduce((acc, t) => acc + t.query.split(/\s+/).length + t.response.split(/\s+/).length, 0) > 3200) {
                    history.shift();
                }
            }

            state.metadata.turns = history.length;
            state.metadata.totalSources = history.reduce((acc, t) => acc + t.contextUsed, 0);
            
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
        const agent = new RAGChatAgent();
        if (agent.initializeAgent && agent.initializeAgent.constructor.name === 'AsyncFunction') {
            await agent.initializeAgent();
        }
        const testQuery = "What is machine learning?";
        const result = await agent.chat(testQuery);
        console.log(`\nQ: ${testQuery}`);
        console.log(`A: ${result.response}`);
        console.log(`Sources: ${result.sources.map(s => s.title).join(', ') || 'None'}`);
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
