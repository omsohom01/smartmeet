const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "frontend" folder
app.use(express.static(path.join(__dirname, "frontend")));

// Route for the root URL
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Socket.IO logic
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join-meeting", ({ meetingId }) => {
        socket.join(meetingId);
        console.log(`User ${socket.id} joined meeting ${meetingId}`);
        socket.to(meetingId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ userId, offer }) => {
        socket.to(userId).emit("offer", { userId: socket.id, offer });
    });

    socket.on("answer", ({ userId, answer }) => {
        socket.to(userId).emit("answer", { userId: socket.id, answer });
    });

    socket.on("candidate", ({ userId, candidate }) => {
        socket.to(userId).emit("candidate", { userId: socket.id, candidate });
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);
        socket.broadcast.emit("user-disconnected", socket.id);
    });
});

const PORT = 8083; // Change this number
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});