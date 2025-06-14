import express from 'express';
import cors from 'cors';
import axios from 'axios';
import StellarSdk from '@stellar/stellar-sdk';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://chototpi.site' }));

// ⚙️ Config từ biến môi trường Render
const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

// Axios client cho Pi API
const axiosClient = axios.create({
  baseURL: 'https://api.testnet.minepi.com',
  timeout: 10000,
  headers: {
    Authorization: `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// A2U test route
app.post('/api/a2u-test', async (req, res) => {
  const { uid, amount, memo } = req.body;

  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: 'Thiếu uid, amount hoặc memo' });
  }

  try {
    // 1. Gọi Pi API để tạo payment A2U
    const paymentBody = { uid, amount, memo, metadata: { test: true } };
    const paymentRes = await axiosClient.post('/v2/payments', paymentBody);
    const paymentIdentifier = paymentRes.data.identifier;
    const recipientAddress = paymentRes.data.recipient;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    // 2. Kiểm tra người nhận đã có tài khoản chưa
    let recipientExists = false;
    try {
      await server.loadAccount(recipientAddress);
      recipientExists = true;
    } catch (err) {
      if (err.response?.status === 404) {
        console.log('⚠️ Recipient chưa tồn tại');
      } else {
        throw err;
      }
    }

    // 3. Tạo operation
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

    // 4. Build & ký giao dịch
    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: 'Pi Testnet',
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(paymentIdentifier))
      .build();

    const appKeypair = StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(appKeypair);

    // 5. Gửi giao dịch lên blockchain
    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;

    // 6. Gọi complete
    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, txid, identifier: paymentIdentifier });

  } catch (err) {
    console.error('❌ A2U dynamic error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xử lý A2U',
      error: err.response?.data || err.message
    });
  }
});

app.listen(3000, () => {
  console.log('✅ A2U backend đang chạy tại cổng 3000');
});
