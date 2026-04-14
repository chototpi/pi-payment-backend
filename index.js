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
const WHALE_THRESHOLD = 5000;

// ⚠️ Cập nhật ví sàn thật ở đây
const EXCHANGE_MAP = {
  "GAUI2USYXS2N4DIRDPJA7JZRSE52GOD6FBOO7ODMHZ3UARXL5QZO7AAO": "Pay Of Pi",
  "GALYJFJ5SVD45FBWN2GT4IW67SEZ3IBOFSBSPUFCWV427NBNLG3PXEQU": "OKX",
  "GDFNWH6ZFJVHJDLBMNOUT35X4EEKQVJAO3ZDL4NL7VQJLC4PJOQFWJ75": "Bitget",
  "GD5HGPHVL73EBDUD2Z4K2VDRLUBC4FFN7GOBLKPK6OPPXH6TED4TRK73": "MEXC",
  "GBC6NRTTQLRCABQHIR5J4R4YDJWFWRAO4ZRQIM2SVI5GSIZ2HZ42RINW": "Gate",
  "GATOC5LCD5PVVG4IDCRRURWJMN3R7RLEUJMGAYMA5DGIJP2D46HAXCMA": "Kraken",
  "GBXHS6NJONBIDPXRQ4T7ZHUAR3U2MFQBDNL267O7DXVP5UBZ2FWUX7YD": "Lpbank",
  "GD24QVE4R42E4XRDF6T5IN6UAQLD2WN7OQGUC2FBHFUUZM7GLE4KG6YA": "Pionex",
  "GDL66HS4YTULXZ7NY7TZRUPCVD3BMANUIZUPCXU5HG46CVMI3YHBBWB6": "Pionex_2"
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
\`${payment.transaction_hash}\`

🌐 Explorer:
https://blockexplorer.minepi.com/tx/${payment.transaction_hash}

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
