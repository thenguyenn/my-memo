import React, { useRef } from 'react';

export function ImportModal({ importData, importing, onFileUpload, onImport, onClose, onProgressUpdate }) {
  const fileInputRef = useRef(null);

  const handleImport = async () => {
    await onImport(onProgressUpdate);
  };

  return (
    <div className="panel import-panel">
      <div className="panel-title">
        <h2>📁 Import danh bạ hàng loạt</h2>
        <button type="button" className="icon-button" onClick={onClose}>✕</button>
      </div>
      
      <div className="import-instructions">
        <p><strong>Hỗ trợ định dạng:</strong></p>
        <ul>
          <li><strong>.txt</strong> - File danh bạ (format: số thứ tự + tên, SĐT: xxx)</li>
          <li><strong>.json</strong> - JSON array với keys: name/phone/address</li>
          <li><strong>.xlsx/.xls</strong> - Excel với cột Tên, SĐT, Địa chỉ</li>
        </ul>
        <p className="muted">📞 Số điện thoại +84 sẽ tự động chuyển về định dạng 0xxx</p>
      </div>

      <div className="file-upload-zone">
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".txt,.json,.xlsx,.xls" 
          onChange={e => onFileUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <label 
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <span style={{ fontSize: '32px' }}>📤</span>
          <span>Chọn file để import</span>
          <small>.txt, .json, .xlsx, .xls</small>
        </label>
      </div>

      {importData.length > 0 && (
        <>
          <div className="import-preview">
            <h3>👀 Preview {importData.length} khách hàng:</h3>
            <div className="preview-table-scroll">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>#</th>
                    <th>Tên khách hàng</th>
                    <th>Số điện thoại</th>
                    <th>Địa chỉ</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.slice(0, 10).map((item, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>{item.address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importData.length > 10 && (
              <p className="muted" style={{ marginTop: '12px', textAlign: 'center' }}>
                ... và {importData.length - 10} khách hàng khác
              </p>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="ghost" onClick={onClose}>Hủy</button>
            <button 
              type="button" 
              className="primary" 
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? '⏳ Đang import...' : `✅ Import ${importData.length} khách hàng`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
