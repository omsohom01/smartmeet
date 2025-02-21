document.addEventListener("DOMContentLoaded", () => {
    initializeMeeting();
    setupMeetingControls();
    startMeetingTimer();
});

let localStream;
let screenStream;
let remoteStreams = {};
let peerConnections = {};

const meetingId = new URLSearchParams(window.location.search).get("meetingId");

// Add Socket.IO connection here
const socket = io.connect("http://localhost:8082");

socket.on("connect", () => {
    console.log("Connected to signaling server");
});

socket.on("message", (message) => {
    console.log("Received message:", message);
    // Handle signaling messages (e.g., offers, answers, ICE candidates)
});

socket.on("disconnect", () => {
    alert("Disconnected from the signaling server. Please refresh the page.");
    window.location.href = "index.html";
});

async function initializeMeeting() {
    if (!meetingId) {
        alert("Invalid meeting ID");
        window.location.href = "index.html";
        return;
    }

    document.getElementById("meeting-id").innerText = `Meeting ID: ${meetingId}`;
    await setupLocalStream();
    setupSocketListeners();
    setupMeetingControls();
    adjustGridLayout();
}

function startMeetingTimer() {
    const timerElement = document.getElementById("meeting-timer");
    let startTime = Date.now();

    setInterval(() => {
        let elapsedTime = Date.now() - startTime;
        let hours = Math.floor(elapsedTime / 3600000);
        let minutes = Math.floor((elapsedTime % 3600000) / 60000);
        let seconds = Math.floor((elapsedTime % 60000) / 1000);

        timerElement.innerText =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

async function setupLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("local-video").srcObject = localStream;
        console.log("Local stream initialized successfully");

        // Ensure the user joins the meeting properly
        socket.emit("join-meeting", { meetingId });
    } catch (error) {
        console.error("Error accessing media devices.", error);
        alert("Unable to access your camera and microphone. Please check your permissions and try again.");
        window.location.href = "index.html"; // Redirect to home page
    }
}

async function shareScreenWithCam() {
    try {
        console.log("Requesting screen share...");
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false // Prevents echo issues
        });

        console.log("Screen sharing started successfully");

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => stopScreenShare();

        // Create the screen share video element
        const screenVideo = document.createElement("video");
        screenVideo.id = `screen-share-${meetingId}`;
        screenVideo.autoplay = true;
        screenVideo.playsInline = true;
        screenVideo.srcObject = screenStream;
        screenVideo.classList.add("screen-share");
        const grid = document.querySelector(".participants-grid");
        grid.appendChild(screenVideo);

        // Add CSS class to adjust layout
        document.querySelector(".meeting-container").classList.add("screen-sharing-active");

        // Send screen track to peers
        Object.values(peerConnections).forEach(peerConnection => {
            peerConnection.addTrack(screenTrack, screenStream);
        });

        socket.emit("start-screen-share", { meetingId });

        // Add screen share indicator
        const screenShareIndicator = document.createElement("div");
        screenShareIndicator.innerText = "Screen Sharing Active";
        screenShareIndicator.style.cssText = "position: absolute; top: 10px; left: 10px; background: rgba(0, 0, 0, 0.7); color: white; padding: 5px; border-radius: 5px;";
        document.querySelector(".meeting-container").appendChild(screenShareIndicator);

    } catch (err) {
        console.error("Error sharing screen:", err);
        alert("Screen sharing failed. Please check browser permissions.");
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        document.getElementById(`screen-share-${meetingId}`)?.remove();
        document.querySelector(".meeting-container").classList.remove("screen-sharing-active");
        console.log("Screen sharing stopped.");

        // Remove screen share indicator
        document.querySelector(".meeting-container .screen-share-indicator")?.remove();
    }
}

