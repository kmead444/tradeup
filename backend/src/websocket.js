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
