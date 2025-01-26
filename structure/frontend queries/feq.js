import { ApolloClient, InMemoryCache, gql } from "@apollo/client";

const client = new ApolloClient({
  uri: "http://localhost:4000/graphql",
  cache: new InMemoryCache(),
});

const GET_VIDEOS = gql`
  query GetVideos {
    videos {
      id
      title
      description
      youtubeVideoId
      thumbnail
      user {
        username
      }
    }
  }
`;

client.query({ query: GET_VIDEOS }).then((result) => console.log(result));

// Subscribe to new posts
const POST_ADDED_SUBSCRIPTION = gql`
  subscription OnPostAdded($feedType: String, $groupId: ID) {
    postAdded(feedType: $feedType, groupId: $groupId) {
      id
      content
      author {
        username
      }
    }
  }
`;

// Subscribe to new messages
const MESSAGE_ADDED_SUBSCRIPTION = gql`
  subscription OnMessageAdded($chatId: ID!) {
    messageAdded(chatId: $chatId) {
      id
      content
      sender {
        username
      }
    }
  }
`;

io.on("connection", (socket) => {
  socket.on("sendMessage", async ({ chatId, senderId, content }) => {
    const message = { sender: senderId, content, timestamp: new Date() };
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { messages: message } },
      { new: true }
    );
    io.to(chatId).emit("messageReceived", chat);
  });
});
