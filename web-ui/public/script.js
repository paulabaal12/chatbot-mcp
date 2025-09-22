// MCP Chatbot Web UI JavaScript
class MCPChatUI {
    constructor() {
        this.socket = io();
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chatContainer = document.getElementById('chatContainer');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.connectionStatus = document.getElementById('connectionStatus');
        
        this.initializeEventListeners();
        this.initializeSocketEvents();
        this.setupAutoResize();
        this.updateCharCount();
    }
    
    initializeEventListeners() {
        // Send button click
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Enter key to send message
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Character count update
        this.messageInput.addEventListener('input', () => this.updateCharCount());
        
        // Clear chat button
        document.querySelector('.action-btn[title="Clear Chat"]').addEventListener('click', () => {
            this.clearChat();
        });
        
        // Auto-focus input
        this.messageInput.focus();
    }
    
    initializeSocketEvents() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('🔗 Conectado al servidor');
            this.updateConnectionStatus('Connected', true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Desconectado del servidor');
            this.updateConnectionStatus('Disconnected', false);
        });
        
        // Message events
        this.socket.on('message', (data) => {
            this.addMessage(data);
        });
        
        // Typing indicator
        this.socket.on('typing', (data) => {
            this.toggleTypingIndicator(data.isTyping);
        });
        
        // Error handling
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.addMessage({
                type: 'error',
                content: 'Connection error occurred. Please try again.',
                timestamp: new Date().toISOString()
            });
        });
    }
    
    setupAutoResize() {
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 150) + 'px';
        });
    }
    
    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        // Disable input while sending
        this.setInputEnabled(false);
        
        // Send to server
        this.socket.emit('user_message', { message });
        
        // Clear input
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.updateCharCount();
        
        // Remove welcome message if present
        this.removeWelcomeMessage();
    }
    
    addMessage(data) {
        const messageElement = this.createMessageElement(data);
        this.chatContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        // Re-enable input after receiving response
        if (data.type === 'assistant' || data.type === 'error') {
            this.setInputEnabled(true);
        }
        
        // Animate message in
        requestAnimationFrame(() => {
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'translateY(0)';
        });
    }
    
    createMessageElement(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${data.type}`;
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(20px)';
        messageDiv.style.transition = 'all 0.3s ease-out';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        // Set avatar icon based on message type
        const avatarIcon = document.createElement('i');
        switch (data.type) {
            case 'user':
                avatarIcon.className = 'fas fa-user';
                break;
            case 'assistant':
                avatarIcon.className = 'fas fa-robot';
                break;
            case 'error':
                avatarIcon.className = 'fas fa-exclamation-triangle';
                break;
            default:
                avatarIcon.className = 'fas fa-circle';
        }
        avatar.appendChild(avatarIcon);
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const text = document.createElement('div');
        text.className = 'message-text';
        text.innerHTML = this.formatMessage(data.content);
        
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = this.formatTimestamp(data.timestamp);
        
        content.appendChild(text);
        content.appendChild(timestamp);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        return messageDiv;
    }
    
    formatMessage(content) {
        // Basic markdown-like formatting
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        // Add syntax highlighting for code blocks (basic)
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
        });
        
        return formatted;
    }
    
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    toggleTypingIndicator(isTyping) {
        if (isTyping) {
            this.typingIndicator.classList.add('active');
        } else {
            this.typingIndicator.classList.remove('active');
        }
    }
    
    updateConnectionStatus(status, isConnected) {
        this.connectionStatus.textContent = status;
        const statusDot = document.querySelector('.status-dot');
        
        if (isConnected) {
            statusDot.className = 'status-dot online';
        } else {
            statusDot.className = 'status-dot offline';
        }
    }
    
    setInputEnabled(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendButton.disabled = !enabled;
        
        if (enabled) {
            this.messageInput.focus();
        }
    }
    
    updateCharCount() {
        const count = this.messageInput.value.length;
        const maxLength = this.messageInput.maxLength;
        const charCountElement = document.querySelector('.char-count');
        
        charCountElement.textContent = `${count}/${maxLength}`;
        
        // Change color based on usage
        if (count > maxLength * 0.9) {
            charCountElement.style.color = 'var(--error-red)';
        } else if (count > maxLength * 0.7) {
            charCountElement.style.color = 'var(--warning-amber)';
        } else {
            charCountElement.style.color = 'var(--cool-gray-500)';
        }
        
        // Update send button state
        this.sendButton.disabled = count === 0 || count > maxLength;
    }
    
    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    removeWelcomeMessage() {
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.opacity = '0';
            welcomeMessage.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                welcomeMessage.remove();
            }, 300);
        }
    }
    
    clearChat() {
        // Remove all messages except welcome
        const messages = this.chatContainer.querySelectorAll('.message');
        messages.forEach(message => {
            message.style.opacity = '0';
            message.style.transform = 'translateY(-20px)';
            setTimeout(() => message.remove(), 200);
        });
        
        // Show welcome message again if no messages
        setTimeout(() => {
            if (this.chatContainer.children.length === 0) {
                location.reload(); // Simple way to restore welcome message
            }
        }, 300);
    }
}

// Quick message function for welcome buttons
function sendQuickMessage(message) {
    const chatUI = window.chatUI;
    if (chatUI) {
        chatUI.messageInput.value = message;
        chatUI.sendMessage();
    }
}

// Tool item click handlers
document.addEventListener('DOMContentLoaded', () => {
    // Initialize chat UI
    window.chatUI = new MCPChatUI();
    
    // Add click handlers for tool items
    document.querySelectorAll('.tool-item').forEach(tool => {
        tool.addEventListener('click', () => {
            const toolName = tool.querySelector('span').textContent;
            const message = `Tell me about the ${toolName} MCP tool and what it can do`;
            window.chatUI.messageInput.value = message;
            window.chatUI.sendMessage();
        });
    });
    
    // Add mobile menu toggle (for future mobile optimization)
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // Add some interactive animations
    document.querySelectorAll('.quick-btn, .tool-item, .action-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
        });
    });
    
    // Add CSS class for offline status
    const style = document.createElement('style');
    style.textContent = `
        .status-dot.offline {
            background: var(--error-red);
            animation: none;
        }
        
        code {
            background: var(--cool-gray-100);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.875em;
        }
        
        pre {
            background: var(--cool-gray-900);
            color: var(--cool-gray-100);
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
            margin: 0.5rem 0;
        }
        
        pre code {
            background: none;
            padding: 0;
            color: inherit;
        }
    `;
    document.head.appendChild(style);
});

// Handle page visibility for better UX
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.chatUI) {
        window.chatUI.messageInput.focus();
    }
});

// Prevent zoom on mobile input focus
document.addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        e.target.style.fontSize = '16px';
    }
});