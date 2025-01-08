const express = require("express");
const app = express();
const PORT = process.env.PORT || 3001;
     const cors = require("cors"); // Install: npm install cors

     app.use(
       cors({
         origin: ["https://minnowspacexpo.vercel.app", "http://localhost:8081"], // Allow requests from this origin
         methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed methods
         allowedHeaders: ["Content-Type", "Authorization"], // Specify allowed headers
         credentials: true, // Enable sending cookies if needed
       })
     );
app.use(express.json());

// Example API route
app.get("/api", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

const io = require("socket.io")(3000);

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("offer", (offer) => {
    socket.broadcast.emit("offer", offer);
  });

  socket.on("answer", (answer) => {
    socket.broadcast.emit("answer", answer);
  });

  socket.on("candidate", (candidate) => {
    socket.broadcast.emit("candidate", candidate);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});
