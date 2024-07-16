const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI from environment variables
const mongoURI = process.env.MONGODB_URI;

// Create a new MongoClient
const client = new MongoClient(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Connect to MongoDB
client.connect()
  .then(() => {
    console.log("Connected to MongoDB");


  // Database collections
  const usersCollection =  client.db("QuickPayWallet").collection("users");



    // Routes
    app.get('/', (req, res) => {
      res.send('QuickPay Wallet Server Is Running');
    });

    // get all users
    app.get("/users", async(req, res) => {
        const allUsers = await usersCollection.find().toArray();
        res.send(allUsers);
    })

    // Start server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
  });