function setupSocketListeners() {
    socket.on("user-joined", userId => {
        console.log(`User joined: ${userId}`);
        createPeerConnection(userId);
        adjustGridLayout();
    });

    socket.on("offer", async ({ userId, offer }) => {
        if (!peerConnections[userId]) {
            createPeerConnection(userId);
        }

        await peerConnections[userId].setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnections[userId].createAnswer();
        await peerConnections[userId].setLocalDescription(answer);
        socket.emit("answer", { userId, answer: peerConnections[userId].localDescription });
    });

    socket.on("answer", ({ userId, answer }) => {
        peerConnections[userId].setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("candidate", ({ userId, candidate }) => {
        peerConnections[userId].addIceCandidate(new RTCIceCandidate(candidate));
    });
}

function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // Use Google's public STUN server
    });

    // Add local stream tracks to the connection
    localStream.getTracks().forEach(track => {
        console.log(`Adding local track: ${track.kind}`);
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        console.log(`ontrack fired for user: ${userId}`);
        console.log(`Received track kind: ${event.track.kind}`);
        console.log(`Number of streams: ${event.streams.length}`);

        if (!remoteStreams[userId]) {
            remoteStreams[userId] = new MediaStream();
        }

        remoteStreams[userId].addTrack(event.track);
        console.log(`Added track to remote stream for user: ${userId}`);

        let remoteVideo = document.getElementById(`video-${userId}`);
        if (!remoteVideo) {
            console.log(`Creating new video element for user: ${userId}`);
            remoteVideo = document.createElement("video");
            remoteVideo.id = `video-${userId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.classList.add("remote-video");
            document.querySelector(".participants-grid").appendChild(remoteVideo);
        }

        remoteVideo.srcObject = remoteStreams[userId];
        console.log(`Updated video element source for user: ${userId}`);

        adjustGridLayout();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to user: ${userId}`);
            socket.emit("candidate", { userId, candidate: event.candidate });
        }
    };

    peerConnections[userId] = peerConnection;

    // Send an offer to the new user
    peerConnection.createOffer()
        .then(offer => {
            console.log(`Created offer for user: ${userId}`);
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            console.log(`Sending offer to user: ${userId}`);
            socket.emit("offer", { userId, offer: peerConnection.localDescription });
        })
        .catch(error => {
            console.error("Error creating/sending offer:", error);
        });
}

function setupMeetingControls() {
    document.getElementById("toggle-audio")?.addEventListener("click", toggleAudio);
    document.getElementById("toggle-video")?.addEventListener("click", toggleVideo);
    document.getElementById("share-screen")?.addEventListener("click", shareScreenWithCam);
    document.getElementById("end-meeting")?.addEventListener("click", endMeeting);
}

function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById("toggle-audio").innerHTML = audioTrack.enabled
        ? '<i class="fas fa-microphone"></i> Mute'
        : '<i class="fas fa-microphone-slash"></i> Unmute';
}

function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;

    const localVideo = document.getElementById("local-video");
    if (!videoTrack.enabled) {
        localVideo.style.display = "none";
        showVideoPlaceholder(document.querySelector(".local-participant"));
    } else {
        localVideo.style.display = "block";
        document.getElementById("video-placeholder")?.remove();
    }
}

function showVideoPlaceholder(container) {
    if (!document.getElementById("video-placeholder")) {
        const placeholder = document.createElement("div");
        placeholder.id = "video-placeholder";
        placeholder.style.cssText = "display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; background: #000; border-radius: 8px;";
        placeholder.innerHTML = `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08c-1.29 1.94-3.5 3.22-6 3.22z" fill="#64748b"/>
            </svg>`;
        container.appendChild(placeholder);
    }
}

function endMeeting() {
    if (confirm("Are you sure you want to end the meeting?")) {
        // Stop all local tracks
        localStream.getTracks().forEach(track => track.stop());

        // Stop all remote streams
        Object.values(remoteStreams).forEach(stream => {
            stream.getTracks().forEach(track => track.stop());
        });

        // Close all peer connections
        Object.values(peerConnections).forEach(peerConnection => peerConnection.close());

        // Redirect to home page
        window.location.href = "index.html";
    }
}

let resizeTimeout;
function adjustGridLayout() {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
        const participants = document.querySelectorAll(".participants-grid video");
        const grid = document.querySelector(".participants-grid");

        // Calculate the number of columns based on the number of participants
        const numParticipants = participants.length;
        const numColumns = Math.ceil(Math.sqrt(numParticipants));
        const numRows = Math.ceil(numParticipants / numColumns);

        // Update the grid layout
        grid.style.gridTemplateColumns = `repeat(${numColumns}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;

        console.log(`Adjusted grid layout for ${numParticipants} participants`);
    }, 100); // Debounce time in milliseconds
}   