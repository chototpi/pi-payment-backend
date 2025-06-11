import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import StellarSdk from '@stellar/stellar-sdk';

dotenv.config();
const app = express();
app.use(express.json());

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const stellarServer = new StellarSdk.Server('https://api.testnet.minepi.com');

const axiosClient = axios.create({
  baseURL: 'https://api.minepi.com',
  timeout: 20000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

app.post('/api/a2u-test', async (req, res) => {
  const { uid, amount, memo } = req.body;
  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: "Thiếu thông tin" });
  }

  try {
    const createRes = await axiosClient.post('/v2/payments', { amount, memo, uid, metadata: { test: true } });
    const { identifier, recipient } = createRes.data;

    const account = await stellarServer.loadAccount(APP_PUBLIC_KEY);
    const fee = await stellarServer.fetchBaseFee();
    const timebounds = await stellarServer.fetchTimebounds(180);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: fee.toString(),
      networkPassphrase: 'Pi Testnet',
      timebounds
    })
    .addOperation(StellarSdk.Operation.payment({
      destination: recipient,
      asset: StellarSdk.Asset.native(),
      amount: amount.toString()
    }))
    .addMemo(StellarSdk.Memo.text(identifier))
    .build();

    tx.sign(StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY));
    const result = await stellarServer.submitTransaction(tx);

    await axiosClient.post(`/v2/payments/${identifier}/complete`, { txid: result.id });
    res.json({ success: true, txid: result.id });
  } catch (err) {
    console.error("❌ A2U error:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("✅ A2U server running on port 3000"));
