const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // For dev
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // When user identifies themselves
  socket.on('identify', async (uniqueId) => {
    try {
      await db.updateUserSocket(uniqueId, socket.id, true);
      // Let others know this user is online (only broadcasting generally is bad for privacy,
      // but we can just broadcast to explicit listeners later if needed. For now, we update db).
      
      // Deliver any pending offline messages
      const pendingMessages = await db.getUndeliveredMessages(uniqueId);
      if (pendingMessages.length > 0) {
        pendingMessages.forEach(msg => {
          socket.emit('receive_message', msg);
        });
        await db.markMessagesDelivered(uniqueId);
      }
    } catch (error) {
      console.error('Error during identification', error);
    }
  });

  // Check online status of another user
  socket.on('check_status', async (targetUniqueId, callback) => {
    try {
      const user = await db.getUserByUniqueId(targetUniqueId);
      if (user) {
        callback({ isOnline: !!user.is_online, lastSeen: user.last_seen });
      } else {
        callback({ isOnline: false, lastSeen: null });
      }
    } catch (e) {
      callback({ isOnline: false, lastSeen: null });
    }
  });

  // Sending message
  socket.on('send_message', async (data) => {
    const { senderId, receiverId, encryptedPayload } = data;
    try {
      // Save it
      const savedMsg = await db.saveMessage(senderId, receiverId, encryptedPayload);
      
      // See if receiver is online
      const receiver = await db.getUserByUniqueId(receiverId);
      if (receiver && receiver.is_online) {
        io.to(receiver.socket_id).emit('receive_message', {
          id: savedMsg.id,
          sender_id: senderId,
          receiver_id: receiverId,
          encrypted_payload: encryptedPayload,
          timestamp: savedMsg.timestamp
        });
        await db.markMessagesDelivered(receiverId);
      }
    } catch (error) {
      console.error('Error sending message', error);
    }
  });

  // Typing events
  socket.on('typing', async ({ senderId, receiverId }) => {
    const receiver = await db.getUserByUniqueId(receiverId);
    if (receiver && receiver.is_online) {
      io.to(receiver.socket_id).emit('typing', { senderId });
    }
  });

  socket.on('stop_typing', async ({ senderId, receiverId }) => {
    const receiver = await db.getUserByUniqueId(receiverId);
    if (receiver && receiver.is_online) {
      io.to(receiver.socket_id).emit('stop_typing', { senderId });
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    try {
      const user = await db.getUserBySocketId(socket.id);
      if (user) {
        await db.updateUserSocket(user.unique_id, null, false);
      }
    } catch (error) {
      console.error('Error disconnecting', error);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("Server listening on port " + PORT);
});
