# Exercise 3: Application Development - RAG Chat Agent

**Role:** Application Developer  
**Time:** 45 minutes  
**Goal:** Build a chat agent that leverages the vector database using LangGraph and AWS Bedrock

## 🎯 Learning Objectives

- Create LangGraph agents with memory and tools
- Implement semantic search with vector databases  
- Build conversational AI with context awareness
- Deploy a working chat interface

## 📋 Your Mission

Create a chat agent that can answer questions about the tech content by searching the vector database and providing contextual responses using AWS Bedrock Claude.

## 🛠️ TODO List (Complete in Order)

### Step 1: Agent Architecture Setup (15 min)
- [x] Review the LangGraph agent structure
- [x] Complete the semantic search tool
- [x] Add conversation memory management
- [x] Test basic agent responses

### Step 2: RAG Implementation (20 min)  
- [x] Complete the `searchVectorDatabase` function
- [x] Implement context retrieval and ranking
- [x] Complete the `generateResponse` node
- [x] Add source attribution to responses

### Step 3: Chat Interface (10 min)
- [x] Complete the Express.js API endpoints
- [x] Add conversation history tracking
- [x] Test the chat functionality
- [x] Add error handling for edge cases

## 🚀 Quick Start

```bash
cd exercise-3-app-development
node server.js
# In another terminal:
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"What is machine learning?"}'
```

## 📊 Expected Output

```
=== CHAT AGENT READY ===
Vector Database: Connected (12 vectors)
Bedrock Model: Claude-3 Haiku
Server: Running on port 3000
Test: curl -X POST http://localhost:3000/chat
```

## 💡 Key Concepts

- **RAG Pattern**: Retrieve relevant context before generating responses
- **Semantic Search**: Find similar content using vector similarity
- **Agent Memory**: Maintain conversation context across turns
- **Source Attribution**: Reference original content in responses

## 🔍 Success Criteria

- [x] Agent successfully searches vector database
- [x] Responses include relevant context from stored content
- [x] Conversation memory works across multiple turns
- [x] API endpoints respond correctly
- [x] Sources are cited in responses

## ✅ Completion Notes

All implementation tasks have been completed. The agent supports:
* Fallback semantic search using local vectors when ChromaDB isn't available
* Conversation memory with pruning and token budgeting
* Source attribution in responses (titles + similarity ordering)
* Robust Express API (`/health`, `/chat`, `/conversations/:id`) with error handling
* Mock Bedrock responses when credentials are missing or `USE_MOCK_BEDROCK=1`

### Environment Variables (Optional)
You can configure the following for real Bedrock calls:
```
AWS_REGION=us-east-1
BEDROCK_CLAUDE_MODEL=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2
USE_MOCK_BEDROCK=0   # set to 1 to force mock
SKIP_EMBEDDING_FALLBACK=0  # set to 1 to skip local embedding attempts
```

### Quick Multi-Turn Test
```
curl -s -X POST http://localhost:3000/chat -H 'Content-Type: application/json' -d '{"message":"What is machine learning?"}' | jq '.'
curl -s -X POST http://localhost:3000/chat -H 'Content-Type: application/json' -d '{"message":"Explain AWS Bedrock" , "conversationId":"<ID_FROM_PREVIOUS_RESPONSE>"}' | jq '.'
```

You should see `turns` increment and sources listed. If Bedrock credentials are invalid you'll transparently get mock responses.


## 🆘 Stuck? Quick Tips

- Make sure Exercise 2 completed successfully (check vector-db-config.json)
- Test individual components before the full agent
- Use console.log to debug the retrieval process
- ChromaDB must be running for vector search

---

**🎉 Congratulations!** You've built a complete AI pipeline from data analysis to chat agent!
