import { useState, useCallback } from 'react';
import { parseFile } from '../utils/fileParser';
import { api } from '../services/api';

export function useImport() {
  const [importData, setImportData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = useCallback((file) => {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const fileType = fileName.split('.').pop();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parsed = parseFile(file, content);

        if (parsed.length === 0) {
          setError('Không tìm thấy dữ liệu hợp lệ trong file');
          setImportData([]);
        } else {
          setImportData(parsed);
          setError('');
        }
      } catch (err) {
        console.error('Parse error:', err);
        setError('Lỗi khi đọc file: ' + err.message);
        setImportData([]);
      }
    };

    // Đọc file theo định dạng phù hợp
    if (fileType === 'xlsx' || fileType === 'xls') {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  }, []);

  const importAllContacts = useCallback(async (onProgress) => {
    if (importData.length === 0) {
      throw new Error('Không có dữ liệu để import');
    }

    setImporting(true);
    setError('');
    
    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < importData.length; i++) {
        const contact = importData[i];
        try {
          await api.createCustomer(contact);
          success++;

          // Callback tiến trình
          if (onProgress && (i + 1) % 50 === 0) {
            onProgress(i + 1, importData.length);
          }
        } catch (err) {
          console.error(`Lỗi import ${contact.name}:`, err);
          failed++;
        }
      }

      return { success, failed, total: importData.length };
    } finally {
      setImporting(false);
    }
  }, [importData]);

  const reset = useCallback(() => {
    setImportData([]);
    setImporting(false);
    setError('');
  }, []);

  return {
    importData,
    importing,
    error,
    handleFileUpload,
    importAllContacts,
    reset,
  };
}
