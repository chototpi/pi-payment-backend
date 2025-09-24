import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 Biến môi trường
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// Client gọi Pi Platform API
const piPlatform = axios.create({
  baseURL: "https://api.minepi.com/v2",
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
    // 1️⃣ Lấy ví từ Pi Platform (dựa vào uid)
    const userRes = await piPlatform.get(`/users/${uid}`);
    const recipientAddress = userRes.data.wallet_address;
    if (!recipientAddress) {
      return res.status(404).json({
        success: false,
        message: "User không có ví testnet",
      });
    }
    console.log("✅ Wallet:", recipientAddress);

    // 2️⃣ Tạo Payment object (ghi nhận trên Pi Platform)
    const createRes = await piPlatform.post("/payments", {
      amount,
      memo,
      metadata: { type: "A2U" },
      uid,
      username,
    });
    const paymentIdentifier = createRes.data.identifier;
    console.log("✅ Payment created:", paymentIdentifier);

    // 3️⃣ Load account testnet
    const server = new Server(HORIZON_URL);
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 4️⃣ Giao dịch Stellar
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
    // 5️⃣ Complete payment trên Pi Platform
    await piPlatform.post(`/payments/${paymentIdentifier}/complete`, { txid });

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
// Server start
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U Testnet backend đang chạy tại cổng ${PORT}`);
});
