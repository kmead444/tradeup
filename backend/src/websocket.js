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
