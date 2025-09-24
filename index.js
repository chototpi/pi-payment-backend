import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());

// ✅ Cho phép mọi domain gọi API (CORS không giới hạn)
app.use(cors());

// 🔑 Biến môi trường
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// 🔌 Client gọi API Pi Platform
const piPlatform = axios.create({
  baseURL: "https://api.minepi.com", // ✅ không để /v2 ở đây
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// =============================
// 📌 ROUTER: A2U Testnet
// =============================
app.post("/api/a2u-test", async (req, res) => {
  const { uid, username, amount } = req.body;
  const memo = "A2U-test";

  console.log("🔍 A2U REQUEST:", { uid, username, amount });

  if (!uid || !username || !amount) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu uid, username hoặc amount" });
  }

  try {
    // 1️⃣ Tạo Payment trên Pi Platform
    const body = { amount, memo, metadata: { type: "A2U" }, uid, username };
    const createRes = await piPlatform.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    console.log("✅ Payment created:", paymentIdentifier);

    // 2️⃣ Load tài khoản nguồn testnet
    const server = new Server(HORIZON_URL);
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 3️⃣ Tạo giao dịch Stellar
    const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds,
    })
      .addOperation(
        Operation.payment({
          destination: recipientAddress,
          asset: Asset.native(),
          amount: amount.toString(),
        })
      )
      .addMemo(Memo.text(memo))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;
    console.log("✅ Transaction submitted:", txid);

    // 4️⃣ Complete payment trên Pi Platform
    await piPlatform.post(`/v2/payments/${paymentIdentifier}/complete`, {
      txid,
    });

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

// =============================
// 🚀 Khởi động server
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U Testnet backend đang chạy tại cổng ${PORT}`);
});
