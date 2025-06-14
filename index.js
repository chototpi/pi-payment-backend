  const axios = require('axios');

  // API Key of your app, available in the Pi Developer Portal
  // DO NOT hardcode this, read it from an environment variable and treat it like a production secret.
  const PI_API_KEY = "YOUR_PI_API_KEY"

  const axiosClient = axios.create({baseURL: 'https://api.minepi.com', timeout: 20000});
  const config = {headers: {'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json'}};
  
  // This is the user UID of this payment's recipient
  const userUid = "a1111111-aaaa-bbbb-2222-ccccccc3333d" // this is just an example uid!
  const body =  {amount: 1, memo: "Memo for user", metadata: {test: "your metadata"}, uid: userUid}; // your payment data and uid
  
  let paymentIdentifier;
  let recipientAddress;

  axiosClient.post(`/v2/payments`, body, config).then(response => {
    paymentIdentifier = response.data.identifier;
    recipientAddress = response.data.recipient;
  });

const StellarSdk = require('stellar-sdk');

const myPublicKey = "G_YOUR_PUBLIC_KEY" // your public key, starts with G

// an object that let you communicate with the Pi Testnet
// if you want to connect to Pi Mainnet, use 'https://api.mainnet.minepi.com' instead
const piTestnet = new StellarSdk.Server('https://api.testnet.minepi.com');

let myAccount;
piTestnet.loadAccount(myPublicKey).then(response => myAccount = response);

let baseFee;
piTestnet.fetchBaseFee().then(response => baseFee = response);

// See the "Obtain your wallet's private key" section above to get this.
// And DON'T HARDCODE IT, treat it like a production secret.
const mySecretSeed = "S_YOUR_SECRET_SEED"; // NEVER expose your secret seed to public, starts with S
const myKeypair = StellarSdk.Keypair.fromSecret(mySecretSeed);
transaction.sign(myKeypair);

let txid;
piTestnet.submitTransaction(transaction).then(response => txid = response.id);

// check if the response status is 200 
let completeResponse;
axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, {txid}, config).then(response => completeResponse = response);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ A2U backend (SDK 12.x ESM) đang chạy tại http://localhost:${PORT}`);
});
