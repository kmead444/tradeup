
const WebSocket = require('ws');

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    const connections = new Map(); // Map of userId -> ws instance

    wss.on('connection', (ws, req) => {
        // Extract ?userId= from query string
        let userId = null;
        try {
            const params = new URLSearchParams(req.url.split('?')[1]);
            userId = params.get('userId');
        } catch (err) {
            // ignore
        }

        if (userId) {
            connections.set(String(userId), ws);
            ws.on('close', () => {
                connections.delete(String(userId));
            });
        }
    });

    function sendToUser(id, type, payload) {
        const socket = connections.get(String(id));
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type, payload }));
        }
    }

    function broadcast(ids, type, payload) {
        ids.forEach(id => sendToUser(id, type, payload));
    }

    return { sendToUser, broadcast };
}

module.exports = initWebSocket;


// backend/src/websocket.js
const WebSocket = require('ws');

const clients = new Map(); // userId => Set<WebSocket>

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        // Expect userId as query param, e.g., ws://host?userId=123
        let userId = null;
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            userId = url.searchParams.get('userId');
        } catch (err) {
            console.error('WebSocket connection missing userId');
        }

        if (userId) {
            if (!clients.has(userId)) {
                clients.set(userId, new Set());
            }
            clients.get(userId).add(ws);
        }

        ws.on('close', () => {
            if (userId && clients.has(userId)) {
                const set = clients.get(userId);
                set.delete(ws);
                if (set.size === 0) {
                    clients.delete(userId);
                }
            }
        });
    });
}

function sendToUser(userId, event, payload) {
    const conns = clients.get(String(userId));
    if (!conns) return;
    const data = JSON.stringify({ event, payload });
    for (const ws of conns) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    }
}

function broadcast(userIds, event, payload) {
    userIds.forEach(id => sendToUser(id, event, payload));
}

module.exports = {
    setupWebSocket,
    sendToUser,
    broadcast
};

const { WebSocketServer } = require('ws');
const { db } = require('./database/db');
const { createNotification } = require('./utils/notifications');

const clients = new Map();
let wss;

function init(server) {
  wss = new WebSocketServer({ server });
  wss.on('connection', ws => {
    ws.on('message', data => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
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
  if (!senderId || !content || (!conversationId && !receiverId && !dealroomId)) {
    return;
  }
  let actualConversationId = conversationId;
  try {
    if (!actualConversationId && receiverId) {
      actualConversationId = getOrCreateConversation(senderId, receiverId);
    }
    const info = db.prepare(
      `INSERT INTO messages (conversationId, dealroomId, senderId, content, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(actualConversationId, dealroomId, senderId, content);
    if (info.changes > 0) {
      if (actualConversationId) {
        db.prepare(`UPDATE conversations SET lastMessageTimestamp = CURRENT_TIMESTAMP WHERE id = ?`).run(actualConversationId);
      }
      if (actualConversationId && receiverId && senderId !== receiverId) {
        const existingNotif = db
          .prepare(`SELECT id FROM notifications WHERE userId = ? AND type = 'new_messages' AND isRead = 0`)
          .get(receiverId);
        if (existingNotif) {
          db.prepare(`UPDATE notifications SET createdAt = CURRENT_TIMESTAMP WHERE id = ?`).run(existingNotif.id);
        } else {
          createNotification({ userId: receiverId, type: 'new_messages', sourceId: null, senderId });
        }
      }
      db.prepare(`INSERT OR IGNORE INTO message_reads (messageId, userId, readAt) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(
        info.lastInsertRowid,
        senderId
      );
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

module.exports = { init, sendToUser };

const WebSocket = require('ws');

// Map storing userId -> WebSocket connection
const connections = new Map();

function init(server) {
  const ws = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    let registeredId = null;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (err) {
        return;
      }

      if (msg && msg.type === 'register' && msg.userId) {
        registeredId = msg.userId;
        connections.set(registeredId, ws);
        return;
      }
    });

    ws.on('close', () => {
      if (registeredId) {
        connections.delete(registeredId);
      }
    });
  });
}

function sendToUser(id, type, payload) {
  const ws = connections.get(id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(ids, type, payload) {
  ids.forEach((id) => sendToUser(id, type, payload));
}

module.exports = {
  init,
  sendToUser,
  broadcast,
};


