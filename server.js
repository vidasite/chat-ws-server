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
  },
});

// Track all users
let users = {}; // { socketId: { username, status: 'available' | 'chatting', currentMatch: socketId } }

function getAvailableUsers(excludeId) {
  return Object.entries(users)
    .filter(([id, data]) => id !== excludeId && data.status === 'available')
    .map(([id, data]) => ({ id, username: data.username }));
}

function unmatch(socketId) {
  const user = users[socketId];
  if (user?.currentMatch) {
    const partnerId = user.currentMatch;
    if (users[partnerId]) {
      users[partnerId].status = 'available';
      users[partnerId].currentMatch = null;
      io.to(partnerId).emit("partner-disconnected");
    }
    user.currentMatch = null;
    user.status = 'available';
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (username) => {
    users[socket.id] = {
      username,
      status: 'available',
      currentMatch: null,
    };
    console.log(`${username} registered`);
  });

  socket.on("search-users", () => {
    const available = getAvailableUsers(socket.id);
    io.to(socket.id).emit("search-result", available);
  });

  socket.on("connect-to-user", (targetId) => {
    const requester = users[socket.id];
    const target = users[targetId];

    if (requester && target && target.status === 'available' && requester.status === 'available') {
      const roomId = `${socket.id}-${targetId}`;

      requester.status = 'chatting';
      requester.currentMatch = targetId;
      target.status = 'chatting';
      target.currentMatch = socket.id;

      socket.join(roomId);
      io.to(targetId).socketsJoin(roomId);

      io.to(roomId).emit("match-success", {
        roomId,
        users: [
          { id: socket.id, username: requester.username },
          { id: targetId, username: target.username },
        ],
      });
    } else {
      io.to(socket.id).emit("match-failed", { reason: "User unavailable" });
    }
  });

  socket.on("skip-user", () => {
    unmatch(socket.id);
    const available = getAvailableUsers(socket.id);
    io.to(socket.id).emit("search-result", available);
  });

  socket.on("message", ({ roomId, message }) => {
    io.to(roomId).emit("message", {
      senderId: socket.id,
      message,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    unmatch(socket.id);
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});
