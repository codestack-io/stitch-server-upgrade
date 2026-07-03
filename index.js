import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import crypto from "crypto";
import admin from "firebase-admin";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

const app = express();

// ===================== MIDDLEWARE =====================
app.use(express.json());

app.use(
  cors({
    origin: [  "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175", process.env.CLIENT_URL],
    credentials: true,
  })
);

// ===================== STRIPE =====================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ===================== FIREBASE ADMIN (SAFE FOR DEPLOY) =====================
const decoded = Buffer.from(
  process.env.FB_SERVICE_KEY,
  "base64"
).toString("utf8");

console.log(decoded.slice(0, 100));
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ===================== MONGODB =====================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdrltck.mongodb.net/?appName=Cluster0";`;

let db;
let productsCollection;
let ordersCollection;
let usersCollection;
let paymentCollection;

async function connectDB() {
  if (db) return;

  const client = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1,
  });

  await client.connect();
  db = client.db("product-db");

  productsCollection = db.collection("products");
  ordersCollection = db.collection("neworder");
  usersCollection = db.collection("users");
  paymentCollection = db.collection("payment");

  console.log("✅ MongoDB connected");
}

// auto connect middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB Error:", err);
    res.status(500).send({
      message: "DB connection failed",
      error: err.message,
    });
  }
});

// ===================== AUTH MIDDLEWARE =====================
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);

    req.decoded_email = decoded.email;
    next();
  } catch {
    res.status(403).send({ message: "Forbidden" });
  }
};

// ===================== ROLE CHECK =====================
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded_email;

  const user = await usersCollection.findOne({ email });

  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "Admin only" });
  }

  next();
};

// ===================== PRODUCTS =====================
app.get("/products", async (req, res) => {
  const result = await productsCollection.find().toArray();
  res.send(result);
});

app.get("/products/:id", async (req, res) => {
  const id = req.params.id;

  const result = await productsCollection.findOne({
    _id: new ObjectId(id),
  });

  res.send({ success: true, result });
});

// related products FIXED
app.get("/products/related/:id", async (req, res) => {
  const id = req.params.id;

  const current = await productsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!current) {
    return res.status(404).send({ message: "Not found" });
  }

  const related = await productsCollection
    .find({
      category: current.category,
      _id: { $ne: new ObjectId(id) },
    })
    .limit(4)
    .toArray();

  res.send({ success: true, result: related });
});

// ===================== STEPS =====================

const steps = [
  {
    id: 1,
    icon: "🧵",
    title: "Create Order",
    desc: "Submit your stitching request."
  },
  {
    id: 2,
    icon: "✂️",
    title: "Production",
    desc: "Tailors complete the work."
  },
  {
    id: 3,
    icon: "📦",
    title: "Delivery",
    desc: "Receive your finished order."
  }
];

app.get("/steps", (req, res) => {
  res.send(steps);
});


// ===================== ORDERS =====================
app.post("/neworder", verifyFBToken, async (req, res) => {
  const order = req.body;
  order.createdAt = new Date();

  const result = await ordersCollection.insertOne(order);
  res.send({ success: true, result });
});

app.get("/neworder", verifyFBToken, async (req, res) => {
  const email = req.query.email;

  if (email !== req.decoded_email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const orders = await ordersCollection
    .find({ email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(orders);
});

// ===================== STATS =====================
app.get("/stats", async (req, res) => {
  const products = await productsCollection.countDocuments();
  const users = await usersCollection.countDocuments();
  const orders = await ordersCollection.countDocuments();
  const payments = await paymentCollection.countDocuments();

  res.send({ products, users, orders, payments });
});

// ===================== USERS =====================
app.post("/users", async (req, res) => {
  const user = req.body;

  const exists = await usersCollection.findOne({ email: user.email });
  if (exists) return res.send({ message: "User exists" });

  await usersCollection.insertOne({
    ...user,
    role: "user",
    createdAt: new Date(),
  });

  res.send({ success: true });
});

app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

app.get("/users/:email/role", verifyFBToken, async (req, res) => {
  const email = req.params.email;

  // Prevent users from checking other users' roles
  if (email !== req.decoded_email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send({ role: user.role });
});

// ===================== STRIPE =====================
app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
  const { productName, price, senderEmail, id } = req.body;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: productName },
          unit_amount: parseInt(price) * 100,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    customer_email: senderEmail,

    metadata: {
      productId: id,
    },

    success_url: `${process.env.SITE_DOMAIN}/success`,
    cancel_url: `${process.env.SITE_DOMAIN}/cancel`,
  });

  res.send({ url: session.url });
});

// ===================== ROOT =====================
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ===================== START =====================
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});