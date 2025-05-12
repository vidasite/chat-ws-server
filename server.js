const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

let users = {}; // socketId -> { username, status, currentMatch, skipList }

io.on("connection", (socket) => {
  console.log("🔗 User connected:", socket.id);

  users[socket.id] = {
    username: `User-${socket.id.slice(0, 5)}`,
    status: "available",
    currentMatch: null,
    skipList: new Set(),
  };

  socket.on("register", (username) => {
    if (users[socket.id]) {
      users[socket.id].username = username;
      console.log(`🆕 ${username} registered`);
    }
  });

  socket.on("find-partner", () => {
  const requester = users[socket.id];
  if (!requester) return;

  // Mark requester as searching
  requester.status = "searching";

  // Search for another user who is also searching
  const match = Object.entries(users).find(([id, user]) =>
    id !== socket.id &&
    user.status === "searching" &&
    !requester.skipList.has(id)
  );

  if (match) {
    const [partnerId, partner] = match;

    // Update both statuses
    requester.status = "chatting";
    requester.currentMatch = partnerId;
    partner.status = "chatting";
    partner.currentMatch = socket.id;

    const roomId = `${socket.id}-${partnerId}`;
    socket.join(roomId);
    io.to(partnerId).socketsJoin(roomId);

    io.to(roomId).emit("match-success", {
      roomId,
      users: [
        { id: socket.id, username: requester.username },
        { id: partnerId, username: partner.username }
      ]
    });
  } else {
    socket.emit("no-partners-available");
  }
});

socket.on("skip-partner", (skippedId) => {
  const me = users[socket.id];
  if (me) {
    me.skipList.add(skippedId);
    me.status = "searching"; // ready to search again
    socket.emit("skip-success");
    socket.emit("find-partner");
  }
});

  socket.on("message", ({ roomId, message }) => {
    io.to(roomId).emit("message", {
      senderId: socket.id,
      message,
    });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user?.currentMatch) {
      const partnerId = user.currentMatch;
      if (users[partnerId]) {
        users[partnerId].status = "available";
        users[partnerId].currentMatch = null;
        io.to(partnerId).emit("partner-disconnected");
      }
    }
    delete users[socket.id];
    console.log("❌ User disconnected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});

