const WebSocket = require('ws');
const { connections } = require('./websocketServer');

function sendToUser(userId, data) {
  const ws = connections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(userIds, data) {
  const message = JSON.stringify(data);
  for (const id of userIds) {
    const ws = connections.get(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

module.exports = { sendToUser, broadcast };
