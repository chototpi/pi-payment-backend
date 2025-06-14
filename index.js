import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

dotenv.config();
const app = express();
app.use(express.json());

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const stellarServer = new Server("https://api.testnet.minepi.com");
const axiosClient = axios.create({
  baseURL: "https://api.minepi.com",
  timeout: 20000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// ✅ API nhận uid + số Pi để tạo A2U
app.post("/api/a2u-test", async (req, res) => {
  const { uid, amount, memo } = req.body;

  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: "Thiếu uid, amount hoặc memo" });
  }

  try {
    // 1. Tạo thanh toán qua Pi API
    const body = { amount, memo, metadata: { test: true }, uid };
    const paymentRes = await axiosClient.post("/v2/payments", body);
    const { identifier, recipient } = paymentRes.data;

    // 2. Load tài khoản & tạo transaction
    const appAccount = await stellarServer.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await stellarServer.fetchBaseFee();
    const timebounds = await stellarServer.fetchTimebounds(180);

    const tx = new TransactionBuilder(appAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
      timebounds,
    })
      .addOperation(Operation.payment({
        destination: recipient,
        asset: Asset.native(),
        amount: amount.toString(),
      }))
      .addMemo(Memo.text(identifier))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    // 3. Submit transaction
    const submitResult = await stellarServer.submitTransaction(tx);
    const txid = submitResult.id;

    // 4. Complete thanh toán
    const completeRes = await axiosClient.post(`/v2/payments/${identifier}/complete`, { txid });

    res.json({
      success: true,
      txid,
      identifier,
      complete: completeRes.status === 200,
    });

  } catch (error) {
    console.error("❌ Lỗi A2U:", error?.response?.data || error.message);
    res.status(500).json({ success: false, message: "Lỗi khi xử lý A2U", error: error?.message });
  }
});
