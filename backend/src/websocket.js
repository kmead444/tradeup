const WebSocket = require('ws');

// Map storing userId -> WebSocket connection
const connections = new Map();

function init(server) {
  const wss = new WebSocket.Server({ server });

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
