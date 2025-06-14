import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import StellarSdk from '@stellar/stellar-sdk';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
  origin: 'https://chototpi.site'
}));

const PI_API_KEY = process.env.PI_API_KEY;
const myPublicKey = process.env.APP_PUBLIC_KEY;
const mySecretSeed = process.env.APP_PRIVATE_KEY;

const axiosClient = axios.create({
  baseURL: 'https://api.testnet.minepi.com',
  timeout: 20000,
  headers: {
    'Authorization': `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// ✅ BỔ SUNG ROUTER: cho phép frontend gửi A2U động
app.post("/api/a2u-test", async (req, res) => {
  const { uid, amount, memo } = req.body;

  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: "Thiếu uid, amount hoặc memo" });
  }

  try {
    const paymentBody = { amount, memo, metadata: { test: true }, uid };
    const paymentRes = await axiosClient.post("/v2/payments", paymentBody);
    const { identifier, recipient } = paymentRes.data;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(myPublicKey);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    let operation;

    const recipientExists = await server
      .loadAccount(recipient)
      .then(() => true)
      .catch(() => false);

    if (!recipientExists) {
      console.log("📌 Recipient chưa tồn tại. Sẽ tạo tài khoản mới.");
      operation = StellarSdk.Operation.createAccount({
        destination: recipient,
        startingBalance: amount.toString()
      });
    } else {
      operation = StellarSdk.Operation.payment({
        destination: recipient,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString()
      });
    }

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(identifier))
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
    transaction.sign(keypair);

    const submitResult = await server.submitTransaction(transaction);
    const txid = submitResult.id;

    await axiosClient.post(`/v2/payments/${identifier}/complete`, { txid });

    res.json({ success: true, txid, identifier });

  } catch (err) {
    console.error("❌ A2U dynamic error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Lỗi khi xử lý A2U", error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U backend chạy tại http://localhost:${PORT}`);
});
