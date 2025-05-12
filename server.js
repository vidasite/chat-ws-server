app.use(cors())
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow cross-origin requests

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // You can replace with your Vercel frontend domain for more security
    methods: ["GET", "POST"]
  },
  path: "/socket.io", // Required for compatibility with default client
});

// Store users
let users = {}; // socketId -> { username, status, currentMatch, skipList }

io.on("connection", (socket) => {
  console.log("🔗 User connected:", socket.id);

  // Add user to tracking object
  users[socket.id] = {
    username: `User-${socket.id.slice(0, 5)}`,
    status: "available",
    currentMatch: null,
    skipList: new Set(),
  };

  // Optional username registration
  socket.on("register", (username) => {
    if (users[socket.id]) {
      users[socket.id].username = username;
      console.log(`🆕 ${username} registered`);
    }
  });

  // Find the next available user (one at a time)
  socket.on("find-partner", () => {
    const requester = users[socket.id];
    if (!requester) return;

    const availableUsers = Object.entries(users).filter(([id, user]) =>
      id !== socket.id &&
      user.status === "available" &&
      !requester.skipList.has(id)
    );

    if (availableUsers.length > 0) {
      const [id, user] = availableUsers[0];
      io.to(socket.id).emit("potential-partner", { id, username: user.username });
    } else {
      io.to(socket.id).emit("no-partners-available");
    }
  });

  // Connect to selected partner
  socket.on("connect-to-partner", (partnerId) => {
    const me = users[socket.id];
    const partner = users[partnerId];

    if (me && partner && me.status === "available" && partner.status === "available") {
      const roomId = `${socket.id}-${partnerId}`;

      me.status = "chatting";
      me.currentMatch = partnerId;
      partner.status = "chatting";
      partner.currentMatch = socket.id;

      socket.join(roomId);
      io.to(partnerId).socketsJoin(roomId);

      io.to(roomId).emit("match-success", {
        roomId,
        users: [
          { id: socket.id, username: me.username },
          { id: partnerId, username: partner.username }
        ]
      });
    } else {
      io.to(socket.id).emit("match-failed", { reason: "Partner not available" });
    }
  });

  // Skip a potential match
  socket.on("skip-partner", (skippedId) => {
    if (users[socket.id]) {
      users[socket.id].skipList.add(skippedId);
      socket.emit("skip-success");
      socket.emit("find-partner");
    }
  });

  // Chat message relay
  socket.on("message", ({ roomId, message }) => {
    io.to(roomId).emit("message", {
      senderId: socket.id,
      message,
    });
  });

  // Handle disconnects
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

  // Extra error logging
  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });
});
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});
