import React, { useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import VideoCallOverlay from '../components/VideoCallOverlay';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { io } from 'socket.io-client';

const ENDPOINT = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
export const socket = io(ENDPOINT, { autoConnect: false });

function ChatDashboard() {
  const user = useAuthStore((state) => state.user);
  const setSocketConnected = useChatStore((state) => state.setSocketConnected);
  const addMessage = useChatStore((state) => state.addMessage);

  const setOnlineUsers = useChatStore((state) => state.setOnlineUsers);
  const addUserOnline = useChatStore((state) => state.addUserOnline);
  const removeUserOffline = useChatStore((state) => state.removeUserOffline);
  const updateChatLatestMessage = useChatStore((state) => state.updateChatLatestMessage);

  useEffect(() => {
    socket.connect();
    socket.emit("setup", user);
    socket.on("connected", (usersArray) => {
        setSocketConnected(true);
        if (usersArray) setOnlineUsers(usersArray);
    });
    
    socket.on("user online", (userId) => addUserOnline(userId));
    socket.on("user offline", (userId) => removeUserOffline(userId));

    // Define a stable handler to properly remove it later
    const messageHandler = (newMessageRecieved) => {
      addMessage(newMessageRecieved);
      updateChatLatestMessage(newMessageRecieved);
      
      // Play a quick notification sound for unseen messages
      if (!newMessageRecieved.readBy?.includes(user._id)) {
         const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
         audio.volume = 0.5;
         audio.play().catch(e => console.warn('Could not play sound:', e));
      }
    };
    
    socket.on("message recieved", messageHandler);

    return () => {
      socket.off("connected");
      socket.off("user online");
      socket.off("user offline");
      socket.off("message recieved", messageHandler);
      socket.disconnect();
    };
  }, [user, setSocketConnected, addMessage, setOnlineUsers, addUserOnline, removeUserOffline, updateChatLatestMessage]);

  return (
    <div className="chat-dashboard fade-in">
      <Sidebar />
      <ChatWindow />
      <VideoCallOverlay />
    </div>
  );
}

export default ChatDashboard;
