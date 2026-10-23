import React, { useState } from 'react';
import { Download, ExternalLink, X, CheckCircle2, Printer, Eye, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { printElementInIframe } from '../utils/pdfDownload';

interface PdfDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  blobUrl: string;
  dataUri: string;
  filename: string;
  serverDownloadUrl?: string;
  language: 'ar' | 'en';
  elementId?: string;
}

export function PdfDownloadModal({
  isOpen,
  onClose,
  blobUrl,
  dataUri,
  filename,
  serverDownloadUrl,
  language,
  elementId = 'printable-approved-form'
}: PdfDownloadModalProps) {
  const [activeTab, setActiveTab] = useState<'download' | 'preview'>('download');
  const [downloadAttempted, setDownloadAttempted] = useState(false);

  if (!isOpen) return null;

  const directUrl = serverDownloadUrl || blobUrl || dataUri;
  const downloadTargetUrl = blobUrl || dataUri;

  const handleTriggerIframePrint = () => {
    printElementInIframe(elementId);
  };

  const handleDirectWindowPrint = () => {
    try {
      window.print();
    } catch (e) {
      printElementInIframe(elementId);
    }
  };

  const handleOpenNewWindowPrint = () => {
    try {
      const elem = document.getElementById(elementId);
      const elemHtml = elem ? elem.outerHTML : '';
      
      let headStyles = '';
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((styleTag) => {
        headStyles += styleTag.outerHTML;
      });

      const printHtml = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>${filename}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
          ${headStyles}
          <style>
            @page { size: A4 landscape !important; margin: 5mm 6mm !important; }
            body { background: #ffffff !important; color: #000000 !important; margin: 0; padding: 10px; font-family: 'Cairo', 'Almarai', sans-serif; }
            .print-btn-bar { background: #0f172a; color: white; padding: 12px 20px; text-align: center; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between; border-radius: 12px; margin-bottom: 16px; }
            .print-btn-bar button { background: #107c41; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 14px; }
            @media print { .print-btn-bar { display: none !important; } }
          </style>
        </head>
        <body>
          <div class="print-btn-bar">
            <span>وزارة التربية والتعليم - استمارة فحص جاهزة للطباعة / الحفظ كـ PDF</span>
            <button onclick="window.print()">🖨️ طباعة / حفظ كـ PDF الان</button>
          </div>
          <div>${elemHtml}</div>
        </body>
        </html>
      `;

      const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
      const htmlBlobUrl = URL.createObjectURL(blob);
      const win = window.open(htmlBlobUrl, '_blank');
      if (!win) {
        window.location.href = htmlBlobUrl;
      }
    } catch (e) {
      if (downloadTargetUrl) {
        window.open(downloadTargetUrl, '_blank');
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in font-sans">
        <motion.div
          initial={{ scale: 0.93, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.93, opacity: 0, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden text-right flex flex-col max-h-[92vh]"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#821315] via-[#941619] to-[#a3181b] text-white p-4 sm:p-5 flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-2xl border border-white/15">
                <CheckCircle2 className="w-6 h-6 text-emerald-300 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-base font-heading leading-tight">
                  {language === 'ar' ? 'تصدير وتنزيل استمارة الـ PDF المعتمدة' : 'Official Certified PDF Export'}
                </h3>
                <p className="text-[11px] text-slate-200 font-mono mt-0.5 truncate max-w-[280px]">
                  {filename}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              title={language === 'ar' ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal View Selector Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('download')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'download'
                  ? 'bg-white text-[#821315] shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Download className="w-4 h-4 text-[#821315]" />
              <span>{language === 'ar' ? 'خيارات التنزيل والحفظ المباشر' : 'Download & Save Options'}</span>
            </button>

            {downloadTargetUrl && (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-[#821315] shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>{language === 'ar' ? 'معاينة المستند المباشرة (A4)' : 'Live A4 Preview'}</span>
              </button>
            )}
          </div>

          {/* Body content */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
            {activeTab === 'download' ? (
              <>
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 leading-relaxed flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">📜</span>
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-emerald-900">
                      {language === 'ar' 
                        ? 'تم تجهيز الاستمارة الرسمية (A4 Landscape) بنجاح!' 
                        : 'Official Oman MOE A4 Landscape PDF prepared!'}
                    </p>
                    <p className="text-emerald-800 text-[11px]">
                      {language === 'ar' 
                        ? 'اضغط على زر التنزيل المباشر أدناه لحفظ الملف، أو استخدم زر الطباعة والحفظ كـ PDF.' 
                        : 'Click direct download below or use the Print / Save as PDF option.'}
                    </p>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="space-y-3 pt-1">
                  
                  {/* 1. Direct Server HTTP Attachment Download Button */}
                  {directUrl && (
                    <a
                      href={directUrl}
                      download={filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setDownloadAttempted(true)}
                      className="w-full py-4 px-5 bg-[#0b5e32] hover:bg-[#084826] text-white font-black text-sm rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 border-2 border-emerald-600 text-center"
                    >
                      <Download className="w-6 h-6 text-emerald-200 animate-bounce shrink-0" />
                      <div className="text-right">
                        <div className="text-sm font-black">{language === 'ar' ? '📥 تنزيل الاستمارة الآن كملف PDF معتمد (تنزيل مباشر)' : '📥 Download Certified PDF File Now'}</div>
                        <div className="text-[10px] text-emerald-100 font-normal">{language === 'ar' ? 'انقر هنا لبدء تنزيل ملف الـ PDF مباشرة لجهازك' : 'Click here to start download directly'}</div>
                      </div>
                    </a>
                  )}

                  {/* 2. Native Print & Save-as-PDF Bridge Button */}
                  <button
                    type="button"
                    onClick={handleTriggerIframePrint}
                    className="w-full py-3.5 px-5 bg-[#821315] hover:bg-[#6c1012] text-white font-black text-xs sm:text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 border border-[#a61c1e]"
                  >
                    <Printer className="w-5 h-5 text-amber-300 shrink-0" />
                    <div className="text-right">
                      <div className="font-black">{language === 'ar' ? '🖨️ طباعة / حفظ كـ PDF رسمي معتمد (عبر المتصفح)' : '🖨️ Print / Save as Official PDF (Browser Native)'}</div>
                      <div className="text-[10px] text-amber-200/90 font-normal">{language === 'ar' ? 'يفتح شاشة المتصفح المباشرة لحفظ الملف بصيغة PDF' : 'Opens native browser dialog to save directly as PDF'}</div>
                    </div>
                  </button>

                  {/* 3. Alternative Window Printable Document */}
                  <button
                    type="button"
                    onClick={handleOpenNewWindowPrint}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>{language === 'ar' ? '🌐 فتح الاستمارة في نافذة طباعة خارجية مستقلة' : '🌐 Open Standalone Printable Document Window'}</span>
                  </button>

                  {/* 4. Direct Browser Print Fallback */}
                  <button
                    type="button"
                    onClick={handleDirectWindowPrint}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl border border-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{language === 'ar' ? '📄 طباعة الصفحة الحالية مباشرة (Direct Window Print)' : '📄 Print Current Page directly'}</span>
                  </button>
                </div>

                {downloadAttempted && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p>
                      {language === 'ar' 
                        ? 'تم إرسال أمر التنزيل إلى جهازك. إذا لم يبدأ التنزيل تلقائياً، يمكنك النقر على خيار "طباعة / حفظ كـ PDF" واختيار (Save as PDF).' 
                        : 'Download initiated. If not triggered automatically, click Print / Save as PDF.'}
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-[11px] text-slate-600 leading-relaxed font-sans space-y-1">
                  <p className="font-bold text-slate-800">
                    💡 {language === 'ar' ? 'خطوات حفظ الاستمارة كملف PDF على جهازك:' : 'How to save as PDF file:'}
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-500 pr-1">
                    <li>{language === 'ar' ? 'اضغط زر "تنزيل الاستمارة الآن كملف PDF" الأخضر بالأعلى.' : 'Click the green direct download button above.'}</li>
                    <li>{language === 'ar' ? 'أو اضغط زر "طباعة / حفظ كـ PDF رسمي معتمد" واختر الوجهة: "حفظ بتنسيق PDF" (Save as PDF).' : 'Or click Print / Save as PDF and select Destination: Save as PDF.'}</li>
                    <li>{language === 'ar' ? 'اختر الاتجاه الأفقي (Landscape) واضغط حفظ.' : 'Ensure orientation is Landscape and click Save.'}</li>
                  </ol>
                </div>
              </>
            ) : (
              /* Live Preview iframe viewport */
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
                  <span>{language === 'ar' ? 'معاينة المستند المولد:' : 'Generated Document Preview:'}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">A4 Landscape</span>
                </div>
                <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-900 shadow-inner h-[380px]">
                  <iframe 
                    src={downloadTargetUrl} 
                    className="w-full h-full border-none bg-white"
                    title="PDF Live Preview"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex justify-between items-center shrink-0">
            <span className="text-[11px] text-slate-400 font-mono">
              OMAN MOE 2025/2026
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
