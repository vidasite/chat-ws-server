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

    const availableUsers = Object.entries(users).filter(([id, user]) =>
      id !== socket.id &&
      user.status === "available" &&
      !requester.skipList.has(id)
    );

    if (availableUsers.length > 0) {
      const [id, user] = availableUsers[0];
      socket.emit("potential-partner", { id, username: user.username });
    } else {
      socket.emit("no-partners-available");
    }
  });

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
      socket.emit("match-failed", { reason: "Partner not available" });
    }
  });

  socket.on("skip-partner", (skippedId) => {
    if (users[socket.id]) {
      users[socket.id].skipList.add(skippedId);
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

