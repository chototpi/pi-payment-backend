import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import pkg from '@stellar/stellar-sdk';
import cors from 'cors';

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
  origin: 'https://chototpi.site'
}));

const PI_API_KEY = process.env.PI_API_KEY;

const axiosClient = axios.create({
  baseURL: 'https://api.testnet.minepi.com',
  timeout: 20000,
  headers: {
    'Authorization': `Key ${PI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// ✅ BỔ SUNG ROUTER: cho phép frontend gửi A2U động
app.post("/api/a2u-test", async (req, res) => {
  const { uid, amount, memo } = req.body;

  if (!uid || !amount || !memo) {
    return res.status(400).json({ success: false, message: "Thiếu uid, amount hoặc memo" });
  }

  try {
    const paymentBody = { amount, memo, metadata: { test: true }, uid };
    const paymentRes = await axiosClient.post("/v2/payments", paymentBody);
    const { identifier, recipient } = paymentRes.data;

    const server = new StellarSdk.Server('https://api.testnet.minepi.com');
    const sourceAccount = await server.loadAccount(myPublicKey);
    const baseFee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(180);

    let operation;

    const recipientExists = await server
      .loadAccount(recipient)
      .then(() => true)
      .catch(() => false);

    if (!recipientExists) {
      console.log("📌 Recipient chưa tồn tại. Sẽ tạo tài khoản mới.");
      operation = StellarSdk.Operation.createAccount({
        destination: recipient,
        startingBalance: amount.toString()
      });
    } else {
      operation = StellarSdk.Operation.payment({
        destination: recipient,
        asset: StellarSdk.Asset.native(),
        amount: amount.toString()
      });
    }

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: baseFee.toString(),
      networkPassphrase: "Pi Testnet",
      timebounds
    })
      .addOperation(operation)
      .addMemo(StellarSdk.Memo.text(identifier))
      .build();

    const keypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
    transaction.sign(keypair);

    const submitResult = await server.submitTransaction(transaction);
    const txid = submitResult.id;

    await axiosClient.post(`/v2/payments/${identifier}/complete`, { txid });

    res.json({ success: true, txid, identifier });

  } catch (err) {
    console.error("❌ A2U dynamic error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Lỗi khi xử lý A2U", error: err.message });
  }
});

//Load the account
const myPublicKey = "APP_PUBLIC_KEY" // your public key, starts with G

// an object that let you communicate with the Pi Testnet
// if you want to connect to Pi Mainnet, use 'https://api.mainnet.minepi.com' instead
const piTestnet = new Server('https://api.testnet.minepi.com');

let myAccount;
piTestnet.loadAccount(myPublicKey).then(response => myAccount = response);

let baseFee;
piTestnet.fetchBaseFee().then(response => baseFee = response);

//Build the transaction
// create a payment operation which will be wrapped in a transaction
let payment = StellarSdk.Operation.payment({
  destination: recipientAddress,
  asset: StellarSdk.Asset.native(),
  amount: body.amount.toString()
});

// 180 seconds timeout
let timebounds;
piTestnet.fetchTimebounds(180).then(response => timebounds = response);

let transaction = new StellarSdk.TransactionBuilder(myAccount, {
  fee: baseFee,
  networkPassphrase: "Pi Testnet", // use "Pi Network" for mainnet transaction
  timebounds: timebounds
})
.addOperation(payment)
// IMPORTANT! DO NOT forget to include the payment id as memo
.addMemo(StellarSdk.Memo.text(paymentIdentifier));
transaction = transaction.build();

//Sign the transaction
// See the "Obtain your wallet's private key" section above to get this.
// And DON'T HARDCODE IT, treat it like a production secret.
const mySecretSeed = "APP_PRIVATE_KEY"; // NEVER expose your secret seed to public, starts with S
const myKeypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
transaction.sign(myKeypair);

//Submit the transaction to the Pi blockchain
let txid;
piTestnet.submitTransaction(transaction).then(response => txid = response.id);

//Complete the payment by sending API request to /complete endpoint
// check if the response status is 200 
let completeResponse;
axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, {txid}, config).then(response => completeResponse = response);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U backend chạy tại http://localhost:${PORT}`);
});
