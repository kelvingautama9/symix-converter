import React, { useState, useEffect, useRef } from 'react';
import {
  CustomerMapping,
  getCustomerMappings,
  upsertCustomerMapping,
  editCustomerMapping,
  deleteCustomerMapping,
  resetCustomerMappingsToDefault,
  normalizeCustomerCode,
  importCustomerMappingsFromExcel,
  downloadCustomerTemplateExcel,
  exportCustomerMappingsToExcel,
} from '../utils/customerManager';
import { haptic } from '../utils/haptics';
import confetti from 'canvas-confetti';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  X,
  Check,
  AlertCircle,
  Building2,
  Tag,
  Upload,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface CustomerDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  unregisteredCodes?: string[];
  onDataChanged?: () => void;
}

export const CustomerDataModal: React.FC<CustomerDataModalProps> = ({
  isOpen,
  onClose,
  unregisteredCodes = [],
  onDataChanged,
}) => {
  const [mappings, setMappings] = useState<CustomerMapping[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Form state for Add or Edit (only Code and Name, NO Keterangan)
  const [isEditing, setIsEditing] = useState(false);
  const [editingOldCode, setEditingOldCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputName, setInputName] = useState('');

  // Delete confirm state
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);

  // Hidden file input ref for Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    setMappings(getCustomerMappings());
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setErrorMsg('');
      setSuccessMsg('');
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingOldCode('');
    setInputCode('');
    setInputName('');
    setConfirmDeleteCode(null);
  };

  const handleStartEdit = (item: CustomerMapping) => {
    haptic.selection();
    setIsEditing(true);
    setEditingOldCode(item.code);
    setInputCode(item.code);
    setInputName(item.name);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanCode = normalizeCustomerCode(inputCode);
    const cleanName = inputName.trim();

    if (!cleanCode) {
      setErrorMsg('Kode Customer tidak boleh kosong (contoh: G003, P008, D012).');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Nama Customer tidak boleh kosong (contoh: PT. GAMA INTI WAHANA).');
      return;
    }

    try {
      if (isEditing) {
        editCustomerMapping(editingOldCode, cleanCode, cleanName);
        setSuccessMsg(`Data Customer "${cleanCode} - ${cleanName}" berhasil diperbarui.`);
      } else {
        upsertCustomerMapping(cleanCode, cleanName);
        setSuccessMsg(`Customer baru "${cleanCode} - ${cleanName}" berhasil ditambahkan.`);
      }
      haptic.success();
      loadData();
      resetForm();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      haptic.error();
      setErrorMsg(err.message || 'Terjadi kesalahan saat menyimpan data.');
    }
  };

  const handleDelete = (code: string) => {
    try {
      deleteCustomerMapping(code);
      haptic.medium();
      setSuccessMsg(`Customer dengan kode "${code}" berhasil dihapus.`);
      setConfirmDeleteCode(null);
      loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      haptic.error();
      setErrorMsg(err.message || 'Gagal menghapus data.');
    }
  };

  const handleResetDefault = () => {
    if (
      window.confirm(
        'Apakah Anda yakin ingin mengembalikan Data Customer ke daftar default bawaan? Data yang diimpor akan tereset.'
      )
    ) {
      resetCustomerMappingsToDefault();
      haptic.selection();
      setSuccessMsg('Data Customer berhasil dikembalikan ke default.');
      loadData();
      resetForm();
      if (onDataChanged) onDataChanged();
    }
  };

  const handleQuickAdd = (code: string) => {
    haptic.selection();
    resetForm();
    const normalized = normalizeCustomerCode(code);
    setInputCode(normalized);
    setInputName(`Customer ${normalized}`);
    setIsEditing(false);
  };

  // Process uploaded Excel file
  const processExcelFile = async (file: File) => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsImporting(true);
    haptic.selection();

    try {
      const res = await importCustomerMappingsFromExcel(file);
      haptic.success();
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#0284c7', '#10b981', '#3b82f6'],
      });
      setSuccessMsg(
        `Sukses! ${res.addedCount} customer baru ditambahkan, ${res.updatedCount} diperbarui. Total kini ${res.totalNow} customer tersimpan di browser.`
      );
      loadData();
      resetForm();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      haptic.error();
      setErrorMsg(err.message || 'Gagal memproses file Excel.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  if (!isOpen) return null;

  const filteredMappings = mappings.filter((m) => {
    const q = searchTerm.toLowerCase();
    return (
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q)
    );
  });

  // Preview real-time smart normalizer result
  const previewNormalizedCode = inputCode ? normalizeCustomerCode(inputCode) : '';
  const isCodeModifiedByParser =
    inputCode.trim() !== '' &&
    previewNormalizedCode !== inputCode.trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Hidden File Input for Excel Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Data Customer</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {mappings.length} Terdaftar
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Kamus pemetaan Kode Customer pada Artikel (contoh: SH-P008-01307-A &rarr; P008 = PT. PURBAYASA PUTRAPERKASA)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unregistered Codes Alert Banner (Auto-detect) */}
        {unregisteredCodes.length > 0 && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between flex-wrap gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Ditemukan <strong>{unregisteredCodes.length}</strong> kode customer baru pada file:
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {unregisteredCodes.map((code) => {
                  const norm = normalizeCustomerCode(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleQuickAdd(norm)}
                      className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 font-mono font-bold text-amber-950 inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title={`Klik untuk menambahkan ${norm} ke Data Customer`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{norm}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <span className="text-[11px] text-amber-800 italic">
              Klik kode di atas atau gunakan <strong>Import Excel</strong> untuk memasukkan master list.
            </span>
          </div>
        )}

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-500 hover:text-red-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Actions: Import Excel & Template Banner */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-3.5 sm:p-4 transition-all flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                    Import List Data Customer by File Excel
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-mono inline-flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                    Parsing Canggih
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tersimpan otomatis di browser (LocalStorage). Kode berlebih (misal{' '}
                  <span className="font-mono font-semibold text-slate-700">G000003</span>) langsung otomatis
                  dikonversi jadi <span className="font-mono font-bold text-blue-700">G003</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={downloadCustomerTemplateExcel}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Unduh contoh file template Excel"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Template Excel</span>
              </button>

              <button
                type="button"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Memproses...' : 'Import File Excel'}</span>
              </button>
            </div>
          </div>

          {/* Add / Edit Form Card (Hanya Kode Customer & Nama Customer - Bagian Keterangan Dihapus) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                {isEditing ? (
                  <>
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit Data Customer ({editingOldCode})</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tambah Data Customer</span>
                  </>
                )}
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSaveForm} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Input Kode Customer (4 kolom) */}
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Kode Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Contoh: G003 atau G000003"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 uppercase"
                  />
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
                {/* Live normalization helper */}
                {isCodeModifiedByParser ? (
                  <span className="text-[10px] text-blue-600 font-semibold mt-0.5 block">
                    Otomatis diparsing menjadi: <strong className="font-mono">{previewNormalizedCode}</strong>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Standar ERP 4 digit (misal P008, G003, D012)
                  </span>
                )}
              </div>

              {/* Input Nama Customer (8 kolom) */}
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Nama Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT. GAMA INTI WAHANA"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  />
                  <Building2 className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Nama resmi yang muncul pada Kolom Customers di Rekap Sales & Export Excel
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="sm:col-span-12 flex items-center justify-end gap-2 pt-1">
                {isEditing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  {isEditing ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Simpan Perubahan</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tambah Data Customer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Search Bar & Export / Reset Defaults */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari kode atau nama customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCustomerMappingsToExcel}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Ekspor seluruh daftar Data Customer saat ini ke file Excel"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Kembalikan ke 5 daftar bawaan (P008, C002, D009, D012, M003)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset ke Default</span>
              </button>
            </div>
          </div>

          {/* Table List of Customers (Tanpa Kolom Keterangan) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-center w-12">No</th>
                  <th className="px-4 py-2.5 min-w-[120px]">Kode Customer</th>
                  <th className="px-5 py-2.5">Nama Customer</th>
                  <th className="px-3 py-2.5 text-center min-w-[120px]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredMappings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Tidak ada Data Customer yang cocok dengan pencarian "{searchTerm}".
                    </td>
                  </tr>
                ) : (
                  filteredMappings.map((item, idx) => {
                    const isDeletingThis = confirmDeleteCode === item.code;
                    return (
                      <tr
                        key={item.code}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          editingOldCode === item.code ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-slate-900 inline-block font-mono">
                            {item.code}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>{item.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {isDeletingThis ? (
                            <div className="inline-flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                              <span className="text-[10px] text-red-700 font-bold px-1">
                                Yakin hapus?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.code)}
                                className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                              >
                                Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCode(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] hover:bg-slate-300 cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Customer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  haptic.selection();
                                  setConfirmDeleteCode(item.code);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Hapus Customer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tersimpan otomatis di browser (LocalStorage)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
