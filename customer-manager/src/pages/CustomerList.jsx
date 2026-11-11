import React, { useState } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useImport } from '../hooks/useImport';
import { useConfirm } from '../hooks/useConfirm';
import { useVerification } from '../hooks/useVerification';
import { CustomerTable } from '../components/CustomerTable';
import { CustomerForm } from '../components/CustomerForm';
import { ImportModal } from '../components/ImportModal';
import { Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { VerificationModal } from '../components/VerificationModal';

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

  const { dialogState, confirm, alert } = useConfirm();
  
  const {
    isVerified,
    showVerifyModal,
    verify,
    requireVerification,
    cancelVerification,
    clearVerification,
  } = useVerification();

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Form handlers
  const openAdd = () => {
    requireVerification(() => {
      setEditing(null);
      setShowForm(true);
      setShowImport(false);
      setNotice('');
    });
  };

  const openEdit = (customer) => {
    requireVerification(() => {
      setEditing(customer);
      setShowForm(true);
      setShowImport(false);
      setNotice('');
    });
  };

  const closeForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const handleSave = async (formData) => {
    const confirmed = await confirm({
      title: editing ? 'Xác nhận cập nhật' : 'Xác nhận thêm mới',
      message: editing 
        ? `Bạn có chắc muốn cập nhật thông tin khách hàng "${formData.name}"?`
        : `Bạn có chắc muốn thêm khách hàng "${formData.name}"?`,
      confirmText: 'Xác nhận',
      cancelText: 'Hủy',
      type: 'confirm'
    });

    if (!confirmed) return;
    
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
    requireVerification(async () => {
      const confirmed = await confirm({
        title: '⚠️ Xác nhận xóa khách hàng',
        message: `Tên: ${customer.name}\nSĐT: ${customer.phone}\n\nKhách hàng sẽ bị ẩn khỏi danh sách (có thể khôi phục sau).\n\nBạn có chắc chắn muốn xóa?`,
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        type: 'warning'
      });

      if (!confirmed) return;

      try {
        await deleteCustomer(customer.id);
        setNotice('🗑️ Đã xóa khách hàng.');
      } catch (err) {
        setNotice('❌ ' + err.message);
      }
    });
  };

  // Import handlers
  const openImport = () => {
    requireVerification(() => {
      setShowForm(false);
      setShowImport(true);
      resetImport();
      setNotice('');
    });
  };

  const closeImport = () => {
    setShowImport(false);
    resetImport();
    setNotice('');
  };

  const handleImport = async (onProgress) => {
    const confirmed = await confirm({
      title: 'Xác nhận import',
      message: `Bạn có muốn import ${importData.length} khách hàng vào hệ thống?\n\nLưu ý: Quá trình này có thể mất vài phút.`,
      confirmText: 'Import',
      cancelText: 'Hủy',
      type: 'confirm'
    });

    if (!confirmed) return;

    try {
      const result = await importAllContacts((current, total) => {
        setNotice(`⏳ Đang import: ${current}/${total}...`);
      });

      closeImport();
      await reload();
      
      await alert({
        title: '✅ Import thành công',
        message: `Đã import ${result.success} khách hàng thành công${result.failed > 0 ? `\n${result.failed} khách hàng bị lỗi` : ''}`,
        confirmText: 'OK',
        type: 'success'
      });
      
      setNotice('');
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

  // Verification handlers
  const handleVerify = (code) => {
    const success = verify(code);
    // Không cần xử lý gì ở đây
    // Error sẽ được hiển thị trong modal
    return success;
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Verification Badge */}
          <div 
            className={`verification-badge ${isVerified ? 'verified' : 'unverified'}`}
            onClick={() => isVerified ? clearVerification() : requireVerification(() => {})}
            title={isVerified ? 'Click để đăng xuất' : 'Chưa xác minh'}
          >
            {isVerified ? (
              <>
                <span>✓</span>
                <span>Đã xác minh</span>
              </>
            ) : (
              <>
                <span>🔒</span>
                <span>Chưa xác minh</span>
              </>
            )}
          </div>
          
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

      <ConfirmDialog {...dialogState} />
      <VerificationModal 
        isOpen={showVerifyModal}
        onVerify={handleVerify}
        onCancel={cancelVerification}
      />
    </main>
  );
}
