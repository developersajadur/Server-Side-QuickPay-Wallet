const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Client
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    // Optionally, ping MongoDB to confirm connection
    await client.db('admin').command({ ping: 1 });
    console.log('Ping successful');

    // Example: Define routes or further setup MongoDB interactions here

  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  }
}

// Run MongoDB connection
connectToMongoDB();

// Routes




app.get('/', (req, res) => {
  res.send('QuickPay Wallet Server Is Running');
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
