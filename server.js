const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function cleanRoomCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function makeRoomCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
}

function sendWs(client, message) {
  if (!client?.socket?.writable) return;
  const payload = Buffer.from(JSON.stringify(message));
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  client.socket.write(Buffer.concat([header, payload]));
}

function sendError(client, message) {
  sendWs(client, { type: "error", message });
}

function roomStatus(room) {
  return {
    type: "peerStatus",
    players: {
      alpha: Boolean(room?.host),
      bravo: Boolean(room?.client)
    }
  };
}

function notifyRoom(room) {
  if (!room) return;
  const status = roomStatus(room);
  sendWs(room.host, status);
  sendWs(room.client, status);
}

function removeClient(client) {
  if (!client?.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) return;

  if (room.host === client) {
    sendError(room.client, "Player 1 disconnected. The room has closed.");
    rooms.delete(client.roomId);
    return;
  }

  if (room.client === client) {
    room.client = null;
    notifyRoom(room);
  }
}

function handleRoomMessage(client, message) {
  if (message.type === "host") {
    let roomId = cleanRoomCode(message.roomId) || makeRoomCode();
    if (rooms.has(roomId) && rooms.get(roomId).host) {
      sendError(client, `Room ${roomId} is already being hosted.`);
      return;
    }

    const room = { id: roomId, host: client, client: null };
    rooms.set(roomId, room);
    client.role = "host";
    client.playerId = "alpha";
    client.roomId = roomId;
    sendWs(client, { type: "hosted", roomId, playerId: "alpha" });
    notifyRoom(room);
    return;
  }

  if (message.type === "join") {
    const roomId = cleanRoomCode(message.roomId);
    const room = rooms.get(roomId);
    if (!room?.host) {
      sendError(client, `Room ${roomId || "(blank)"} is not available.`);
      return;
    }
    if (room.client && room.client !== client) {
      sendError(client, `Room ${roomId} already has Player 2.`);
      return;
    }

    room.client = client;
    client.role = "client";
    client.playerId = "bravo";
    client.roomId = roomId;
    sendWs(client, { type: "joined", roomId, playerId: "bravo" });
    notifyRoom(room);
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    sendError(client, "Join or host a room first.");
    return;
  }

  if (message.type === "state") {
    if (client !== room.host) return;
    const target = message.playerId === "bravo" ? room.client : room.host;
    if (target && target !== client) {
      sendWs(target, {
        type: "state",
        playerId: message.playerId,
        state: message.state
      });
    }
    return;
  }

  if (message.type === "action") {
    if (client !== room.client || !room.host) return;
    sendWs(room.host, {
      type: "action",
      playerId: "bravo",
      payload: message.payload || {}
    });
  }
}

function handleFrame(client, opcode, payload) {
  if (opcode === 0x8) {
    client.socket.end();
    return;
  }
  if (opcode === 0x9) {
    client.socket.write(Buffer.from([0x8a, 0x00]));
    return;
  }
  if (opcode !== 0x1) return;

  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    sendError(client, "Invalid multiplayer message.");
    return;
  }
  handleRoomMessage(client, message);
}

function parseFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  for (;;) {
    if (client.buffer.length < 2) return;
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) return;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return;
      const bigLength = client.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        client.socket.destroy();
        return;
      }
      length = Number(bigLength);
      offset += 8;
    }

    let mask;
    if (masked) {
      if (client.buffer.length < offset + 4) return;
      mask = client.buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (client.buffer.length < offset + length) return;
    let payload = client.buffer.slice(offset, offset + length);
    client.buffer = client.buffer.slice(offset + length);

    if (masked) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    handleFrame(client, opcode, payload);
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let requestPath = decodeURIComponent(requestUrl.pathname);
  if (requestPath === "/") requestPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, requestPath));
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);

server.on("upgrade", (req, socket) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const client = {
    socket,
    buffer: Buffer.alloc(0),
    roomId: "",
    role: "",
    playerId: ""
  };

  socket.on("data", (chunk) => parseFrames(client, chunk));
  socket.on("close", () => removeClient(client));
  socket.on("error", () => removeClient(client));
});

function networkUrls() {
  const urls = [`http://localhost:${PORT}`];
  const interfaces = os.networkInterfaces();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      if (info.family === "IPv4" && !info.internal) urls.push(`http://${info.address}:${PORT}`);
    }
  }
  return urls;
}

server.listen(PORT, HOST, () => {
  console.log("RF Tug of War multiplayer server");
  for (const url of networkUrls()) console.log(`  ${url}`);
  console.log("Open the same network URL on both computers.");
});
