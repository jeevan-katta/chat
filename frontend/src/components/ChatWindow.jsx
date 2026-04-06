import React, { useEffect, useState, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { Send, Phone, Video, Mic } from 'lucide-react';
import { socket } from '../pages/ChatDashboard';
import api from '../store/authStore'; // generic axios

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function ChatWindow() {
  const { selectedChat, messages, fetchMessages, sendMessage, addMessage, removeMessage, onlineUsers } = useChatStore();
  const user = useAuthStore(state => state.user);
  const [newMessage, setNewMessage] = useState("");
  const [typing, setTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat._id);
      socket.emit("join chat", selectedChat._id);
    }
  }, [selectedChat, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    
    // Mark text messages as read
    if (messages.length > 0) {
      messages.forEach(m => {
        if (!m.isAudio && !m.readBy.includes(user._id)) {
          api.put(`/messages/${m._id}/read`).catch(() => {});
        }
      });
    }
  }, [messages, isTyping, user._id]);

  useEffect(() => {
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));
    return () => {
      socket.off("typing");
      socket.off("stop typing");
    };
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    socket.emit("stop typing", selectedChat._id);
    setTyping(false);

    const content = newMessage;
    setNewMessage(""); // Optimistically clear input
    const msg = await sendMessage(content, selectedChat._id);
    if(msg) {
        socket.emit("new message", msg);
    }
  };

  const typingHandler = (e) => {
    setNewMessage(e.target.value);

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop typing", selectedChat._id);
      setTyping(false);
    }, 3000);
  };

  const handleAudioEnd = async (msgId) => {
    try {
      await api.delete(`/messages/${msgId}`);
      removeMessage(msgId);
      // Let other clients know it was deleted? Actually, simple P2P ephemeral means they delete when they listen.
      // If we want it to vanish from everywhere:
      // socket.emit("delete message", { msgId, chatId: selectedChat._id });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop logic
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append("audio", audioBlob, "voice-message.webm");
        formData.append("chatId", selectedChat._id);
        
        try {
           const { data } = await api.post('/messages/audio', formData, {
               headers: { 'Content-Type': 'multipart/form-data' }
           });
           addMessage(data);
           socket.emit("new message", data);
        } catch (error) {
           console.error("Audio post failed", error);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error(e);
    }
  };

  const getSenderName = (chat) => {
    if (chat.isGroupChat) return chat.chatName;
    return chat.users[0]._id === user._id ? chat.users[1]?.username : chat.users[0]?.username;
  };
  
  const isOnline = (chat) => {
    if (chat.isGroupChat) return false;
    const otherUser = chat.users.find(u => u._id !== user._id);
    return otherUser ? onlineUsers.includes(otherUser._id) : false;
  };

  if (!selectedChat) {
    return (
      <div className="chat-area" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: 'var(--text-light)', fontWeight: 300 }}>Select a chat to start messaging</h2>
      </div>
    );
  }

  return (
    <div className="chat-area">
      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafafa' }}>
        <div>
           <h3 style={{ margin: 0, color: 'var(--primary-dark)' }}>{getSenderName(selectedChat)}</h3>
           {isOnline(selectedChat) && <div style={{ fontSize: '0.75rem', color: '#4CAF50', fontWeight: 'bold' }}>Online</div>}
        </div>
        {!selectedChat.isGroupChat && (
           <div style={{ display: 'flex', gap: '10px' }}>
             <div 
               style={{ cursor: 'pointer', color: 'var(--primary-color)', padding: '8px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex' }}
               onClick={() => {
                  const otherUser = selectedChat.users.find(u => u._id !== user._id);
                  window.dispatchEvent(new CustomEvent('initiate-call', { detail: { userToCall: otherUser, video: true } }));
               }}
             >
                <Video size={20} />
             </div>
             <div 
               style={{ cursor: 'pointer', color: 'var(--primary-color)', padding: '8px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex' }}
               onClick={() => {
                  const otherUser = selectedChat.users.find(u => u._id !== user._id);
                  window.dispatchEvent(new CustomEvent('initiate-call', { detail: { userToCall: otherUser, video: false } }));
               }}
             >
                <Phone size={20} />
             </div>
           </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', backgroundColor: '#fff' }}>
        {messages.map((m, i) => {
          const isSent = m.sender._id === user._id;
          return (
            <div key={m._id || i} className={`message ${isSent ? 'sent' : 'received'}`}>
              {!isSent && <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginLeft: '4px', marginBottom: '2px' }}>{m.sender.username}</span>}
              <div className="bubble" style={m.isAudio ? { padding: '8px', background: 'transparent' } : {}}>
                {m.isAudio ? (
                  <audio 
                     src={`${BACKEND_URL}${m.content}`} 
                     controls 
                     controlsList="nodownload"
                     onPlay={(e) => {
                        // Immediately apply deleting logic when they start listening or end listening.
                        // User said "listened voice messages should deleted immediately". We'll do it onEnded.
                     }}
                     onEnded={() => handleAudioEnd(m._id)}
                  />
                ) : (
                  m.content
                )}
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="message received">
             <div className="bubble" style={{ backgroundColor: '#e2e8f0', color: '#64748b', fontStyle: 'italic', padding: '8px 16px' }}>
                Typing...
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', backgroundColor: '#fafafa', display: 'flex', gap: '12px' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', flex: 1, gap: '12px' }}>
          <input
            className="input-field"
            style={{ borderRadius: '24px' }}
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={typingHandler}
            disabled={isRecording}
          />
          <button type="submit" className="btn" disabled={isRecording} style={{ minWidth: '50px', width: '50px', height: '50px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
            <Send size={20} />
          </button>
        </form>
        <button 
           type="button" 
           className="btn" 
           onClick={toggleRecording} 
           style={{ 
             minWidth: '50px', width: '50px', height: '50px', padding: 0, display: 'flex', 
             alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
             backgroundColor: isRecording ? '#F44336' : 'var(--primary-color)',
             animation: isRecording ? 'pulse 1.5s infinite' : 'none'
           }}
        >
          <Mic size={20} />
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;
