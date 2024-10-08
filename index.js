const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');
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
// ------------verifyToken-------------
    const verifyToken = (req, res, next) => {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).send('Unauthorized access denied');
      }
    
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (ex) {
        if (ex.name === 'TokenExpiredError') {
          return res.status(401).send('Session expired');
        }
        res.status(400).send('Unauthorized access denied');
      }
    };

    // Routes
    app.get('/', (req, res) => {      
      res.send('QuickPay Wallet Server Is Running');
    });

// Register user
app.post("/register", async (req, res) => {
  try {
    const newUser = req.body;
    console.log(newUser); // Debugging: Remove in production

    // Validate the incoming data
    if (!newUser.name || !newUser.email || !newUser.mobileNumber || !newUser.pin || !newUser.role || newUser.balance === undefined) {
      return res.status(400).send('All fields are required');
    }

    // Check if email or mobile number already exists
    const existingUser = await usersCollection.findOne({
      $or: [
        { email: newUser.email },
        { mobileNumber: newUser.mobileNumber }
      ]
    });

    if (existingUser) {
      return res.status(400).send('Email or mobile number already exists');
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newUser.pin, salt);
    newUser.pin = hashedPassword;

    // Insert the new user into the database
    const result = await usersCollection.insertOne(newUser);
    if (result.insertedId) {
      const token = generateToken(newUser); // Ensure generateToken function exists
      res.status(201).send({ token });
    } else {
      res.status(500).send('Error creating new user');
    }
  } catch (error) {
    console.error('Error creating new user:', error);
    res.status(500).send('Error creating new user');
  }
});





    // User login
    app.post('/login', async (req, res) => {
      const { email, pin } = req.body;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(400).send('User not found');
      }

      if(user.status === 'blocked' || user.status === 'pending'){
        return res.status(403).send('Your account is blocked or pending');
      }

      const isMatch = await bcrypt.compare(pin, user.pin);

      if (!isMatch) {
        return res.status(400).send('Invalid credentials');
      }

      const token = generateToken(user);
      res.send({ token });
    });

    // get all users
    app.get('/all-users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });
    app.post('/users', async (req, res) => {
      try {
          const users = await usersCollection.find().toArray();
          res.send(users);
      } catch (error) {
          res.status(500).send({ message: error.message });
      }
  });

  // update user status
  app.patch('/users/:id/status',verifyToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
    );

    if (result.modifiedCount > 0) {
        res.send({ message: 'Status updated successfully' });
    } else {
        res.status(400).send({ message: 'Failed to update status' });
    }
});



// show all translations
app.post('/users/transactions',verifyToken, async (req, res) => {
  try {
    const usersTransactions = await usersCollection.find(
      { transactions: { $exists: true, $not: { $size: 0 } } },
      { projection: { transactions: 1, _id: 0 } } 
    ).toArray();

    const allTransactions = usersTransactions.flatMap(user => user.transactions);

    res.send(allTransactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).send('Server Error');
  }
});

    // get translation by id

  // Check for existing users
  app.post("/check-users", async (req, res) => {
    try {
      const { email, mobileNumber } = req.body;
  
      // Check if email or mobile number already exists
      const existingUsers = await usersCollection.find({
        $or: [
          { email: email },
          { mobileNumber: mobileNumber }
        ]
      }).toArray();
  
      const emailExists = existingUsers.some(user => user.email === email);
      const mobileNumberExists = existingUsers.some(user => user.mobileNumber === mobileNumber);
  
      res.send({ emailExists, mobileNumberExists });
    } catch (error) {
      res.status(500).send('Error checking user existence');
    }
  });
  
     // Get user by email
  app.get("/users/:email",verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send(result);
  });

  // ------------------------------
  // Send Money

 app.post('/sendMoney',verifyToken, async (req, res) => {
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
    const senderNumber = sender.mobileNumber;

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

    // Prepare transaction details
    const transaction = {
      date: new Date(),
      receiverNumber,
      senderNumber,
      amount,
      fee,
      totalAmount,
      type: 'debit'
    };

    const receiverTransaction = {
      date: new Date(),
      senderNumber,
      receiverNumber,
      amount,
      fee: 0, 
      totalAmount: amount,
      type: 'credit'
    };

    // Update sender's balance and transaction history
    await usersCollection.updateOne(
      { email: senderEmail },
      {
        $inc: { balance: -totalAmount },
        $push: { transactions: transaction }
      }
    );

    // Update receiver's balance and transaction history
    await usersCollection.updateOne(
      { mobileNumber: receiverNumber },
      {
        $inc: { balance: amount },
        $push: { transactions: receiverTransaction }
      }
    );

    res.status(200).send('Money sent successfully');
  } catch (error) {
    console.error('Error sending money:', error);
    res.status(500).send('Server error');
  }
});
 
  // ------------------------------


  // ------------------------------
  // Withdraw Money
  app.post('/withdrawMoney',verifyToken,  async (req, res) => {
    const { senderId, agentNumber, amount: amountStr, pin } = req.body;
    const senderEmail = req.headers.email;
  
    // Convert amount to number
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).send('Invalid amount');
    }
  
    try {
      // Find the user by ID and the agent by mobile number
      const user = await usersCollection.findOne({  email: senderEmail });
      const agent = await usersCollection.findOne({ mobileNumber: agentNumber, role: 'agent' });
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      if (!agent) {
        return res.status(404).send('Agent not found');
      }
  
      // Verify the user's PIN
      const isPinMatch = await bcrypt.compare(pin, user.pin);
      if (!isPinMatch) {
        return res.status(400).send('Invalid PIN');
      }
  
      // Calculate the fee and total amount to deduct
      const fee = (1.5 / 100) * amount;
      const totalAmount = amount + fee;
  
      // Check if the user has enough balance
      if (user.balance < totalAmount) {
        return res.status(400).send('Insufficient balance');
      }
  
      // Update user's balance and add transaction history
      const userTransaction = {
        type: 'withdraw',
        toAgent: agent.mobileNumber,
        fromUser: user.mobileNumber,
        amount,
        fee,
        date: new Date(),
      };
  
      await usersCollection.updateOne(
        {  email: senderEmail },
        {
          $inc: { balance: -totalAmount },
          $push: { transactions: userTransaction }
        }
      );
  
      // Update agent's balance and add transaction history
      const agentTransaction = {
        type: 'deposit',
        fromUser: user.mobileNumber,
        toAgent: agent.mobileNumber,
        amount: amount + fee,
        fee,
        date: new Date(),
      };
  
      await usersCollection.updateOne(
        { mobileNumber: agentNumber },
        {
          $inc: { balance: amount + fee },
          $push: { transactions: agentTransaction }
        }
      );
  
      res.status(200).send('Withdraw successful');
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      res.status(500).send('Server error');
    }
  });
  // ------------------------------





  // ------------------------------
  // Cash In Request-------
  app.post('/cashInRequest',verifyToken, async (req, res) => {
    const { amount: amountStr, agentNumber } = req.body;
    const senderEmail = req.headers.email;
  
    // Convert amount to number
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).send('Invalid amount');
    }
  
    try {
      // Find the user and the agent by mobile number
      const user = await usersCollection.findOne({ email: senderEmail });
      const agent = await usersCollection.findOne({ mobileNumber: agentNumber, role: 'agent' });
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      if (!agent) {
        return res.status(404).send('Agent not found');
      }
  
      // Create a cash-in request pending approval
      const agentRequest = {
        status: 'pending',
        amount: amount,
        date: new Date(),
        fromUser: user.mobileNumber,
      };
  
      await usersCollection.updateOne(
        { mobileNumber: agentNumber },
        { $push: { requests: agentRequest } }
      );
  
      return res.status(200).send('Cash-in request submitted successfully');
    } catch (error) {
      console.error('Cash-in error:', error);
      return res.status(500).send('Server error');
    }
  });

  // ------------------------------
  // 
  app.post('/transactions',verifyToken, async (req, res) => {
    const userEmail = req.headers.email;
  
    if (!userEmail) {
      return res.status(400).send('Email is required');
    }
  
    try {
      // Find the user by email
      const user = await usersCollection.findOne({ email: userEmail });
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      // Extract transactions from the user's data
      const transactions = user.transactions || [];
  
      return res.status(200).json(transactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).send('Server error');
    }
});

  // ------------------------------

  // ------------------------------

