import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import StellarSdk from '@stellar/stellar-sdk';

dotenv.config();
const app = express();

const PI_API_KEY = process.env.PI_API_KEY;
const myPublicKey = process.env.APP_PUBLIC_KEY;
const mySecretSeed = process.env.APP_PRIVATE_KEY;

const axiosClient = axios.create({
  baseURL: 'https://api.minepi.com',
  timeout: 20000,
  headers: {
    'Authorization': `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Gửi yêu cầu tạo thanh toán
const userUid = "a1111111-aaaa-bbbb-2222-ccccccc3333d";
const body = { amount: 1, memo: "Memo", metadata: { test: "your metadata" }, uid: userUid };

let paymentIdentifier, recipientAddress;

axiosClient.post(`/v2/payments`, body)
  .then(async (response) => {
    paymentIdentifier = response.data.identifier;
    recipientAddress = response.data.recipient;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(myPublicKey);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: 'Pi Testnet',
      timebounds
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: recipientAddress,
        asset: StellarSdk.Asset.native(),
        amount: body.amount.toString()
      }))
      .addMemo(StellarSdk.Memo.text(paymentIdentifier))
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
    transaction.sign(keypair);

    const submitResult = await server.submitTransaction(transaction);
    const txid = submitResult.id;

    await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });
    console.log('✅ Giao dịch hoàn tất:', txid);
  })
  .catch((err) => {
    console.error('❌ Lỗi khi gửi thanh toán A2U:', err.response?.data || err.message);
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U backend chạy tại http://localhost:${PORT}`);
});
