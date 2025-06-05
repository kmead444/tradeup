const { WebSocketServer } = require('ws');
const { db } = require('./database/db');
const { createNotification } = require('./utils/notifications');

const clients = new Map();

function init(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    ws.on('message', data => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      if (msg.type === 'auth' && msg.userId) {
        ws.userId = msg.userId;
        clients.set(msg.userId, ws);
      } else if (msg.type === 'send_message') {
        handleSendMessage(msg);
      }
    });

    ws.on('close', () => {
      if (ws.userId) clients.delete(ws.userId);
    });
  });
}

function sendToUser(userId, payload) {
  const client = clients.get(userId);
  if (client && client.readyState === client.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

function broadcast(userIds, type, payload) {
  userIds.forEach(id => sendToUser(id, { type, payload }));
}

function getOrCreateConversation(u1, u2) {
  const sorted = [u1, u2].sort((a, b) => a - b);
  const user1Id = sorted[0];
  const user2Id = sorted[1];
  let convo = db.prepare(
    `SELECT id FROM conversations WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?)`
  ).get(user1Id, user2Id, user2Id, user1Id);
  if (!convo) {
    const info = db.prepare(
      `INSERT INTO conversations (user1Id, user2Id, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).run(user1Id, user2Id);
    convo = { id: info.lastInsertRowid };
  }
  return convo.id;
}

function handleSendMessage(data) {
  const { conversationId, senderId, receiverId, content, dealroomId } = data;
  if (!senderId || !content || (!conversationId && !receiverId && !dealroomId)) return;

  let actualConversationId = conversationId;

  try {
    if (!actualConversationId && receiverId) {
      actualConversationId = getOrCreateConversation(senderId, receiverId);
    }

    const info = db.prepare(
      `INSERT INTO messages (conversationId, dealroomId, senderId, content, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(actualConversationId, dealroomId, senderId, content);

    if (info.changes > 0) {
      db.prepare(`UPDATE conversations SET lastMessageTimestamp = CURRENT_TIMESTAMP WHERE id = ?`).run(actualConversationId);

      if (receiverId && senderId !== receiverId) {
        const existingNotif = db.prepare(
          `SELECT id FROM notifications WHERE userId = ? AND type = 'new_messages' AND isRead = 0`
        ).get(receiverId);

        if (existingNotif) {
          db.prepare(`UPDATE notifications SET createdAt = CURRENT_TIMESTAMP WHERE id = ?`).run(existingNotif.id);
        } else {
          createNotification({ userId: receiverId, type: 'new_messages', sourceId: null, senderId });
        }
      }

      db.prepare(
        `INSERT OR IGNORE INTO message_reads (messageId, userId, readAt) VALUES (?, ?, CURRENT_TIMESTAMP)`
      ).run(info.lastInsertRowid, senderId);

      const row = db
        .prepare(`SELECT id, senderId, content, timestamp FROM messages WHERE id = ?`)
        .get(info.lastInsertRowid);

      sendToUser(receiverId, { type: 'new_message', conversationId: actualConversationId, message: row });
      sendToUser(senderId, { type: 'new_message', conversationId: actualConversationId, message: row });
    }
  } catch (err) {
    console.error('WebSocket send_message error', err);
  }
}

module.exports = { init, sendToUser, broadcast };
