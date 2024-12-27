const express = require("express");
const app = express();
const PORT = process.env.PORT || 3001;
     const cors = require("cors"); // Install: npm install cors

     app.use(
       cors({
         origin:
           "https://vercel.com/bcebels-projects/minnowspacexpo/2Srx47L8gZRjZz5Bn1ssmnNs9saT", // Allow requests from this origin
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
