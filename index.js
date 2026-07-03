// ===== backend.js =====

const express = require("express");
const cors = require("cors");
const axios = require("axios");
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
const DESTINATION_WALLET =
  "MDFNWH6ZFJVHJDLBMNOUT35X4EEKQVJAO3ZDL4NL7VQJLC4PJOQFWAAAAAATKKWQPV5W6";
const KEEP_BALANCE = 1;

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

// ======================================
// CLAIM ALL + SEND
// POST /claim
// ======================================

let claimRunning = false;

app.post("/claim", async (req, res) => {

  if (claimRunning) {
    return res.status(409).json({
      success: false,
      error: "Claim is already running"
    });
  }

  claimRunning = true;

  try {

    const keypair =
      StellarSdk.Keypair.fromSecret(PI_SECRET);

    const publicKey =
      keypair.publicKey();

    console.log("Wallet:", publicKey);

    const feeStats =
      await server.feeStats();

    const baseFee =
      feeStats.last_ledger_base_fee;

    // fee Pi
    const feePi =
      Number(baseFee) / 10000000;

    // --------------------------
    // lấy claimable balances
    // --------------------------

    const response = await axios.get(
      `${HORIZON_URL}/claimable_balances?claimant=${publicKey}`
    );

    const balances =
      response.data._embedded.records;

    console.log(
      `Found ${balances.length} claimable balances`
    );

    const claimResults = [];

    // --------------------------
    // claim từng balance
    // --------------------------

    for (const item of balances) {

      try {

        const account =
          await server.loadAccount(publicKey);

        const tx =
          new StellarSdk.TransactionBuilder(
            account,
            {
              fee: baseFee,
              networkPassphrase:
                NETWORK_PASSPHRASE
            }
          )

          .addOperation(

            StellarSdk.Operation.claimClaimableBalance({

              balanceId: item.id

            })

          )

          .setTimeout(30)

          .build();

        tx.sign(keypair);

        const result =
          await server.submitTransaction(tx);

        console.log(
          "Claim OK:",
          result.hash
        );

        claimResults.push({

          success: true,

          balanceId: item.id,

          amount: item.amount,

          hash: result.hash

        });

      } catch (err) {

        const code =
          err.response?.data
            ?.extras
            ?.result_codes
            ?.operations?.[0];

        console.log(
          "Skip:",
          item.id,
          code
        );

        claimResults.push({

          success: false,

          balanceId: item.id,

          amount: item.amount,

          error: code || err.message

        });

      }

    }

    // --------------------------
    // load balance mới
    // --------------------------

    const account =
      await server.loadAccount(publicKey);

    const native =
      account.balances.find(
        b => b.asset_type === "native"
      );

    const balance =
      parseFloat(native.balance);

    const sendAmount =
      Number(
        (
          balance -
          KEEP_BALANCE -
          feePi
        ).toFixed(7)
      );
    let sendResult = null;

    if (sendAmount > 0) {

      console.log(
        "Sending",
        sendAmount,
        "Pi"
      );

      const account2 =
        await server.loadAccount(publicKey);

      const tx =
        new StellarSdk.TransactionBuilder(
          account2,
          {
            fee: baseFee,
            networkPassphrase:
              NETWORK_PASSPHRASE
          }
        )

        .addOperation(

          StellarSdk.Operation.payment({

            destination:
              DESTINATION_WALLET,

            asset:
              StellarSdk.Asset.native(),

            amount:
              sendAmount.toString()

          })

        )

        .setTimeout(30)

        .build();

      tx.sign(keypair);

      const result =
        await server.submitTransaction(tx);

      sendResult = {

        hash:
          result.hash,

        ledger:
          result.ledger,

        amount:
          sendAmount

      };

      console.log(
        "Send OK:",
        result.hash
      );

    }

    claimRunning = false;

    return res.json({

      success: true,

      wallet:
        publicKey,

      claimed:
        claimResults.filter(
          x => x.success
        ).length,

      total:
        balances.length,

      balance,

      keep:
        KEEP_BALANCE,

      send:
        sendResult,

      results:
        claimResults

    });

  } catch (err) {

    claimRunning = false;

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
