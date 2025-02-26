const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Enable CORS for all routes

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:8000", // Allow requests from this origin
    methods: ["GET", "POST"], // Allow these HTTP methods
    credentials: true, // Allow credentials (if needed)
  },
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-meeting', ({ meetingId }) => {
    console.log(`User ${socket.id} joined meeting ${meetingId}`);
    socket.join(meetingId);
  });

  // Add other event handlers here
});

server.listen(8081, () => {
  console.log('Signaling server running on port 8081');
});