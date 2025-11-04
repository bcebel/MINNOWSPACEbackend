// utils/auth.js
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "SECRET_KEY"; // ✅ Match mutations.js
const expiration = "2h";

const authMiddleware = {
  signToken: function ({ email, name, _id }) {
    const payload = { email, name, _id };
    return jwt.sign(payload, secret, { expiresIn: expiration });
  },
};

export default authMiddleware;
