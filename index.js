const express = require('express');
const cors = require('cors');
const axios = require('axios');
const StellarSdk = require('@stellar/stellar-sdk');

const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://chototpi.site' }));

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const axiosClient = axios.create({
  baseURL: 'https://api.minepi.com',
  timeout: 20000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

app.post('/api/a2u-test', async (req, res) => {
  const { uid, amount, memo } = req.body;

  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: 'Thiếu uid, amount hoặc memo' });
  }

  try {
    const body = {
      amount,
      memo,
      metadata: { purpose: "A2U payment" },
      uid
    };

    const createRes = await axiosClient.post('/v2/payments', body);
    const paymentIdentifier = createRes.data.identifier;
    const recipientAddress = createRes.data.recipient;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    let recipientExists = false;
    try {
      await server.loadAccount(recipientAddress);
      recipientExists = true;
    } catch (err) {
      if (err.response?.status !== 404) throw err;
    }

    if (!recipientExists && parseFloat(amount) < 1.0) {
      return res.status(400).json({
        success: false,
        message: "Số Pi phải >= 1 để tạo tài khoản mới."
      });
    }

    const operation = recipientExists
      ? StellarSdk.Operation.payment({
          destination: recipientAddress,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString()
        })
      : StellarSdk.Operation.createAccount({
          destination: recipientAddress,
          startingBalance: amount.toString()
        });

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(paymentIdentifier.slice(0, 28))) // limit Memo length
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(keypair);

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, txid });

  } catch (error) {
    console.error("❌ Lỗi xử lý A2U:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý A2U",
      error: error.response?.data || error.message
    });
  }
});

app.listen(3000, () => {
  console.log("✅ A2U backend đang chạy tại cổng 3000");
});
