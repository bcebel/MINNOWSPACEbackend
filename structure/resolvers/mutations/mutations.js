loginUser: async (_, { username, password }) => {
  const user = await User.findOne({ username });
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid password");

  const token = jwt.sign(
    { _id: user._id },  // ✅ CHANGE TO _id
    "mysecretssshhhhhhh",  // ✅ SAME SECRET AS registerUser
    { expiresIn: "24h" }
  );

  return {
    token,
    user,
  };
},