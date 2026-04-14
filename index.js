// ====== backend.js ======
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const StellarSdk = require("@stellar/stellar-sdk");

// ===== Stellar SDK =====
const Server = StellarSdk.Server;
const Keypair = StellarSdk.Keypair;
const Asset = StellarSdk.Asset;
const Operation = StellarSdk.Operation;
const TransactionBuilder = StellarSdk.TransactionBuilder;
const Memo = StellarSdk.Memo;

// ===== App setup =====
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== Biến môi trường =====
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// ⚠️ Đổi sang mainnet nếu chạy thật
const HORIZON_URL = "https://api.mainnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Network";

// ===== TELEGRAM CONFIG =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===== WHALE CONFIG =====
const WHALE_THRESHOLD = 100000;

// ⚠️ Cập nhật ví sàn thật ở đây
const EXCHANGE_MAP = {
  "GXXXX_OKX": "OKX",
  "GXXXX_BITGET": "Bitget",
  "GXXXX_MEXC": "MEXC"
};

// chống spam
const processedTx = new Set();

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
// 📌 TELEGRAM ALERT
// =============================
async function sendTelegramAlert(payment, exchangeName) {
  try {
    const message = `
🚨 *PI WHALE ALERT* 🚨

🏦 Exchange: *${exchangeName}*
💰 Amount: *${payment.amount} Pi*

📤 From:
\`${payment.from}\`

📥 To:
\`${payment.to}\`

🔗 TxID:
\`${payment.id}\`

🌐 Explorer:
https://blockexplorer.minepi.com/tx/${payment.id}

⏰ Time: ${new Date().toLocaleString()}
    `;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });

    console.log("📲 Telegram alert sent!");
  } catch (err) {
    console.error("❌ Telegram error:", err.message);
  }
}

// =============================
// 📌 WHALE TRACKING REALTIME
// =============================
function startWhaleTracking() {
  const server = new Server(HORIZON_URL);

  console.log("🚀 Start Whale Tracking...");

  server
    .payments()
    .cursor("now")
    .stream({
      onmessage: async (payment) => {
        try {
          if (payment.type !== "payment") return;

          const amount = parseFloat(payment.amount);
          const to = payment.to;

          const exchangeName = EXCHANGE_MAP[to];

          if (exchangeName && amount >= WHALE_THRESHOLD) {
            if (processedTx.has(payment.id)) return;

            processedTx.add(payment.id);
            console.log("🚨 Whale detected:", payment.id, amount);

            await sendTelegramAlert(payment, exchangeName);
          }
        } catch (err) {
          console.error("❌ Payment processing error:", err.message);
        }
      },

      onerror: (error) => {
        console.error("❌ Stream error:", error);
        setTimeout(startWhaleTracking, 5000); // auto reconnect
      },
    });
}

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
    const body = { uid, username, amount, memo, metadata: { type: "A2U" } };
    const createRes = await axiosClient.post("/v2/payments", body);
    const paymentIdentifier = createRes.data.identifier;

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
    const txid = txResult.id;

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, paymentId: paymentIdentifier, txid });

  } catch (err) {
    console.error("❌ Lỗi A2U:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý A2U",
      error: err.response?.data || err.message
    });
  }
});

// =============================
// 📌 CREATE TOKEN
// =============================
app.post("/api/create-token", async (req, res) => {
  const { tokenCode, amount, userPublicKey } = req.body;

  if (!tokenCode || !amount || !userPublicKey) {
    return res.status(400).json({
      success: false,
      message: "Thiếu tokenCode, amount hoặc userPublicKey"
    });
  }

  try {
    const server = new Server(HORIZON_URL);
    const issuerKeypair = Keypair.fromSecret(APP_PRIVATE_KEY);
    const asset = new Asset(tokenCode.toUpperCase(), issuerKeypair.publicKey());

    const userAccount = await server.loadAccount(userPublicKey);
    const baseFee = await server.fetchBaseFee();

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

    return res.json({
      success: true,
      step: "trustline_required",
      xdr: txTrustline.toXDR(),
    });

  } catch (err) {
    console.error("❌ Lỗi tạo token:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi tạo token",
      error: err.response?.data || err.message
    });
  }
});

// =============================
// 🚀 START SERVER + TRACKING
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend chạy tại cổng ${PORT}`);
  startWhaleTracking();
});
