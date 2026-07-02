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
const PI_SECRET = process.env.PI_SECRET;

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

app.post("/send", async (req, res) => {

  try {

    const { to, amount } = req.body;

    if (!to || !amount) {
      return res.status(400).json({
        success: false,
        error: "to and amount are required"
      });
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount"
      });
    }

    const keypair =
      StellarSdk.Keypair.fromSecret(PI_SECRET);

    const account =
      await server.loadAccount(
        keypair.publicKey()
      );

    const feeStats =
      await server.feeStats();

    const networkFee =
      feeStats.last_ledger_base_fee;

    const tx =
      new StellarSdk.TransactionBuilder(
        account,
        {
          fee: networkFee,
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

    tx.sign(keypair);

    const result =
      await server.submitTransaction(tx);

    return res.json({
      success: true,
      hash: result.hash,
      ledger: result.ledger,
      source: keypair.publicKey(),
      destination: to,
      amount: Number(amount)
    });

  } catch (err) {

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
