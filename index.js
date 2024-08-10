const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
    const usersCollection = client.db("QuickPayWallet").collection("users");

    // Generate JWT
    const generateToken = (user) => {
      return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
        expiresIn: '1h', // Token expires in 1 hour
      });
    };

    // Routes
    app.get('/', (req, res) => {
      res.send('QuickPay Wallet Server Is Running');
    });

    // Register user
    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newUser.pin, salt);

        // Replace the plain text password with the hashed password
        newUser.pin = hashedPassword;

        const result = await usersCollection.insertOne(newUser);
        if (result.insertedId) {
          const token = generateToken(newUser);
          res.send({ token });
        } else {
          res.status(500).send('Error creating new user');
        }
      } catch (error) {
        res.status(500).send('Error creating new user');
      }
    });

    // get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });
     // Get user by email
  app.get("/users/:email", async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send(result);
  });

  // ------------------------------
  // Send Money
app.post('/sendMoney', async (req, res) => {
  const { receiverNumber, amount: amountStr, pin } = req.body;
  const senderEmail = req.headers.email;

  // Convert amount to number
  const amount = Number(amountStr);
  if (isNaN(amount)) {
    return res.status(400).send('Invalid amount');
  }

  // Calculate fee if amount is over 100 Taka
  const fee = amount > 100 ? 5 : 0;
  const totalAmount = amount + fee;

  try {
    // Check if the sender and recipient exist
    const sender = await usersCollection.findOne({ email: senderEmail });
    const receiver = await usersCollection.findOne({ mobileNumber: receiverNumber });

    if (!sender) {
      return res.status(404).send('Sender not found');
    }

    if (!receiver) {
      return res.status(404).send('Receiver not found');
    }

    // Verify the sender's PIN
    const isMatch = await bcrypt.compare(pin, sender.pin);
    if (!isMatch) {
      return res.status(400).send('Invalid PIN');
    }

    // Check if sender has enough balance
    if (sender.balance < totalAmount) {
      return res.status(400).send('Insufficient balance');
    }

    // Update balances
    await usersCollection.updateOne(
      { email: senderEmail },
      { $inc: { balance: -totalAmount } } 
    );

    await usersCollection.updateOne(
      { mobileNumber: receiverNumber },
      { $inc: { balance: amount } } 
    );

    res.send('Money sent successfully');
  } catch (error) {
    console.error('Error sending money:', error);
    res.status(500).send('Server error');
  }
});

  // ------------------------------

     // // get user roles
    // app.get('/users-roles', async (req, res) => {
    //  const options = {
    //    projection: { role: 1 }
    //  }
    //  const users = await usersCollection.find({}, options).toArray();
    //   res.send(users);
    // });


    // User login
    app.post('/login', async (req, res) => {
      const { email, pin } = req.body;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(400).send('User not found');
      }

      const isMatch = await bcrypt.compare(pin, user.pin);

      if (!isMatch) {
        return res.status(400).send('Invalid credentials');
      }

      const token = generateToken(user);
      res.send({ token });
    });
// Example of enhanced error handling in protected route
app.get('/protected', (req, res) => {
  const token = req.header('Authorization').replace('Bearer ', '');

  if (!token) {
    return res.status(401).send('Unauthorized: No token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    res.send('Token is valid');
  } catch (ex) {
    if (ex.name === 'TokenExpiredError') {
      return res.status(401).send('Unauthorized: Token has expired');
    }
    res.status(400).send('Unauthorized: Token is invalid');
  }
});

    // Start server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
  });
