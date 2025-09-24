// src/index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } from "@stellar/stellar-sdk";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// 🔑 Biến môi trường
const PI_API_KEY = process.env.PI_API_KEY;       // Key Testnet app
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

const axiosClient = axios.create({
  baseURL: "https://api.testnet.minepi.com",
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const server = new Server(HORIZON_URL);

// =============================
// 📌 ROUTER: A2U Testnet chuẩn
// =============================
app.post("/api/a2u-test", async (req, res) => {
  const { uid, username, amount } = req.body;
  const memo = "A2U-test";

  if (!uid || !username || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu uid, username hoặc amount" });
  }

  try {
    // 1️⃣ Tạo payment trên Pi Testnet
    const createRes = await axiosClient.post("/v2/payments", {
      amount,
      memo,
      metadata: { type: "A2U" },
      uid,
      username,
    });

    const paymentIdentifier = createRes.data.identifier;
    const recipientPubKey = createRes.data.recipient;

    console.log("✅ Payment created:", paymentIdentifier, recipientPubKey);

    // 2️⃣ Load account app
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 3️⃣ Tạo Stellar transaction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds,
    })
      .addOperation(Operation.payment({
        destination: recipientPubKey,
        asset: Asset.native(),
        amount: amount.toString(),
      }))
      .addMemo(Memo.text(memo))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;
    console.log("✅ Transaction submitted:", txid);

    // 4️⃣ Complete payment
    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, paymentId: paymentIdentifier, txid });
  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý A2U",
      error: err.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend A2U Testnet chạy cổng ${PORT}`));
