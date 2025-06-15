// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";
const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://chototpi.site" })); // sửa lại nếu frontend khác

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const axiosClient = axios.create({
  baseURL: "https://api.testnet.minepi.com",
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

app.post("/api/a2u-test", async (req, res) => {
  const { uid, amount } = req.body;
  const memo = "A2U-test-001"; // Cố định để kiểm tra dễ

  console.log("🔍 A2U REQUEST:");
  console.log("📌 UID:", uid);
  console.log("📌 AMOUNT:", amount);
  console.log("📌 MEMO:", memo);

  if (!uid || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu uid hoặc amount" });
  }

  try {
    // 1. Tạo payment
    const body = { amount, memo, metadata: { test: "A2U" }, uid };
    const createRes = await axiosClient.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    console.log("✅ Created paymentIdentifier:", paymentIdentifier);
    console.log("✅ Recipient address:", recipientAddress);

    // 2. Load tài khoản nguồn (ví app)
    const server = new Server("https://api.testnet.minepi.com");
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 3. Tạo giao dịch gửi Pi
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
    console.log("✅ Transaction sent. TxID:", txid);

    // 4. Gọi complete
    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, txid });
  } catch (err) {
    console.error("❌ Lỗi xử lý A2U:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý A2U",
      error: err.response?.data || err.message,
    });
  }
});

app.listen(3000, () => {
  console.log("✅ A2U backend đang chạy tại cổng 3000");
});
