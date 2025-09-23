import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [
      "https://chototpi.site",
      "https://payofpi.click",
      "https://testnet.chototpi.site",
      "https://vn.payofpi.click",
    ],
  })
);

// 🔑 Biến môi trường
const PI_API_KEY = process.env.PI_API_KEY;       // API Key lấy từ Developer Portal (testnet)
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;   // ví app testnet (G...)
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY; // secret key ví app testnet (S...)

// Client gọi API Pi Network
const axiosClient = axios.create({
  baseURL: "https://api.testnet.minepi.com", // ✅ dùng testnet
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
  const { uid, amount } = req.body;
  const memo = "A2U-test"; // để nhận biết giao dịch test

  console.log("🔍 A2U REQUEST:", { uid, amount, memo });

  if (!uid || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu uid hoặc amount" });
  }

  try {
    // 1. Tạo payment trên Pi Server
    const body = { amount, memo, metadata: { type: "A2U" }, uid };
    const createRes = await axiosClient.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    console.log("✅ Payment created:", paymentIdentifier);
    console.log("➡️ Recipient:", recipientAddress);

    // 2. Load tài khoản nguồn (app wallet testnet)
    const server = new Server("https://api.testnet.minepi.com");
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 3. Tạo giao dịch Stellar (Pi Testnet)
    const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
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

    // 4. Gọi complete để kết thúc flow
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

// =============================
// Khởi động server
// =============================
// 🔑 Lắng nghe PORT của Render hoặc fallback về 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U Testnet backend đang chạy tại cổng ${PORT}`);
});
