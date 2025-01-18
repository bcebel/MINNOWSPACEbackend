// utils/auth.js
import jwt from "jsonwebtoken";

const secret = "mysecretssshhhhhhh";
const expiration = "2h";
const authMiddleware = {
  signToken: function ({ email, name, _id }) {
    const payload = { email, name, _id };
    return jwt.sign(payload, secret, { expiresIn: expiration });
  },
};

export default authMiddleware;
