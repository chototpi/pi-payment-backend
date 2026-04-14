// ====== backend.js ======
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const StellarSdk = require("@stellar/stellar-sdk");

// ===== Stellar SDK (FIX NEW VERSION) =====
const { Horizon, Keypair, Asset, Operation, TransactionBuilder, Memo } = StellarSdk;

// ===== App setup =====
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== Biến môi trường =====
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// ===== MAINNET =====
const HORIZON_URL = "https://api.mainnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Network";

// ===== TELEGRAM CONFIG =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===== WHALE CONFIG =====
const WHALE_THRESHOLD = 1000;

const EXCHANGE_MAP = {
  "GAUI2USYXS2N4DIRDPJA7JZRSE52GOD6FBOO7ODMHZ3UARXL5QZO7AAO": "Pay Of Pi",
};

// chống spam
const processedTx = new Set();

// ===== Axios Pi API =====
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
// 📌 WHALE TRACKING REALTIME (FIX)
// =============================
function startWhaleTracking() {
  const server = new Horizon.Server(HORIZON_URL);

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

        // reconnect sau 5s
        setTimeout(() => {
          console.log("🔄 Reconnecting stream...");
          startWhaleTracking();
        }, 5000);
      },
    });
}

// =============================
// 🚀 START SERVER
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend chạy tại cổng ${PORT}`);
  startWhaleTracking();
});