app.post('/request',verifyToken, async (req, res) => {
    const userEmail = req.headers.email;

    if (!userEmail) {
        return res.status(400).send('Email is required');
    }

    try {
        // Find the user by email
        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Extract transactions from the user's data
        const requests = user.requests || [];

        return res.status(200).json(requests);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return res.status(500).send('Server error');
    }
});
  // ------------------------------

  app.post("/handleRequest",verifyToken, async (req, res) => {
    const { requestNumber, requestAmount, action } = req.body;
    const userEmail = req.headers.email;
  
    if (!userEmail) {
      return res.status(400).send('Email is required');
    }
  
    try {
      // Find the requesting user by their mobile number
      const user = await usersCollection.findOne({ mobileNumber: requestNumber });
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      // Find the agent by their email
      const agent = await usersCollection.findOne({ email: userEmail });
      if (!agent) {
        return res.status(404).send('Agent not found');
      }
  
      if (action === 'approve') {
        // check the user have enough amount
        if (user.balance < requestAmount) {
          return res.status(400).send('Insufficient balance');
        }
        // Update the user's balance
        await usersCollection.updateOne(
          { mobileNumber: requestNumber },
          { $inc: { balance: requestAmount } } 
        );
  
        await usersCollection.updateOne(
          { email: userEmail },
          { $inc: { balance: -requestAmount } }
        );
        // delete the request 
        await usersCollection.updateOne(
          { email: userEmail },
          { $pull: { requests: { fromUser: requestNumber} } } 
        );
        // add the translation history for the agents
        const transaction = {
          type: 'cash-in-agent',
          toUser: requestNumber,
          amount: requestAmount,
          date: new Date(),
        };
        await usersCollection.updateOne(
          { email: userEmail },
          { $push: { transactions: transaction } }
        );
        // add the translation history for the user
        const transactionUser = {
          type: 'cash-in-user',
          toAgent: agent.mobileNumber,
          amount: requestAmount,
          date: new Date(),
        };
        await usersCollection.updateOne(
          { mobileNumber: requestNumber },
          { $push: { transactions: transactionUser } }
        );
        return res.status(200).send('Approve successfully');
  
      } else if (action === 'deny') {
        // Remove the request from the agent's requests list
        await usersCollection.updateOne(
          { email: userEmail },
          { $pull: { requests: { fromUser: requestNumber} } } 
        );
        return res.status(200).send('Deny successfully');
  
      } else {
        return res.status(400).send('Invalid action');
      }
    } catch (error) {
      console.error('Error handling request:', error);
      return res.status(500).send('Server error');
    }
  });
  
  

// Example of enhanced error handling in protected route
app.get('/protected',verifyToken, (req, res) => {
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
