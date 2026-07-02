// ===== backend.js =====

const express = require("express");
const cors = require("cors");
const StellarSdk = require("@stellar/stellar-sdk");

// =============================
// APP
// =============================
const app = express();

app.use(express.json());
app.use(cors());

// =============================
// PI MAINNET
// =============================
const HORIZON_URL = "https://api.mainnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Network";

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// =============================
// HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Pi Payment Backend Running"
  });
});

// ======================================
// SEND PI
// POST /send
// ======================================
app.post("/send", async (req, res) => {

  try {

    const { secret, to, amount } = req.body;

    // =============================
    // VALIDATE
    // =============================
    if (!secret || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: "secret, to and amount are required"
      });
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount"
      });
    }

    // =============================
    // LOAD ACCOUNT
    // =============================
    const keypair = StellarSdk.Keypair.fromSecret(secret);

    const account = await server.loadAccount(
      keypair.publicKey()
    );

    console.log("Source:", keypair.publicKey());
    console.log("Destination:", to);
    console.log("Amount:", amount);

    // =============================
    // BUILD TX
    // =============================
    const tx = new StellarSdk.TransactionBuilder(
      account,
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE
      }
    )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: to,
          asset: StellarSdk.Asset.native(),
          amount: Number(amount).toFixed(7)
        })
      )
      .setTimeout(30)
      .build();

    // =============================
    // SIGN
    // =============================
    tx.sign(keypair);

    console.log("Submitting transaction...");

    // =============================
    // SUBMIT
    // =============================
    const result =
      await server.submitTransaction(tx);

    console.log("Submit success:");
    console.dir(result, { depth: null });

    return res.json({
      success: true,
      hash: result.hash,
      ledger: result.ledger,
      successful: result.successful,
      source: keypair.publicKey(),
      destination: to,
      amount: Number(amount)
    });

  } catch (err) {

    console.error("====== SEND ERROR ======");

    if (err.response?.data) {
      console.dir(err.response.data, { depth: null });
    }

    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });

  }

});

// =============================
// START SERVER
// =============================
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `✅ Backend chạy tại cổng ${PORT}`
  );

});
