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

// Gửi yêu cầu tạo thanh toán mặc định khi khởi động
const userUid = "a1111111-aaaa-bbbb-2222-ccccccc3333d";
const body = { amount: 1, memo: "Memo", metadata: { test: "your metadata" }, uid: userUid };

let paymentIdentifier, recipientAddress;

axiosClient.post(`/v2/payments`, body)
  .then(async (response) => {
    paymentIdentifier = response.data.identifier;
    recipientAddress = response.data.recipient;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(myPublicKey);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: 'Pi Testnet',
      timebounds
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipientAddress,
        asset: StellarSdk.Asset.native(),
        amount: body.amount.toString()
      }))
      .addMemo(StellarSdk.Memo.text(paymentIdentifier))
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
    transaction.sign(keypair);

    const submitResult = await server.submitTransaction(transaction);
    const txid = submitResult.id;

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });
    console.log('✅ Giao dịch hoàn tất:', txid);
  })
  .catch((err) => {
    console.error('❌ Lỗi khi gửi thanh toán A2U:', err.response?.data || err.message);
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

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),networkPassphrase: 'Pi Testnet',
      timebounds
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipient,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString()
      }))
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
