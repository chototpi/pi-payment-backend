const express = require("express");
const cors = require("cors");
const axios = require("axios");
const stellarSdk = require("@stellar/stellar-sdk");

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = stellarSdk;

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 Biến môi trường
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// Axios client cho Pi Server
const axiosClient = axios.create({
  baseURL: "https://api.minepi.com",
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// =============================
// 📌 Tạo token trên Pi Testnet v23
// =============================
app.post("/api/create-token", async (req, res) => {
  const { tokenCode, amount, userPublicKey } = req.body;

  if (!tokenCode || !amount || !userPublicKey) {
    return res.status(400).json({ success: false, message: "Thiếu tokenCode, amount hoặc userPublicKey" });
  }

  try {
    const server = new Server(HORIZON_URL);
    const issuerKeypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    const asset = new Asset(tokenCode.toUpperCase(), issuerKeypair.publicKey());

    // 1️⃣ Load user account
    const userAccount = await server.loadAccount(userPublicKey);
    const baseFee = await server.fetchBaseFee();

    // 2️⃣ Tạo trustline từ user → token
    const txTrustline = new TransactionBuilder(userAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds: await server.fetchTimebounds(180),
    })
      .addOperation(Operation.changeTrust({
        asset,
        limit: amount.toString(),
      }))
      .build();

    // ❌ Backend không thể ký thay user (an toàn)
    // Trả về XDR để user ký trong ví Pi
    return res.json({
      success: true,
      step: "trustline_required",
      xdr: txTrustline.toXDR(),
      hint: "Gửi XDR này cho user ký trong ví Pi Browser / Stellar wallet",
    });

  } catch (err) {
    console.error("❌ Lỗi tạo token:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Lỗi tạo token", error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend chạy tại cổng ${PORT}`));
