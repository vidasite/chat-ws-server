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

let onlineUsers = {};

function findAvailableMatch(excludeId) {
  const available = Object.entries(onlineUsers).filter(
    ([id]) => id !== excludeId && onlineUsers[id].matched === false
  );
  return available.length > 0 ? available[0][0] : null;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (username) => {
    onlineUsers[socket.id] = { username, matched: false };

    const matchId = findAvailableMatch(socket.id);
    if (matchId) {
      const roomId = `${socket.id}-${matchId}`;
      onlineUsers[socket.id].matched = true;
      onlineUsers[matchId].matched = true;

      socket.join(roomId);
      io.to(matchId).socketsJoin(roomId);

      io.to(roomId).emit("matched", {
        roomId,
        users: [
          { id: socket.id, username },
          { id: matchId, username: onlineUsers[matchId].username },
        ],
      });
    }
  });

  socket.on("message", ({ roomId, message }) => {
    io.to(roomId).emit("message", {
      senderId: socket.id,
      message,
    });
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});
