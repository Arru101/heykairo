const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const {
  updateUserSocket,
  getUserBySocketId,
  getUserByUniqueId,
  saveMessage,
  getUndeliveredMessages,
  markMessagesDelivered,
  deleteConversation
} = require('./database');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ─── Backend Algorithms: Security & Performance ──────────────
const userRateLimits = new Map();
const processedMessages = new Set(); // Simple deduplication cache

// 1. Rate Limiter Algorithm (Token Bucket variation)
const isRateLimited = (socketId) => {
  const now = Date.now();
  const limitData = userRateLimits.get(socketId) || { count: 0, windowStart: now };
  
  if (now - limitData.windowStart > 1000) {
    // Reset window every second
    limitData.count = 1;
    limitData.windowStart = now;
  } else {
    limitData.count++;
  }
  
  userRateLimits.set(socketId, limitData);
  return limitData.count > 5; // Max 5 requests per second per socket
};

// Periodic cleanup of deduplication cache to prevent memory leaks
setInterval(() => processedMessages.clear(), 1000 * 60 * 60); // Clear every hour


io.on('connection', (socket) => {
  // Register user identity and deliver any pending offline messages
  socket.on('identify', async (uniqueId) => {
    try {
      await updateUserSocket(uniqueId, socket.id, true);
      const pendingMessages = await getUndeliveredMessages(uniqueId);
      if (pendingMessages.length > 0) {
        pendingMessages.forEach(msg => socket.emit('receive_message', msg));
        await markMessagesDelivered(uniqueId);
      }
    } catch (error) {
      console.error('Error during identification:', error);
    }
  });

  // Check online status of another user
  socket.on('check_status', async (targetUniqueId, callback) => {
    try {
      const user = await getUserByUniqueId(targetUniqueId);
      callback(user
        ? { isOnline: !!user.is_online, lastSeen: user.last_seen }
        : { isOnline: false, lastSeen: null }
      );
    } catch {
      callback({ isOnline: false, lastSeen: null });
    }
  });

  // Send an encrypted message
  socket.on('send_message', async (data) => {
    if (isRateLimited(socket.id)) {
      console.warn(`[SECURITY] Rate limit exceeded by ${socket.id}`);
      return;
    }

    const { senderId, receiverId, encryptedPayload, clientMsgId } = data || {};
    
    // 2. Strict Payload Validation & Anti-XSS
    if (!senderId || !receiverId || typeof encryptedPayload !== 'string' || encryptedPayload.length > 5000000) {
      console.warn(`[SECURITY] Malformed payload rejected from ${socket.id}`);
      socket.disconnect(true); // Drop malicious connection instantly
      return;
    }

    // 3. Message Deduplication Algorithm
    const dedupKey = `${senderId}-${receiverId}-${clientMsgId || encryptedPayload.substring(0, 32)}`;
    if (processedMessages.has(dedupKey)) {
      console.warn(`[SECURITY] Duplicate message blocked from ${senderId}`);
      return;
    }
    processedMessages.add(dedupKey);

    try {
      const savedMsg = await saveMessage(senderId, receiverId, encryptedPayload);
      const receiver = await getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('receive_message', {
          id: savedMsg.id,
          sender_id: senderId,
          receiver_id: receiverId,
          encrypted_payload: encryptedPayload,
          timestamp: savedMsg.timestamp
        });
        await markMessagesDelivered(receiverId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Typing indicators
  socket.on('typing', async ({ senderId, receiverId }) => {
    try {
      const receiver = await getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('typing', { senderId });
      }
    } catch { /* silent */ }
  });

  socket.on('stop_typing', async ({ senderId, receiverId }) => {
    try {
      const receiver = await getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('stop_typing', { senderId });
      }
    } catch { /* silent */ }
  });

  // Read Receipts (Seen Status)
  socket.on('mark_seen', async ({ senderId, receiverId }) => {
    try {
      const receiver = await getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('messages_seen', { viewerId: senderId });
      }
    } catch { /* silent */ }
  });

  // ── CHAT ENDED: purge all messages from the database ──────────────────────
  socket.on('end_chat', async ({ senderId, receiverId }) => {
    try {
      await deleteConversation(senderId, receiverId);

      // Notify the other party that the chat has been ended so they can also clear their UI
      const receiver = await getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('chat_ended', { by: senderId });
      }
    } catch (error) {
      console.error('Error purging conversation:', error);
    }
  });

  // Handle disconnect — mark user offline
  socket.on('disconnect', async () => {
    if (socket.uniqueId) {
        io.emit('user_status_changed', { userId: socket.uniqueId, isOnline: false });
    }
    try {
      const user = await getUserBySocketId(socket.id);
      if (user) {
        await updateUserSocket(user.unique_id, null, false);
      }
    } catch (error) {
      console.error('Error on disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('Kairo backend listening on port ' + PORT);
});
