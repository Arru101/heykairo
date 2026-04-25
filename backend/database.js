const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Store user socket mapping and status
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      unique_id TEXT PRIMARY KEY,
      socket_id TEXT,
      is_online BOOLEAN DEFAULT 0,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Store encrypted offline messages
  // We'll optionally keep messages so a user sees them when logging in
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT,
      receiver_id TEXT,
      encrypted_payload TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered BOOLEAN DEFAULT 0
    )
  `);
});

const updateUserSocket = (uniqueId, socketId, isOnline) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (unique_id, socket_id, is_online, last_seen)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(unique_id) DO UPDATE SET
       socket_id = excluded.socket_id,
       is_online = excluded.is_online,
       last_seen = CURRENT_TIMESTAMP`,
      [uniqueId, socketId, isOnline ? 1 : 0],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

const getUserBySocketId = (socketId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE socket_id = ?', [socketId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const getUserByUniqueId = (uniqueId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE unique_id = ?', [uniqueId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const saveMessage = (senderId, receiverId, encryptedPayload) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO messages (sender_id, receiver_id, encrypted_payload) VALUES (?, ?, ?)`,
      [senderId, receiverId, encryptedPayload],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, timestamp: new Date().toISOString() });
      }
    );
  });
};

const getUndeliveredMessages = (receiverId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM messages WHERE receiver_id = ? AND delivered = 0 ORDER BY timestamp ASC`,
      [receiverId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const markMessagesDelivered = (receiverId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE messages SET delivered = 1 WHERE receiver_id = ?`,
      [receiverId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

module.exports = {
  updateUserSocket,
  getUserBySocketId,
  getUserByUniqueId,
  saveMessage,
  getUndeliveredMessages,
  markMessagesDelivered,
};
