import React, { useState } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useImport } from '../hooks/useImport';
import { CustomerTable } from '../components/CustomerTable';
import { CustomerForm } from '../components/CustomerForm';
import { ImportModal } from '../components/ImportModal';
import { Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';

export function CustomerList() {
  const {
    customers,
    search,
    setSearch,
    page,
    setPage,
    limit,
    changeLimit,
    count,
    loading,
    error,
    totalPages,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    reload,
  } = useCustomers();

  const {
    importData,
    importing,
    error: importError,
    handleFileUpload,
    importAllContacts,
    reset: resetImport,
  } = useImport();

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Form handlers
  const openAdd = () => {
    setEditing(null);
    setShowForm(true);
    setShowImport(false);
    setNotice('');
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setShowForm(true);
    setShowImport(false);
    setNotice('');
  };

  const closeForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const handleSave = async (formData) => {
    setSaveLoading(true);
    try {
      if (editing) {
        await updateCustomer(editing.id, formData);
        setNotice('✅ Đã cập nhật khách hàng.');
        closeForm();
      } else {
        await createCustomer(formData);
        setNotice('✅ Đã thêm khách hàng.');
        // Giữ form mở để thêm tiếp
      }
    } catch (err) {
      setNotice('❌ ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (customer) => {
    const confirmMessage = `⚠️ XÁC NHẬN XÓA KHÁCH HÀNG\n\nTên: ${customer.name}\nSĐT: ${customer.phone}\n\nKhách hàng sẽ bị ẩn khỏi danh sách (có thể khôi phục sau).\n\nBạn có chắc chắn muốn xóa?`;
    
    if (!window.confirm(confirmMessage)) return;

    try {
      await deleteCustomer(customer.id);
      setNotice('🗑️ Đã xóa khách hàng.');
    } catch (err) {
      setNotice('❌ ' + err.message);
    }
  };

  // Import handlers
  const openImport = () => {
    setShowForm(false);
    setShowImport(true);
    resetImport();
    setNotice('');
  };

  const closeImport = () => {
    setShowImport(false);
    resetImport();
    setNotice('');
  };

  const handleImport = async (onProgress) => {
    try {
      const result = await importAllContacts((current, total) => {
        setNotice(`⏳ Đang import: ${current}/${total}...`);
      });

      closeImport();
      await reload();
      setNotice(`✅ Import hoàn tất: ${result.success} thành công${result.failed > 0 ? `, ${result.failed} lỗi` : ''}`);
    } catch (err) {
      setNotice('❌ ' + err.message);
    }
  };

  const handleFileSelect = (file) => {
    handleFileUpload(file);
    if (!importError) {
      setNotice(`✅ Đã phân tích ${importData.length} liên hệ từ file ${file.name}`);
    }
  };

  // Search handler
  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <main className="app-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">TỔNG QUAN</p>
          <h1>Danh sách khách hàng</h1>
          <p className="muted">Quản lý thông tin khách hàng tập trung trên nền tảng trực tuyến.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="ghost" 
            onClick={openImport} 
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>📁</span> Import danh bạ
          </button>
          <button className="primary" onClick={openAdd}>
            ＋ Thêm khách hàng
          </button>
        </div>
      </section>

      {notice && (
        <div className={`notice ${notice.includes('❌') || notice.includes('không') ? 'error' : 'success'}`}>
          {notice}
        </div>
      )}

      {showImport && (
        <ImportModal
          importData={importData}
          importing={importing}
          onFileUpload={handleFileSelect}
          onImport={handleImport}
          onClose={closeImport}
          onProgressUpdate={(current, total) => setNotice(`⏳ Đang import: ${current}/${total}...`)}
        />
      )}

      {showForm && (
        <CustomerForm
          customer={editing}
          onSave={handleSave}
          onCancel={closeForm}
          loading={saveLoading}
        />
      )}

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Dữ liệu khách hàng</h2>
            <p className="muted">Tìm theo tên hoặc số điện thoại</p>
          </div>
          <SearchBar value={search} onChange={handleSearch} />
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="th-name">KHÁCH HÀNG</th>
                <th className="th-phone">SỐ ĐIỆN THOẠI</th>
                <th className="th-address">ĐỊA CHỈ</th>
                <th className="th-actions">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              <CustomerTable
                customers={customers}
                loading={loading}
                search={search}
                page={page}
                limit={limit}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          count={count}
          limit={limit}
          loading={loading}
          onPageChange={setPage}
          onLimitChange={changeLimit}
        />
      </section>

      <footer>Thông tin khách hàng được lưu trên cơ sở dữ liệu trực tuyến.</footer>
    </main>
  );
}
