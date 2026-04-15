// ====== backend.js ======
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const StellarSdk = require("@stellar/stellar-sdk");

// ===== Stellar SDK =====
const { Horizon } = StellarSdk;

// ===== App setup =====
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== ENV =====
const PI_API_KEY = process.env.PI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===== MAINNET =====
const HORIZON_URL = "https://api.mainnet.minepi.com";

// ===== CONFIG =====
const WHALE_THRESHOLD = 10000;

// ===== EXCHANGE WALLETS =====
const EXCHANGE_MAP = {
  "GAUI2USYXS2N4DIRDPJA7JZRSE52GOD6FBOO7ODMHZ3UARXL5QZO7AAO": "Pay Of Pi",
  "GALYJFJ5SVD45FBWN2GT4IW67SEZ3IBOFSBSPUFCWV427NBNLG3PXEQU": "OKX",
  "GDFNWH6ZFJVHJDLBMNOUT35X4EEKQVJAO3ZDL4NL7VQJLC4PJOQFWJ75": "Bitget",
  "GD5HGPHVL73EBDUD2Z4K2VDRLUBC4FFN7GOBLKPK6OPPXH6TED4TRK73": "MEXC",
  "GBC6NRTTQLRCABQHIR5J4R4YDJWFWRAO4ZRQIM2SVI5GSIZ2HZ42RINW": "Gate",
  "GATOC5LCD5PVVG4IDCRRURWJMN3R7RLEUJMGAYMA5DGIJP2D46HAXCMA": "Kraken",
  "GBXHS6NJONBIDPXRQ4T7ZHUAR3U2MFQBDNL267O7DXVP5UBZ2FWUX7YD": "Lpbank",
  "GD24QVE4R42E4XRDF6T5IN6UAQLD2WN7OQGUC2FBHFUUZM7GLE4KG6YA": "Pionex",
  "GDL66HS4YTULXZ7NY7TZRUPCVD3BMANUIZUPCXU5HG46CVMI3YHBBWB6": "Pionex_2",
  "GABT7EMPGNCQSZM22DIYC4FNKHUVJTXITUF6Y5HNIWPU4GA7BHT4GC5G": "Foundation 2",
  "GCVUUIE6W7DV3VPJJ7CUGN37FADP7BXRU6VKELZNGNQBGFTFF2NS5DEK": "Foundation",
  "GBMZ7TIQWX56FI2URWSJEAIUWIRZ24AA3DWMJ42SC62CZ4FVQLU4VZD2": "Liquidity Reserve"
};

// ===== CACHE =====
const processedTx = new Set();
const balanceCache = new Map();

// =============================
// 📌 LẤY BALANCE
// =============================
async function getBalance(address, server) {
  try {
    if (balanceCache.has(address)) {
      return balanceCache.get(address);
    }

    const account = await server.loadAccount(address);

    const native = account.balances.find(
      (b) => b.asset_type === "native"
    );

    const balance = native ? parseFloat(native.balance) : 0;

    balanceCache.set(address, balance);

    return balance;
  } catch (err) {
    console.error("❌ Balance error:", err.message);
    return 0;
  }
}

// =============================
// 📌 TELEGRAM ALERT
// =============================
async function sendTelegramAlert(payment, exchangeName, server) {
  try {
    const txHash = payment.transaction_hash || payment.id;

    const balance = await getBalance(payment.from, server);

    const amount = parseFloat(payment.amount);

    // % tài sản đã chuyển
    const percent = balance > 0
      ? ((amount / (balance + amount)) * 100).toFixed(2)
      : 0;

    const message = `
🚨 *PI WHALE ALERT* 🚨

📤 From:
\`${payment.from}\`
👤 Balance: *${balance.toLocaleString()} Pi*
💰 Amount: *${amount.toLocaleString()} Pi*
🔥 Moved: *${percent}%*

📥 To: *${exchangeName}* 
\`${payment.to}\`

🌐 Explorer:
https://blockexplorer.minepi.com/tx/${txHash}

⏰ Time: ${new Date().toLocaleString()}
    `;

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }
    );

    console.log("📲 Telegram sent:", txHash);

  } catch (err) {
    console.error("❌ Telegram error:", err.message);
  }
}

// =============================
// 📌 WHALE TRACKING
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

            console.log("🚨 Whale:", amount, exchangeName);

            await sendTelegramAlert(payment, exchangeName, server);
          }
        } catch (err) {
          console.error("❌ Process error:", err.message);
        }
      },

      onerror: (error) => {
        console.error("❌ Stream error:", error);

        setTimeout(() => {
          console.log("🔄 Reconnecting...");
          startWhaleTracking();
        }, 60000);
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
