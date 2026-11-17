# Website quản lý khách hàng

React + Vite + Vercel Functions + Supabase PostgreSQL.

## Tính năng
- Thêm, sửa, xóa khách hàng.
- Tìm kiếm theo tên hoặc số điện thoại.
- Phân trang linh hoạt: 20/50/100 bản ghi/trang.
- **Xác minh bằng mã code** - bảo vệ dữ liệu khách hàng.
- **Soát hàng J&T** - quản lý đơn tồn kho, import từ file Excel/CSV.
- Giao diện đơn giản, dễ sử dụng.

## 1. Tạo database Supabase
1. Tạo project tại https://supabase.com.
2. Mở SQL Editor, chạy toàn bộ nội dung `supabase.sql` (bảng customers).
3. **Nếu dùng tính năng J&T:** Chạy thêm `supabase-jt.sql` (bảng jt_parcels).
4. Vào Project Settings > API, lấy Project URL và `service_role` key. Không chia sẻ service role key và không đặt key này trong biến `VITE_*`.

## 2. Chạy thử trên máy
Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
npm install
cp .env.example .env
# Điền các biến môi trường vào .env:
# - SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY
# - VITE_VERIFY_CODE (mã xác minh, mặc định 271104)
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
   - `VITE_VERIFY_CODE` (mã xác minh, ví dụ: 271104)
5. Redeploy.

Các API functions trong thư mục `api/` sẽ được Vercel tự nhận diện.

## Tính năng Soát hàng J&T
- Nhập mã xác minh (mặc định: 271104) để truy cập.
- Import dữ liệu tồn kho từ file Excel/CSV hoặc copy-paste từ web J&T.
- Xem thống kê đơn tồn theo ngày (từ 1-5 ngày).
- Nhóm theo shipper, xem chi tiết đơn tồn.
- Copy tin nhắn nhắc nhở shipper.
- Tự động đóng đơn đã hết tồn khi import snapshot mới.

## Lưu ý bảo mật quan trọng
- ⚠️ **Mã xác minh được lưu trong biến môi trường** - đảm bảo không chia sẻ file `.env`.
- Thay đổi `VITE_VERIFY_CODE` để bảo mật hệ thống của bạn.
- Mã xác minh được lưu trong localStorage 8 giờ.
- Nếu cần bảo mật cao hơn, nên thêm:
  - Vercel Authentication
  - Vercel Firewall / giới hạn IP
- Nên sao lưu dữ liệu định kỳ trong Supabase.

## Các thay đổi gần đây
- ✅ Thêm tính năng Soát hàng J&T với backend API đầy đủ
- ✅ Xác minh bằng mã code (VITE_VERIFY_CODE)
- ✅ Redesign UI hiện đại với sidebar và màu sắc mới
- ✅ Thông báo tự động ẩn sau 3 giây
- ✅ Form tự động xóa sau khi thêm khách hàng
- ✅ Thêm tùy chọn phân trang: 20/50/100 mục/trang

## Tính năng Care đơn (/care-don)
- Up 3 file: Ký nhận trong ngày, Trạng thái mã vận đơn, Xuất vận đơn phát hàng.
- Tự lọc vận đơn chưa ký nhận, xếp theo mức ưu tiên (kiện vấn đề, từ chối, số ngày tồn).
- Ghi kết quả chăm sóc, trạng thái (Chưa xử lý / Đang xử lý / Đã hoàn tất), người phụ trách, lịch sử; care hàng loạt; xuất Excel.
- Chạy `supabase-care.sql` trên Supabase để lưu trạng thái care dùng chung. Nếu chưa chạy, dữ liệu care tạm lưu trên trình duyệt.
