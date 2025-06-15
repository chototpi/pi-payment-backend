const express = require('express');
const cors = require('cors');
const axios = require('axios');
const StellarSdk = require('@stellar/stellar-sdk');

const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://chototpi.site' })); // ⚠️ Sửa theo domain của bạn

// 🔐 Biến môi trường (nhập trong Render Dashboard)
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// 📡 Kết nối Pi Testnet API
const axiosClient = axios.create({
  baseURL: 'https://api.testnet.minepi.com',
  timeout: 20000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// 🚀 Endpoint gửi A2U
app.post('/api/a2u-test', async (req, res) => {
  const { uid, amount } = req.body;
  const memo = "A2U-test-001"; // Gán MEMO cố định để test

  console.log("🔍 A2U REQUEST:");
  console.log("📌 UID:", uid);
  console.log("📌 AMOUNT:", amount);
  console.log("📌 MEMO:", memo);

  if (!uid || !amount) {
    return res.status(400).json({ success: false, message: 'Thiếu uid hoặc amount' });
  }

  try {
    const body = {
      amount,
      memo,
      metadata: { purpose: "A2U payment" },
      uid
    };

    console.log("📦 BODY gửi tới Pi API:", body);
    console.log("📤 Gửi tới /v2/payments...");

    // 🧾 Bước 1: Gửi yêu cầu tạo payment
    const createRes = await axiosClient.post('/v2/payments', body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    if (!paymentIdentifier || !recipientAddress) {
      return res.status(500).json({ success: false, message: 'Thiếu paymentIdentifier hoặc recipientAddress' });
    }

    console.log("✅ Payment ID:", paymentIdentifier);
    console.log("✅ Recipient Address:", recipientAddress);

    // 🧾 Bước 2: Gửi giao dịch tới blockchain
    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    let recipientExists = false;
    try {
      await server.loadAccount(recipientAddress);
      recipientExists = true;
    } catch (err) {
      if (err.response?.status !== 404) throw err;
    }

    if (!recipientExists && parseFloat(amount) < 1.0) {
      return res.status(400).json({ success: false, message: "Số Pi phải >= 1 để tạo tài khoản mới" });
    }

    const operation = recipientExists
      ? StellarSdk.Operation.payment({
          destination: recipientAddress,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString()
        })
      : StellarSdk.Operation.createAccount({
          destination: recipientAddress,
          startingBalance: amount.toString()
        });
    
    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(memo.slice(0, 28))) // Stellar chỉ cho phép 28 ký tự memo text
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;

    console.log("✅ Transaction sent, txid:", txid);

    // ⚠️ Bỏ qua bước POST /complete vì đang dùng testnet
    console.log("⚠️ Bỏ qua /v2/payments/:id/complete vì testnet");

    return res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Lỗi xử lý A2U:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý A2U",
      error: error.response?.data || error.message
    });
  }
});

// 🚀 Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U Backend đang chạy tại cổng ${PORT}`);
});
