const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
const {
  Server,
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Memo
} = require('@stellar/stellar-sdk');

dotenv.config();
const app = express();
app.use(express.json());

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const stellarServer = new Server('https://api.testnet.minepi.com');

app.listen(3000, () => {
  console.log('✅ A2U backend running on port 3000');
});
