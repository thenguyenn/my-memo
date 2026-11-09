# Website quản lý khách hàng

React + Vite + Vercel Functions + Supabase PostgreSQL.

## Tính năng
- Thêm, sửa, xóa khách hàng.
- Tìm kiếm theo tên hoặc số điện thoại.
- Phân trang linh hoạt: 20/50/100 bản ghi/trang.
- **Truy cập trực tiếp** - không yêu cầu mã truy cập.
- Giao diện đơn giản, dễ sử dụng.

## 1. Tạo database Supabase
1. Tạo project tại https://supabase.com.
2. Mở SQL Editor, chạy toàn bộ nội dung `supabase.sql`.
3. Vào Project Settings > API, lấy Project URL và `service_role` key. Không chia sẻ service role key và không đặt key này trong biến `VITE_*`.

## 2. Chạy thử trên máy
Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
npm install
cp .env.example .env
# Điền SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào .env
npm run dev
```

Lưu ý: `npm run dev` của Vite chỉ chạy giao diện; API `/api/*` là Vercel Functions. Để chạy đầy đủ cả API ở local, cài Vercel CLI và dùng `vercel dev` sau khi liên kết project:

```bash
npx vercel link
npx vercel dev
```

## 3. Deploy Vercel
1. Đưa source lên GitHub (không commit `.env`).
2. Import repository tại https://vercel.com/new.
3. Framework preset: Vite; Build command `npm run build`; Output directory `dist`.
4. Project Settings > Environment Variables, thêm:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Redeploy.

Các API functions trong thư mục `api/` sẽ được Vercel tự nhận diện.

## Lưu ý bảo mật quan trọng
- ⚠️ **Website này KHÔNG có xác thực** - bất kỳ ai truy cập đều có thể xem, thêm, sửa, xóa dữ liệu.
- Không nên dùng cho dữ liệu nhạy cảm hoặc môi trường công cộng.
- Nếu cần bảo mật, nên thêm:
  - Vercel Authentication
  - Vercel Firewall / giới hạn IP
  - Hoặc khôi phục lại hệ thống mã truy cập
- Nên sao lưu dữ liệu định kỳ trong Supabase.

## Các thay đổi gần đây
- ✅ Loại bỏ yêu cầu mã truy cập - truy cập trực tiếp
- ✅ Thêm tùy chọn phân trang: 20/50/100 mục/trang
- ✅ Lưu tùy chọn phân trang vào localStorage
