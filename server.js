const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {};  // Keeps track of rooms and clients

app.use(express.static('public'));  // Serve static files from "public" folder

// When a client connects
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send the current list of rooms to the client
    socket.emit('update-rooms', rooms);

    // Handle joining a room
    socket.on('join', (roomName) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { clients: [], peerConnections: {} };
        }
        rooms[roomName].clients.push(socket.id);
        console.log(`${socket.id} joined room ${roomName}`);

        // Notify other clients in the room
        socket.to(roomName).emit('new-peer', socket.id);

        // Update the list of rooms for all clients
        io.emit('update-rooms', rooms);
    });

    // Handle creating a new room (client request)
    socket.on('create-room', (roomName) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { clients: [], peerConnections: {} };
            console.log(`New room created: ${roomName}`);
            io.emit('update-rooms', rooms);
        }
    });

    // Handle sending an offer to a target user in the room
    socket.on('offer', async ({ sdp, targetId, roomName }) => {
        if (rooms[roomName]) {
            const peerConnection = new RTCPeerConnection();
            rooms[roomName].peerConnections[targetId] = peerConnection;

            // Set remote description (received offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

            // Create an answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // Send the answer to the target peer in the room
            socket.to(targetId).emit('answer', { sdp: answer.sdp, fromId: socket.id });
        }
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (candidate, targetId, roomName) => {
        if (rooms[roomName] && rooms[roomName].peerConnections[targetId]) {
            // Forward ICE candidates to peers
            rooms[roomName].peerConnections[targetId].addIceCandidate(new RTCIceCandidate(candidate));
        }
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        for (let roomName in rooms) {
            const room = rooms[roomName];
            const index = room.clients.indexOf(socket.id);
            if (index !== -1) {
                room.clients.splice(index, 1);
            }

            // Cleanup peer connections
            if (room.peerConnections[socket.id]) {
                room.peerConnections[socket.id].close();
                delete room.peerConnections[socket.id];
            }

            // Notify other peers in the room
            socket.to(roomName).emit('peer-left', socket.id);

            // If no clients left in the room, delete the room
            if (room.clients.length === 0) {
                delete rooms[roomName];
            }
        }
        // Update the list of rooms for all clients
        io.emit('update-rooms', rooms);
    });
});

// Server listens on port 3000
server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});
