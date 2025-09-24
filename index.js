// backend/index.js
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

const axiosClient = axios.create({
  baseURL: "https://api.minepi.com",
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// =============================
// 📌 Fetch user info từ Pi API
// =============================
async function fetchUserInfo(accessToken) {
  try {
    const res = await axios.get("https://api.minepi.com/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.data;
  } catch (err) {
    console.error("⚠️ fetchUserInfo failed:", err.response?.data || err.message);
    return null;
  }
}

// =============================
// 📌 A2U Testnet Endpoint
// =============================
app.post("/api/a2u-test", async (req, res) => {
  const { uid, username, amount, accessToken } = req.body;
  const memo = "A2U-test";

  console.log("🔍 A2U REQUEST:", { uid, username, amount, hasAccessToken: !!accessToken });

  if ((!uid && !accessToken) || !username || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu uid, username hoặc amount" });
  }

  let userInfo = null;

  try {
    if (accessToken) {
      userInfo = await fetchUserInfo(accessToken);
      if (!userInfo || !userInfo.uid) {
        return res.status(401).json({ success: false, message: "Không xác thực được user từ Pi Network" });
      }
    } else {
      if (!uid) return res.status(400).json({ success: false, message: "UID trống" });
      userInfo = { uid, username };
    }

    console.log("✅ User info chuẩn bị giao dịch:", userInfo);

    // 1️⃣ Tạo payment trên Pi Server
    const body = { uid: userInfo.uid, username: userInfo.username, amount, memo, metadata: { type: "A2U" } };
    console.log("💡 Payload create payment:", body);

    const createRes = await axiosClient.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    console.log("✅ Payment created:", paymentIdentifier, "Recipient:", recipientAddress);

    // 2️⃣ Load account testnet
    const server = new Server(HORIZON_URL);
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 3️⃣ Giao dịch Stellar
  const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds,
    })
      .addOperation(Operation.payment({ destination: recipientAddress, asset: Asset.native(), amount: amount.toString() }))
      .addMemo(Memo.text(memo))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;
    console.log("✅ Transaction submitted:", txid);

    // 4️⃣ Complete payment
    console.log("💡 Completing payment for UID:", userInfo.uid);
    console.log("PaymentIdentifier:", paymentIdentifier, "TXID:", txid);

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, paymentId: paymentIdentifier, txid });
  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Lỗi xử lý A2U", error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ A2U Testnet backend chạy tại cổng ${PORT}`));
