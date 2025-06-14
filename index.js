import express from 'express';
import cors from 'cors';
import axios from 'axios';
import StellarSdk from '@stellar/stellar-sdk';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://chototpi.site' }));

const PI_API_KEY = process.env.PI_API_KEY;
const APP_PUBLIC_KEY = process.env.APP_PUBLIC_KEY;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;

const axiosClient = axios.create({
  baseURL: 'https://api.testnet.minepi.com',
  timeout: 10000,
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
    const paymentBody = { uid, amount, memo, metadata: { debug: true } };
    const paymentRes = await axiosClient.post('/v2/payments', paymentBody);
    const paymentIdentifier = paymentRes.data.identifier;
    const recipientAddress = paymentRes.data.recipient;

    console.log("🔍 [A2U] Gửi đến:", recipientAddress);
    console.log("🔍 [A2U] Số Pi:", amount);

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    let recipientExists = false;
    try {
      await server.loadAccount(recipientAddress);
      recipientExists = true;
    } catch (err) {
      if (err.response?.status === 404) {
        console.log("⚠️ [A2U] Tài khoản người nhận chưa tồn tại.");
      } else {
        console.log("❌ [A2U] Lỗi kiểm tra tài khoản người nhận:", err.message);
        throw err;
      }
    }

    console.log("🔍 [A2U] Tài khoản đã tồn tại:", recipientExists);

    if (!recipientExists && parseFloat(amount) < 1.0) {
      return res.status(400).json({
        success: false,
        message: "Phải gửi ít nhất 1 Pi để tạo ví mới (createAccount)."
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
      networkPassphrase: 'Pi Testnet',
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(paymentIdentifier))
      .build();

    const appKeypair = StellarSdk.Keypair.fromSecret(APP_PRIVATE_KEY);
    tx.sign(appKeypair);

    console.log("📤 [A2U] Transaction XDR:", tx.toXDR());

    const txResult = await server.submitTransaction(tx);
    const txid = txResult.id;

    console.log("✅ [A2U] Giao dịch thành công:", txid);

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });

    return res.json({ success: true, txid, identifier: paymentIdentifier });

  } catch (err) {
    console.error("❌ [A2U] Lỗi xử lý:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý A2U",
      error: err.response?.data || err.message
    });
  }
});

app.listen(3000, () => {
  console.log("✅ Backend A2U đang chạy tại cổng 3000");
});
