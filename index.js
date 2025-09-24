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
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;     // Key Stellar testnet của app
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;   // Secret Key Stellar testnet
const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

const server = new Server(HORIZON_URL);

// =============================
// 📌 A2U Testnet Endpoint
// =============================
app.post("/api/a2u-test", async (req, res) => {
  const { recipientPubKey, amount } = req.body;

  if (!recipientPubKey || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu recipientPubKey hoặc amount" });
  }

  try {
    // Load account app
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // Build transaction
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
      .addMemo(Memo.text("A2U-test"))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;

    console.log("✅ Transaction submitted:", txid);

    return res.json({ success: true, txid });
  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Lỗi xử lý A2U", error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ A2U Testnet backend chạy tại cổng ${PORT}`));
