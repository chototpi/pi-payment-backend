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

// =============================
// SEND PI
// POST /send
// =============================
app.post("/send", async (req, res) => {

  try {

    const { secret, to, amount } = req.body;

    if (!secret || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: "secret, to and amount are required"
      });
    }

    // kiểm tra amount
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount"
      });
    }

    // tạo keypair
    const keypair =
      StellarSdk.Keypair.fromSecret(secret);

    // load account
    const account =
      await server.loadAccount(
        keypair.publicKey()
      );

    // build transaction
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

    // ký
    tx.sign(keypair);

    // submit
    const result =
      await server.submitTransaction(tx);

    console.log(result);

    return res.json({

      success: true,

      hash: result.hash,

      ledger: result.ledger,

      source: keypair.publicKey(),

      destination: to,

      amount

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
