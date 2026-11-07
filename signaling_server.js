// signaling_server.js - Ultra-lightweight WebRTC Room Signaling Server for Godot 4 Web Matches
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Basic HTTP server to respond to health checks (e.g. Render, Railway)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Godot 4 WebRTC Signaling Server is running!\n');
});

const wss = new WebSocket.Server({ server });
const rooms = new Map(); // room_id -> [wsClient1, wsClient2]

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const type = data.type;
            const room = (data.room || '7777').toString().trim();

            if (type === 'host' || type === 'join') {
                currentRoom = room;
                if (!rooms.has(currentRoom)) {
                    rooms.set(currentRoom, []);
                }
                const roomPeers = rooms.get(currentRoom);

                // Filter out closed sockets
                const activePeers = roomPeers.filter(p => p.readyState === WebSocket.OPEN);
                rooms.set(currentRoom, activePeers);

                if (activePeers.length >= 2) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room ' + room + ' is full (max 2 players)!' }));
                    return;
                }

                activePeers.push(ws);
                const isHost = (activePeers.length === 1);
                ws.send(JSON.stringify({ type: 'joined', is_host: isHost, room: currentRoom }));
                console.log(`[Room ${currentRoom}] Player ${isHost ? '1 (Host)' : '2 (Client)'} joined (${activePeers.length}/2).`);

                // If both players are present, prompt Host to create and send offer
                if (activePeers.length === 2) {
                    activePeers[0].send(JSON.stringify({ type: 'peer_joined', room: currentRoom }));
                    console.log(`[Room ${currentRoom}] Match ready! Prompting Host to initiate WebRTC offer.`);
                }
            } else if (currentRoom && rooms.has(currentRoom)) {
                // Forward WebRTC signals (offer, answer, candidate) to the other peer in the room
                const peers = rooms.get(currentRoom);
                peers.forEach(peer => {
                    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                        peer.send(message.toString());
                    }
                });
            }
        } catch (err) {
            console.error('Error processing signaling message:', err);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const peers = rooms.get(currentRoom).filter(p => p !== ws);
            if (peers.length === 0) {
                rooms.delete(currentRoom);
                console.log(`[Room ${currentRoom}] Room closed.`);
            } else {
                rooms.set(currentRoom, peers);
                peers.forEach(p => {
                    if (p.readyState === WebSocket.OPEN) {
                        p.send(JSON.stringify({ type: 'peer_left', room: currentRoom }));
                    }
                });
                console.log(`[Room ${currentRoom}] A player disconnected.`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Godot 4 WebRTC Signaling Server listening on port ${PORT}`);
});