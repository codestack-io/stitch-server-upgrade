import dotenv from "dotenv";

dotenv.config();
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import crypto from "crypto";
import admin from "firebase-admin";
import serviceAccount from "./stitch-tracker-client-firebase-adminsdk-json.json" with { type: "json" };;
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";


const router = express.Router();
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



const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
console.log("Stripe key loaded:", process.env.STRIPE_SECRET_KEY?.slice(0,10) + "…");

const port = process.env.PORT || 5000







const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')


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

app.get("/stats", async (req, res) => {
  try {
    const productsCount = await modelCollection.countDocuments();
    const usersCount = await usersCollection.countDocuments();
    const ordersCount = await ordersCollection.countDocuments();
    const paymentsCount = await paymentCollection.countDocuments();

    res.send({
      products: productsCount,
      users: usersCount,
      orders: ordersCount,
      payments: paymentsCount,
      supportHours: 24, // static business value
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).send({ message: "Failed to load stats" });
  }
});

app.get("/steps", async (req, res) => {
  try {
    res.send([
      {
        id: 1,
        title: "Choose Product",
        desc: "Select your desired product from our catalog",
        icon: "🛍️",
      },
      {
        id: 2,
        title: "Place Order",
        desc: "Confirm your order with secure checkout",
        icon: "💳",
      },
      {
        id: 3,
        title: "Get Delivery",
        desc: "Receive your product at your doorstep",
        icon: "🚚",
      },
    ]);
  } catch (error) {
    res.status(500).send({ message: "Failed to load steps" });
  }
});

app.get("/brands", async (req, res) => {
  try {
    res.send([
      { id: 1, name: "Nike" },
      { id: 2, name: "Adidas" },
      { id: 3, name: "Puma" },
      { id: 4, name: "Zara" },
      { id: 5, name: "Gucci" },
    ]);
  } catch (error) {
    res.status(500).send({ message: "Failed to load brands" });
  }
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

router.get("/products/related/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find current product
    const currentProduct = await Product.findById(id);

    if (!currentProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2. Find related products (same category, exclude current one)
    const related = await Product.find({
      category: currentProduct.category,
      _id: { $ne: id },
    }).limit(4);

    res.json({
      success: true,
      result: related,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
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
// GET related products by product id
router.get("/products/related/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const currentProduct = await Product.findById(id);

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const relatedProducts = await Product.find({
      category: currentProduct.category,
      _id: { $ne: id }, // exclude current product
    }).limit(4);

    res.json({
      success: true,
      result: relatedProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
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
    newUser.role = newUser.role || "user";
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

app.post('/create-checkout-session', verifyFBToken, async (req, res) => {
  try {
    const paymentInfo = req.body;

    const amount = parseInt(paymentInfo.price) * 100;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: paymentInfo.productName,
            },
          },
          quantity: 1,
        },
      ],

      customer_email: paymentInfo.senderEmail,

      mode: 'payment',

      metadata: {
        productId: paymentInfo.id,
        name: paymentInfo.productName,
      },

      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    });

    res.send({ url: session.url });

  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message || "Checkout failed" });
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
  
router.get("/products", async (req, res) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      rating,
      sort,
      page = 1,
      limit = 8,
    } = req.query;

    let query = {};

    // 🔎 SEARCH
    if (search) {
      query.productName = {
        $regex: search,
        $options: "i",
      };
    }

    // 📂 CATEGORY FILTER
    if (category) {
      query.category = category;
    }

    // 💰 PRICE FILTER
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // ⭐ RATING FILTER
    if (rating) {
      query.rating = { $gte: Number(rating) };
    }

    // 📊 SORTING
    let sortOption = {};
    if (sort === "lowToHigh") sortOption.price = 1;
    if (sort === "highToLow") sortOption.price = -1;
    if (sort === "newest") sortOption.createdAt = -1;

    // 📄 PAGINATION
    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      result: products,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});    

app.post("/register", async (req, res) => {
  const { email, password, role } = req.body;

  // ✅ 1. VALIDATION (MUST BE FIRST)
  if (!email || !password) {
    return res.status(400).send({ message: "Email and password required" });
  }

  if (password.length < 6) {
    return res.status(400).send({ message: "Password too short" });
  }

  try {
    // ✅ 2. Check if user already exists (IMPORTANT BEST PRACTICE)
    const exists = await usersCollection.findOne({ email });
    if (exists) {
      return res.status(409).send({ message: "User already exists" });
    }

    // ✅ 3. Hash password AFTER validation
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ 4. Create user object
    const user = {
      email,
      password: hashedPassword,
      role: role || "user",
      createdAt: new Date(),
    };

    // ✅ 5. Save to DB
    await usersCollection.insertOne(user);

    res.send({ success: true, message: "User registered successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await usersCollection.findOne({ email });

  if (!user) return res.status(404).send({ message: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch)
    return res.status(401).send({ message: "Invalid password" });

  const token = jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.send({ token, user });
});


     
     

   










app.get('/', (req,res)=>{
    res.send("Server is running fine")
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

export default app;