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
    return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc." });
  }

  try {
    const body = { amount, memo, metadata: { test: true }, uid };
    const paymentRes = await axiosClient.post('/v2/payments', body);
    const { identifier, recipient } = paymentRes.data;

    const appAccount = await stellarServer.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await stellarServer.fetchBaseFee();
    const timebounds = await stellarServer.fetchTimebounds(180);

    const tx = new StellarSdk.TransactionBuilder(appAccount, {
      fee: baseFee.toString(),
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

    const keypair = StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const submitResult = await stellarServer.submitTransaction(tx);

    const completeRes = await axiosClient.post(`/v2/payments/${identifier}/complete`, {
      txid: submitResult.id
    });

    return res.json({
      success: true,
      txid: submitResult.id,
      paymentId: identifier,
      complete: completeRes.status === 200
    });

  } catch (error) {
    console.error("Lỗi A2U:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Lỗi khi xử lý A2U", error: error?.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U backend đang chạy tại http://localhost:${PORT}`);
});
