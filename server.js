const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // You may restrict to https://v0-christian-friends-chat-app.vercel.app later
  },
});

// Store users
let users = {}; // socketId -> { username, status, currentMatch, skipList }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  users[socket.id] = {
    username: `User-${socket.id.slice(0, 5)}`, // temp name
    status: "available",
    currentMatch: null,
    skipList: new Set()
  };

  // Optional: assign a name if provided
  socket.on("register", (username) => {
    users[socket.id].username = username;
    console.log(`${username} registered`);
  });

  // Find one match at a time
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

  // User decides to chat with a found partner
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
      io.to(socket.id).emit("match-failed", { reason: "Partner no longer available." });
    }
  });

  // User skips this match
  socket.on("skip-partner", (skippedId) => {
    if (users[socket.id]) {
      users[socket.id].skipList.add(skippedId);
    }
    socket.emit("skip-success");
    socket.emit("find-partner");
  });

  socket.on("message", ({ roomId, message }) => {
    io.to(roomId).emit("message", {
      senderId: socket.id,
      message
    });
  })
