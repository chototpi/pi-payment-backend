import express from "express";
import cors from "cors";
import axios from "axios";
import pkg from "@stellar/stellar-sdk";
import { v4 as uuidv4 } from 'uuid'; // Cài thêm: npm install uuid

const { Server, Keypair, Asset, Operation, TransactionBuilder, Memo } = pkg;

const app = express();
app.use(express.json());

// =============================
// Cấu hình
// =============================

// ✅ [Bảo mật] Chỉ cho phép domain của app bạn truy cập
const allowedOrigins = ['https://testnet.chototpi.site', 'https://vn.payofpi.click'];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);

// 🔑 Biến môi trường
const { PI_API_KEY, APP_PUBLIC_KEY, APP_PRIVATE_KEY, PORT = 3000 } = process.env;
if (!PI_API_KEY || !APP_PUBLIC_KEY || !APP_PRIVATE_KEY) {
  throw new Error("Vui lòng cung cấp đủ các biến môi trường: PI_API_KEY, APP_PUBLIC_KEY, APP_PRIVATE_KEY");
}

const PI_API_BASE_URL = "https://api.minepi.com";
const HORIZON_URL = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// Axios client cho Pi Server
const axiosClient = axios.create({
  baseURL: PI_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// =============================
// 헬퍼 함수 (Helper Functions)
// =============================

/**
 * Xác thực người dùng qua Access Token và lấy thông tin
 */
async function fetchPiUser(accessToken) {
  try {
    const { data } = await axios.get(`${PI_API_BASE_URL}/v2/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  } catch (error) {
    console.error("⚠️ Lỗi xác thực người dùng:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Tạo và gửi giao dịch trên Stellar Testnet
 */
async function submitStellarTransaction(destination, amount, memo) {
  const server = new Server(HORIZON_URL);
  const sourceKeypair = Keypair.fromSecret(APP_PRIVATE_KEY);
  const sourceAccount = await server.loadAccount(APP_PUBLIC_KEY);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: await server.fetchBaseFee(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: amount.toString(),
      })
    )
    .addMemo(Memo.text(memo))
    .setTimeout(30) // Giao dịch sẽ hết hạn sau 30s
    .build();

  tx.sign(sourceKeypair);
  const txResult = await server.submitTransaction(tx);
  console.log("✅ Giao dịch Stellar đã được gửi:", txResult.hash);
  return txResult.hash; // Trả về transaction hash (txid)
}

// =============================
// ROUTER: A2U Testnet
// =============================
// =============================
// ROUTER: A2U Testnet (Phiên bản ổn định)
// =============================
app.post("/api/a2u-payment", async (req, res) => {
  const { amount, accessToken } = req.body;
  const memo = "Payment from My Awesome App";

  // 1. Kiểm tra đầu vào cơ bản
  if (!amount || !accessToken) {
    return res.status(400).json({ success: false, message: "Thiếu 'amount' hoặc 'accessToken'" });
  }

  // 2. Xác thực người dùng và lấy thông tin từ Pi Network
  const userInfo = await fetchPiUser(accessToken);
  if (!userInfo) {
    return res.status(401).json({ success: false, message: "Access Token không hợp lệ hoặc đã hết hạn" });
  }

  // ✅ [DEBUG] In ra thông tin user vừa lấy được để kiểm tra.
  // Đây là bước quan trọng nhất để xác nhận bạn có nhận được UID dạng 'SANDBOX_...' hay không.
  console.log("✅ [DEBUG] Dữ liệu người dùng nhận được từ Pi Server:", userInfo);

  // ✅ [BẢO VỆ] Kiểm tra kỹ xem object user trả về có thuộc tính 'uid' không.
  // Điều này giúp phòng trường hợp Pi API thay đổi hoặc trả về dữ liệu không mong muốn.
  if (!userInfo.uid) {
    console.error("❌ Lỗi nghiêm trọng: Dữ liệu user từ Pi API không chứa UID.", userInfo);
    return res.status(500).json({ success: false, message: "Không thể xử lý vì thiếu UID người dùng." });
  }
  
  // Tạo một key duy nhất cho mỗi yêu cầu để tránh thanh toán lặp lại
  const idempotencyKey = uuidv4();

  try {
    // 3. Tạo payment trên Pi Server để lấy địa chỉ ví người nhận
    const createPaymentBody = {
      recipient: userInfo.uid, // Sử dụng UID đã được xác thực
      amount,
      memo,
      metadata: { internal_order_id: 'ORDER_XYZ_789' }, // Dữ liệu riêng của bạn
    };
    
    console.log(`⏳ Đang tạo payment cho user: ${userInfo.uid} với số tiền: ${amount}`);
    const { data: createdPayment } = await axiosClient.post("/v2/payments", createPaymentBody, {
      headers: { 
        'Authorization': `Key ${PI_API_KEY}`,
        'X-Idempotency-Key': idempotencyKey 
      },
    });
    const { identifier, recipient_address } = createdPayment;
    console.log(`✅ Payment được tạo với ID: ${identifier}`);

    // 4. Gửi giao dịch trên mạng Stellar Testnet
    const txid = await submitStellarTransaction(recipient_address, amount, memo);
    
    // 5. Hoàn tất payment trên Pi Server
    console.log(`⏳ Đang hoàn tất payment ${identifier} với txid: ${txid}`);
    await axiosClient.post(`/v2/payments/${identifier}/complete`, { txid }, {
      headers: { 
        'Authorization': `Key ${PI_API_KEY}`,
        'X-Idempotency-Key': idempotencyKey
      }
    });

    console.log(`🎉 Payment ${identifier} hoàn tất thành công!`);
    return res.json({ success: true, paymentId: identifier, txid });

  } catch (err) {
    // Ghi log lỗi chi tiết hơn để dễ dàng debug
    const errorDetails = err.response?.data || { message: err.message };
    console.error("❌ Lỗi trong quá trình xử lý thanh toán A2U:", JSON.stringify(errorDetails, null, 2));
    
    // Gợi ý: Tại đây bạn có thể thêm logic để gọi API /cancel của Pi nếu payment đã được tạo nhưng các bước sau thất bại.
    
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý thanh toán A2U",
      error: errorDetails,
    });
  }
});

// =============================
// Server start
// =============================
app.listen(PORT, () => {
  console.log(`✅ A2U Backend đang chạy tại cổng ${PORT}`);
});
