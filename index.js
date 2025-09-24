// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());
// CORS mở (test nhanh) — sau deploy bạn có thể giới hạn lại
app.use(cors());

/* ENV */
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// Platform & Horizon endpoints
const PLATFORM_BASE = "https://api.minepi.com";           // Pi Platform API (v2)
const HORIZON_TESTNET = "https://api.testnet.minepi.com"; // Horizon (submit tx)
const NETWORK_PASSPHRASE = "Pi Testnet";

// axios client dùng API Key (Platform)
const piPlatform = axios.create({
  baseURL: PLATFORM_BASE,
  timeout: 15000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

/**
 * Lấy thông tin user (ưu tiên accessToken -> /v2/me)
 * Nếu không có accessToken sẽ fallback GET /v2/users/:uid (dùng API key)
 */
async function fetchUserInfo({ uid, accessToken }) {
  try {
    if (accessToken) {
      // GET /v2/me với Bearer token
      const resp = await axios.get(`${PLATFORM_BASE}/v2/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      return resp.data;
    } else {
      // Fallback: dùng API key để GET /v2/users/:uid
      const resp = await piPlatform.get(`/v2/users/${uid}`);
      return resp.data;
    }
  } catch (err) {
    // trả lỗi nguyên gốc lên caller để debug
    throw err;
  }
}

/**
 * Try extract wallet address (nhiều tên trường khác nhau tùy response)
 */
function extractWalletAddress(userData) {
  if (!userData) return null;

  // Các trường khả dĩ mà Pi Platform có thể trả
  // (tùy phiên bản api, structure khác nhau)
  const candidates = [
    userData.wallet_address,
    userData.walletAddress,
    userData.wallets && userData.wallets[0] && (userData.wallets[0].address || userData.wallets[0].public_key),
    userData.wallet && userData.wallet.address,
    userData.stellar_address,
    userData.accounts && userData.accounts[0] && userData.accounts[0].account_id,
    userData.public_key,
  ];

  for (const c of candidates) {
    if (c && typeof c === "string" && c.length > 10) return c;
  }
  return null;
}

/* ROUTE: A2U Testnet */
app.post("/api/a2u-test", async (req, res) => {
  const { uid, username, amount, accessToken } = req.body;
  const memo = "A2U-test";

  console.log("🔍 A2U REQUEST:", { uid, username, amount, hasAccessToken: !!accessToken });

  if (!uid || !username || !amount) {
    return res.status(400).json({ success: false, message: "Thiếu uid, username hoặc amount" });
  }

  try {
    // 1) Lấy user info (ưu tiên accessToken)
    let userData;
    try {
      userData = await fetchUserInfo({ uid, accessToken });
      console.log("✅ userData from platform:", userData && Object.keys(userData).slice(0,8));
    } catch (e) {
      console.warn("⚠️ fetchUserInfo failed:", e.response?.data || e.message);
      // trả lỗi rõ cho frontend
      return res.status(400).json({
        success: false,
        message: "Không thể lấy thông tin user từ Platform API",
        error: e.response?.data || e.message,
      });
    }

    // 2) Lấy wallet address từ userData
    const walletAddress = extractWalletAddress(userData);
    if (!walletAddress) {
      console.warn("⚠️ Không tìm thấy wallet address in userData:", userData);
      return res.status(400).json({
        success: false,
        message: "User chưa có wallet address khả dụng trên Platform. Vui lòng kiểm tra ví Pi của bạn.",
        userData,
      });
    }

    console.log("➡️ walletAddress resolved:", walletAddress);

    // 3) Tạo payment trên Pi Platform (ghi nhận payment)
    const createBody = { amount, memo, metadata: { type: "A2U" }, uid, username };
    const createRes = await piPlatform.post("/v2/payments", createBody);
    const paymentIdentifier = createRes.data.identifier;
    const recipientFromCreate = createRes.data.recipient; // platform có thể trả recipient hoặc không

    console.log("✅ Payment created:", { paymentIdentifier, recipientFromCreate });

    // 4) Quyết định recipientAddress: ưu tiên recipientFromCreate nếu có, fallback walletAddress
    const recipientAddress = (recipientFromCreate && typeof recipientFromCreate === "string") ? recipientFromCreate : walletAddress;
    console.log("➡️ recipientAddress used:", recipientAddress);

    // 5) Load source account (app wallet) trên Horizon testnet và build tx
    const server = new Server(HORIZON_URL);
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    // use setTimeout instead of fetchTimebounds for simplicity
    const tx = new TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.payment({
        destination: recipientAddress,
        asset: Asset.native(),
        amount: amount.toString(),
      }))
      .addMemo(Memo.text(memo))
      .setTimeout(180)
      .build();

    const keypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    // 6) Submit tx to Horizon testnet
    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;
    console.log("✅ Transaction submitted txid:", txid);

    // 7) Complete payment on Platform
    await piPlatform.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, paymentId: paymentIdentifier, txid });
  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message || err);
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý A2U",
      error: err.response?.data || err.message || String(err),
    });
  }
});

/* health */
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U Testnet backend đang chạy tại cổng ${PORT}`);
});
