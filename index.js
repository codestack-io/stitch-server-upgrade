require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors()); 

app.use(express.json());

 
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    res.status(500).send('Database connection failed');
  }
});



const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
console.log("Stripe key loaded:", process.env.STRIPE_SECRET_KEY?.slice(0,10) + "…");

const port = process.env.PORT || 5000
const crypto = require('crypto');

const admin = require("firebase-admin");

// const serviceAccount = require("./stitch-tracker-client-firebase-adminsdk.json");



const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('decoded in the token',decoded);

    req.decoded_email = decoded?.email;
    console.log('decoded',req.decoded_email)

    next();
  } catch (error) {
    return res.status(403).send({ message: "Forbidden" });
  }
};




  const prefix = 'STITCH';
  // const generateTrackingId = require('./utils/generateTrackingId');

  const generateTrackingId = (orderId) => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, ''); // YYYYMMDD

  // 4-character secure random string
  const random = crypto
    .randomBytes(2)            // 2 bytes = 4 hex chars
    .toString('hex')
    .toUpperCase();

  return `GRM-${date}-${orderId}-${random}`;
};








const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdrltck.mongodb.net/?appName=Cluster0`;

let client;
let db;

let modelCollection;
let ordersCollection;
let usersCollection;
let paymentCollection;


async function connectDB() {
  if (db) return; // already connected

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db('product-db');

  modelCollection = db.collection('products');
  ordersCollection = db.collection('neworder');
  usersCollection = db.collection('users');
  paymentCollection = db.collection('payment');

  console.log('MongoDB connected');
}


 

   

   
   
    const verifyAdmin= async (req, res, next) =>{
    const email = req.decoded_email;
    const query = {email};
    const user = await usersCollection.findOne(query);
    console.log("Decoded email:", req.decoded_email);

    if(!user || (user.role !== "admin" )){
      return res.status(403).send({message:'forbidden access'})
    }

    next();
  };

  const verifyManager = async (req, res, next) => {
  try {
    const email = req.decoded_email; // comes from verifyFBToken
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "manager") {
      return res.status(403).send({ message: "Forbidden: Manager only" });
    }

    next(); // user is manager, allow access
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
};


    app.get('/products', async (req, res)=>{ 
     const result = await modelCollection.find().toArray()
     
     res.send(result)})

     


      app.get('/products/home', async (req, res)=>{ 
     const result = await modelCollection
                    .find()
                    .limit(6)
                    .toArray()
     
     res.send(result)})

       app.get('/products/:id' , async (req,res)=>{
      const {id} = req.params
      const query = {_id: new ObjectId(id)}
      
      const result = await modelCollection.findOne(query)
      console.log("Collection:", modelCollection.collectionName);
      res.send({
        success:true,
        result
      })
     })

     app.get('/neworder/:id' ,verifyFBToken,verifyAdmin, async (req,res)=>{
      const {id} = req.params
      const query = {_id: new ObjectId(id)}
      
      const result = await ordersCollection.findOne(query)
      console.log("Collection:", ordersCollection.collectionName);
      res.send({
        success:true,
        result
      })
     })

   

//for manager dashboard
app.get('/allorders', verifyFBToken, verifyAdmin, async (req, res) => {

  const query = {}
  const {email,productStatus} = req.query;

  if(email){
    query.senderEmail = email;
  } 
  if(productStatus){
    query.productStatus = productStatus;
  }
  const options = {sort : {createdAt: -1 } }
  const cursor = ordersCollection
    .find(query,options);
    const result = await cursor.toArray();

  res.send(result);
});

// app.get('/allorders', async (req, res) => {
//   const email = req.query.email;
//   const result = await ordersCollection
//     .find({ customerEmail: email })
//     .toArray();
//   res.send(result);
// });



app.patch('/allorders/:id', async (req, res) => {
  const { status } = req.body;
  const id = req.params.id;
  

  const query = { _id: new ObjectId(id) };
  

  const updateDoc = {
    $set: {
      productStatus: status,     
      approvedAt: new Date()
    }
  };

  const result = await ordersCollection.updateOne(query, updateDoc);
  res.send(result);
});


app.patch("/allorders/tracking/:id", async (req, res) => {
  const id = req.params.id;
  const trackingUpdate = req.body;

  const result = await ordersCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $push: {
        tracking: trackingUpdate
      },
      $set: {
        updatedAt: new Date()
      }
    }
  );

  res.send(result);
});



app.post('/neworder',verifyFBToken, async (req, res) => {
  try {
    const neworder = req.body;
    neworder.createdAt = new Date();
    const result = await ordersCollection.insertOne(neworder);
    res.send({
      success: true,
      result,
    });
  } catch (error) {
    console.error('ORDER INSERT FAILED:', error);
    res.status(500).send({ message: 'Orders failed' });
  }
});

    
app.get('/neworder',verifyFBToken, async (req, res) => {
  const email = req.query.email;
  console.log(req)
  console.log("query email:", req.query.email);
   console.log("decoded email:", req.decoded_email);

  if (!email) {
    return res.status(400).send({ message: 'Email is required' });
  }

  if (email !== req.decoded_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const orders = await ordersCollection
    .find({email })
    .sort({createdAt: -1 })
    .toArray();

  res.send(orders);
});






     // PATCH: toggle product home status
app.patch("/products/:id", async (req, res) => {
  const { id } = req.params;
  const { toggleHome } = req.body;

  const filter = { _id: new ObjectId(id) };

  const updateDoc = {
    $set: {
      toggleHome: toggleHome,
    },
  };

  const result = await modelCollection.updateOne(filter, updateDoc);

  res.send(result);
});


app.patch("/users/:id/role",verifyFBToken,verifyAdmin,async (req, res) => {
  const  id  = req.params;
  const roleInfo = req.body;
  const query = { _id: new ObjectId(id) };
  const updateDoc = {
         $set: { role: roleInfo.role } 
  }

  const result = await usersCollection.updateOne( query, updateDoc );

  res.send(result);
});


app.patch("/users/suspend/:id", verifyFBToken,verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { suspended } = req.body;

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { suspended } }
  );

  res.send(result);
});


app.get('/users/manager', verifyFBToken, verifyManager, async (req, res) => {
  const result = await usersCollection.find({ role: "user" }).toArray(); // e.g., list normal users
  res.send(result);
});

app.patch('/users/manager/:id', verifyFBToken, verifyManager, async (req, res) => {
  const id = req.params.id;

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role: "manager" } } // promote a user to manager
  );

  res.send(result);
});







app.get('/users/:email/role', async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(404).send({ message: 'User not found' });

  res.send({ role: user.role });
});


app.post('/users', async (req, res) => {
  console.log('REQ BODY:', req.body)
  try {
    const newUser = req.body;

    // default values
    newUser.role = newUser.role || 'admin' || 'manager' || 'user';
    newUser.createdAt = new Date();

    const exists = await usersCollection.findOne({ email: newUser.email });
    if (exists) {
      return res.send({ message: 'User already exists' });
    }

    const result = await usersCollection.insertOne(newUser);
    res.send({ success: true, result });

  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'User creation failed' });
  }
});


// app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
//   const users = req.body;
//   const cursor =  usersCollection.find(users); 
//   const result = await cursor.toArray();
//   res.send(result);
// });
app.get('/users',verifyFBToken,verifyManager,async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});

 app.post('/create-checkout-session',verifyFBToken,verifyAdmin,async(req,res) =>{
      try{
       const paymentInfo = req.body;


       const amount = parseInt(paymentInfo.price) * 100;
      
     const session = await stripe.checkout.sessions.create({
         line_items: [
              {
                price_data:{
                   currency: 'usd',
                   unit_amount: amount,
                   product_data:{
                    name :paymentInfo.productName
                   }

                },
                
                quantity: 1,
              },
         ],
         customer_email:paymentInfo.senderEmail,
        
          mode: 'payment',
          metadata:{
            productId: paymentInfo.id,
            name:paymentInfo.productName,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
       });
       console.log(session)
       res.send({url : session.url});
      } catch(err){
        console.error("Checkout error:", err);
        res.status(500).json({error:err.message || "Checkout failed"})
      }
       
     });
     
   

 

      app.patch('/payment-success', async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).send({ message: "Session ID required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).send({ message: "Session not found" });
    }

    if (session.payment_status !== 'paid') {
      return res.send({ success: false });
    }

    if (!session.metadata?.productId) {
      return res.status(400).send({ message: "Product ID missing" });
    }

    const objectId = new ObjectId(session.metadata.productId);

    const existingPayment = await paymentCollection.findOne({
      transactionId: session.payment_intent
    });

    if (existingPayment) {
      return res.send({
        message: 'Already exists',
        transactionId: session.payment_intent
      });
    }

    const trackingId = generateTrackingId();

    await ordersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          payment_status: 'paid',
          productStatus: 'Suspended',
          trackingId
        }
      }
    );

    const payment = {
      amount: session.amount_total / 100,
      currency: session.currency,
      customerEmail: session.customer_email,
      productId: session.metadata.productId,
      productName: session.metadata.name,
      transactionId: session.payment_intent,
      paymentStatus: session.payment_status,
      paidAt: new Date(),
      trackingId
    };

    const resultPayment = await paymentCollection.insertOne(payment);

    res.send({
      success: true,
      trackingId,
      transactionId: session.payment_intent,
      paymentInfo: resultPayment
    });

  } catch (error) {
    console.error("Payment success error:", error);
    res.status(500).send({ error: error.message });
  }
});


app.get('/payments',verifyFBToken,async(req,res)=>{
  const email = req.query.email;
     console.log('query email:', email);
     console.log('token email:', req.decoded_email);
  const query = {};
  console.log('headers',req.headers);
  if (email){
     query.customerEmail = email;
    
  

    //  check email address
      if(email !== req.decoded_email){
        return res.status(403).send({message:'forbidden access'})
      }
  }
  const cursor = paymentCollection.find(query);
  const result = await cursor.toArray();
  res.send(result);
})
  
      
//  app.post('/neworder', async (req, res) => {
//   const {
//     ProductType,
//     email,
//     productName,
//     productStatus,
//     firstName,
//     lastName,
//     paymentMethod,
//     orderQuantity,
//     deliveryAddress,
//     orderprice,   
//   } = req.body;

//   const order = {
//     ProductType,
//     email,
//     productName,
//     productStatus,
//     firstName,
//     lastName,
//     paymentMethod,
//     orderQuantity,
//     deliveryAddress,
//     orderprice,   
//     createdAt: new Date(),
//   };

//   const result = await ordersCollection.insertOne(order);
//   res.send(result);
// });


     
     

   







    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  //} finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  //}




app.get('/', (req,res)=>{
    res.send("Server is running fine")
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

module.exports = app;