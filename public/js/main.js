const socket = io();
let localStream;
let peerConnections = {};
let roomName;
let localVideo = document.createElement('video');
localVideo.autoplay = true;
localVideo.muted = true;

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    roomName = document.getElementById('roomName').value;
    socket.emit('join', roomName);
    startLocalStream();
});

async function startLocalStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream = stream;
        localVideo.srcObject = stream;
        document.getElementById('videoContainer').appendChild(localVideo);

        for (let clientId in peerConnections) {
            createOffer(clientId);
        }
    } catch (error) {
        console.error('Error accessing media devices.', error);
    }
}

socket.on('new-peer', (clientId) => {
    console.log(`New peer joined: ${clientId}`);
    createOffer(clientId);
});

socket.on('peer-left', (clientId) => {
    console.log(`Peer left: ${clientId}`);
    if (peerConnections[clientId]) {
        peerConnections[clientId].close();
        delete peerConnections[clientId];
    }
});

socket.on('offer', async (clientId, offer) => {
    const peerConnection = new RTCPeerConnection();
    peerConnections[clientId] = peerConnection;

    peerConnection.addEventListener('icecandidate', event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, clientId, roomName);
        }
    });

    peerConnection.addEventListener('track', event => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        document.getElementById('videoContainer').appendChild(remoteVideo);
    });

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer }));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', { sdp: answer.sdp, targetId: clientId, roomName });
});

socket.on('answer', async ({ sdp, fromId }) => {
    const peerConnection = peerConnections[fromId];
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
});

socket.on('ice-candidate', (candidate, fromId) => {
    const peerConnection = peerConnections[fromId];
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

async function createOffer(clientId) {
    const peerConnection = new RTCPeerConnection();
    peerConnections[clientId] = peerConnection;

    peerConnection.addEventListener('icecandidate', event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, clientId, roomName);
        }
    });

    peerConnection.addEventListener('track', event => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        document.getElementById('videoContainer').appendChild(remoteVideo);
    });

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', { sdp: offer.sdp, targetId: clientId, roomName });
}
