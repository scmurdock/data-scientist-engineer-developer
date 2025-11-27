const express = require('express');
const { RAGChatAgent } = require('./chat-agent');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // For serving HTML interface

// Initialize chat agent (will be done in startup)
let chatAgent = null;
let agentReady = false;

// Initialize agent on server startup
async function initializeAgent() {
    try {
        console.log('🚀 Initializing RAG Chat Agent...');
        chatAgent = new RAGChatAgent();
        // Wait for async agent initialization if needed
        if (chatAgent.initializeAgent && chatAgent.initializeAgent.constructor.name === 'AsyncFunction') {
            await chatAgent.initializeAgent();
        }
        agentReady = true;
        console.log('✅ Chat Agent ready for requests');
    } catch (error) {
        console.error('❌ Failed to initialize chat agent:', error.message);
        console.log('\n🔧 Make sure to:');
        console.log('1. Complete Exercise 2 first');
        console.log('2. Start ChromaDB: docker run -p 8000:8000 chromadb/chroma');
        console.log('3. Configure AWS credentials\n');
    }
}

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        agentReady: agentReady,
        timestamp: new Date().toISOString()
    });
});

// Main chat endpoint
app.post('/chat', async (req, res) => {
    // Chat API endpoint implementation
    try {
        if (!agentReady) {
            return res.status(503).json({
                error: 'Chat agent not ready',
                message: 'Please wait for agent initialization to complete'
            });
        }
        
        const { message, conversationId } = req.body || {};
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Message is required and must be a non-empty string'
            });
        }
        
        console.log(`📨 Chat request: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
        
        const result = await chatAgent.chat(message.trim(), conversationId);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Chat request failed:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process chat request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get conversation history
app.get('/conversations/:conversationId', async (req, res) => {
    // Conversation history endpoint
    try {
        if (!agentReady) {
            return res.status(503).json({
                error: 'Chat agent not ready'
            });
        }
        
        const { conversationId } = req.params;
        
        if (!conversationId) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'conversationId is required'
            });
        }

        const history = chatAgent.getConversationHistory(conversationId);
        
        res.json({
            success: true,
            conversationId: conversationId,
            history: history,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Failed to get conversation history:', error.message);
        res.status(500).json({
            error: 'Failed to retrieve conversation history'
        });
    }
});

// Simple web interface endpoint
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>RAG Chat Agent - Exercise 3</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .chat-container { border: 1px solid #ddd; height: 400px; overflow-y: auto; padding: 10px; margin: 10px 0; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user-message { background-color: #e3f2fd; text-align: right; }
        .agent-message { background-color: #f5f5f5; }
        .input-container { display: flex; gap: 10px; }
        .message-input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .send-button { padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .status { padding: 10px; background-color: #fff3cd; border-radius: 5px; margin-bottom: 10px; }
        .sources { font-size: 0.8em; color: #666; margin-top: 5px; }
    </style>
</head>
<body>
    <h1>🤖 RAG Chat Agent - Exercise 3</h1>
    
    <div class="status" id="status">
        Agent Status: <span id="agent-status">Checking...</span>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="message agent-message">
            <strong>Assistant:</strong> Hello! I'm your AI assistant. I can help answer questions about technology and machine learning based on the content that was processed in the previous exercises. What would you like to know?
        </div>
    </div>
    
    <div class="input-container">
        <input type="text" id="messageInput" class="message-input" placeholder="Ask me about technology, AI, or machine learning..." onkeypress="handleKeyPress(event)">
        <button onclick="sendMessage()" class="send-button">Send</button>
    </div>
    
    <script>
        let conversationId = null;
        
        // Check agent status on load
        fetch('/health')
            .then(response => response.json())
            .then(data => {
                const statusElement = document.getElementById('agent-status');
                if (data.agentReady) {
                    statusElement.textContent = '✅ Ready';
                    statusElement.style.color = 'green';
                } else {
                    statusElement.textContent = '❌ Not Ready (Complete TODOs first)';
                    statusElement.style.color = 'red';
                }
            })
            .catch(error => {
                document.getElementById('agent-status').textContent = '❌ Error';
            });
        
        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }
        
        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            // Add user message to chat
            addMessageToChat('You', message, 'user-message');
            input.value = '';
            
            // Show typing indicator
            const typingId = addMessageToChat('Assistant', 'Thinking...', 'agent-message');
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: message,
                        conversationId: conversationId
                    })
                });
                
                const data = await response.json();
                
                // Remove typing indicator
                document.getElementById(typingId).remove();
                
                if (data.success) {
                    conversationId = data.data.conversationId;
                    
                    let responseText = data.data.response;
                    if (data.data.sources && data.data.sources.length > 0) {
                        const sourcesList = data.data.sources.map(s => s.title).join(', ');
                        responseText += \`<div class="sources"><strong>Sources:</strong> \${sourcesList}</div>\`;
                    }
                    
                    addMessageToChat('Assistant', responseText, 'agent-message');
                } else {
                    addMessageToChat('Assistant', 'Sorry, I encountered an error: ' + data.message, 'agent-message');
                }
                
            } catch (error) {
                document.getElementById(typingId).remove();
                addMessageToChat('Assistant', 'Sorry, Im having trouble connecting to the server. Please make sure the agent is properly configured.', 'agent-message');
            }
        }
        
        function addMessageToChat(sender, message, className) {
            const chatContainer = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            const messageId = 'msg-' + Date.now();
            
            messageDiv.id = messageId;
            messageDiv.className = 'message ' + className;
            messageDiv.innerHTML = \`<strong>\${sender}:</strong> \${message}\`;
            
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            return messageId;
        }
    </script>
</body>
</html>
    `);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server
async function startServer() {
    console.log('='.repeat(50));
    console.log('   EXERCISE 3: RAG CHAT AGENT SERVER');
    console.log('='.repeat(50));
    console.log('Role: Application Developer');
    console.log('Task: Deploy chat agent API\n');
    
    // Initialize agent first
    await initializeAgent();
    
    // Start server
    app.listen(port, () => {
        console.log(`\n🚀 Chat Agent Server running on port ${port}`);
        console.log(`📱 Web interface: http://localhost:${port}`);
        console.log(`🔗 API endpoint: http://localhost:${port}/chat`);
        console.log(`❤️  Health check: http://localhost:${port}/health`);
        
        console.log('\n📋 Quick test:');
        console.log(`curl -X POST http://localhost:${port}/chat \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"message":"What is machine learning?"}'`);
        
    console.log('\n💡 Agent initialized. Use the web UI or POST /chat to converse.');
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully');
    process.exit(0);
});

if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { app };
