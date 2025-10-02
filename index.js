import express from "express";
import cors from "cors";
import axios from "axios";
import { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } from "@stellar/stellar-sdk";

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
// 📌 A2U Testnet Endpoint
// =============================
app.post("/api/a2u-test", async (req, res) => {
  const { amount, accountId, username, uid } = req.body;
  const memo = "A2U-test";

  console.log("🔍 A2U REQUEST:", { uid, username, amount, accountId });

  if (!amount || !accountId) {
    return res.status(400).json({ success: false, message: "Thiếu accountId hoặc amount" });
  }

  try {
    // 1️⃣ Tạo payment Pi
    const body = { uid, username, amount, memo, metadata: { type: "A2U" } };
    const createRes = await axiosClient.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;

    // 2️⃣ Giao dịch Stellar
    const server = new Server(HORIZON_URL);
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds,
    })
      .addOperation(Operation.payment({
        destination: accountId,
        asset: Asset.native(),
        amount: amount.toString(),
      }))
      .addMemo(Memo.text(memo))
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.hash;

    // 3️⃣ Complete payment Pi
    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, paymentId: paymentIdentifier, txid });
  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Lỗi xử lý A2U", error: err.response?.data || err.message });
  }
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
    const issuerKeypair = Keypair.fromSecret(APP_PRIVATE_KEY); // Ví app là issuer
    const asset = new Asset(tokenCode.toUpperCase(), issuerKeypair.publicKey());

    // 1️⃣ Load user account
    const userAccount = await server.loadAccount(userPublicKey);
    const baseFee = await server.fetchBaseFee();

    // 2️⃣ Tạo trustline từ user tới token
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

    await server.submitTransaction(txTrustline);
    console.log(`✅ Trustline created for user ${userPublicKey}`);

    // 3️⃣ Issuer gửi token cho user
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const txPayment = new TransactionBuilder(issuerAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds: await server.fetchTimebounds(180),
    })
      .addOperation(Operation.payment({
        destination: userPublicKey,
        asset,
        amount: amount.toString(),
      }))
      .build();

    txPayment.sign(issuerKeypair);
    const paymentResult = await server.submitTransaction(txPayment);

    console.log(`✅ Token ${tokenCode} sent to user: ${paymentResult.hash}`);

    return res.json({
      success: true,
      tokenCode: tokenCode.toUpperCase(),
      amount,
      user: userPublicKey,
      txid: paymentResult.hash,
    });
  } catch (err) {
    console.error("❌ Lỗi tạo token:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Lỗi tạo token", error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ A2U Testnet backend chạy tại cổng ${PORT}`));
