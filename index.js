// ====== backend.js ======

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const StellarSdk = require("@stellar/stellar-sdk");

// ===== App =====
const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== ENV =====
const PI_API_KEY = process.env.PI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===== PI MAINNET =====
const HORIZON_URL = "https://api.mainnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Network";

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// ======================================
// SEND PI
// POST /send
// ======================================
app.post("/send", async (req, res) => {

  try {

    const { secret, to, amount } = req.body;

    if (!secret  !to  !amount) {
      return res.status(400).json({
        success: false,
        error: "secret, to and amount are required"
      });
    }

    const keypair =
      StellarSdk.Keypair.fromSecret(secret);

    const account =
      await server.loadAccount(
        keypair.publicKey()
      );

    const tx =
      new StellarSdk.TransactionBuilder(
        account,
        {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: NETWORK_PASSPHRASE
        }
      )
        .addOperation(

          StellarSdk.Operation.payment({

            destination: to,

            asset:
              StellarSdk.Asset.native(),

            amount:
              amount.toString()

          })

        )
        .setTimeout(30)
        .build();

    tx.sign(keypair);

    const result =
      await server.submitTransaction(tx);

    return res.json({

      success: true,

      hash: result.hash

    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({

      success: false,

      error:
        err.response?.data ||
        err.message

    });

  }

});

// ======================================
// HEALTH CHECK
// ======================================
app.get("/", (req, res) => {
  res.send("Watcher.Pi Backend Running");
});

// ======================================
// START SERVER
// ======================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`✅ Backend chạy tại cổng ${PORT}`);

  startWhaleTracking();

});
