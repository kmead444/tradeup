const WebSocket = require('ws');
const { db } = require('../database/db');

// Map to store authenticated connections by user ID
const connections = new Map();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    let userId = null;
    let authenticated = false;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (err) {
        ws.close(1008, 'Invalid JSON');
        return;
      }

      if (!authenticated) {
        if (msg && msg.type === 'auth' && msg.userId) {
          const user = db.prepare('SELECT id FROM users WHERE id = ?').get(msg.userId);
          if (user) {
            authenticated = true;
            userId = msg.userId;
            connections.set(userId, ws);
            ws.send(JSON.stringify({ type: 'auth', status: 'ok' }));
          } else {
            ws.close(4001, 'Invalid user');
          }
        } else {
          ws.close(4002, 'Authentication required');
        }
        return;
      }

      // Handle further messages here if needed
    });

    ws.on('close', () => {
      if (userId) {
        connections.delete(userId);
      }
    });
  });

  return wss;
}

module.exports = {
  setupWebSocketServer,
  connections,
};
