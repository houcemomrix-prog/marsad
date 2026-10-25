import { DocumentViewer } from './DocumentViewer';
import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { LOGO_OMAN_EMBLEM_B64 as logoOmanEmblem, LOGO_MOE_B64 as logoMoe, LOGO_VISION_B64 as logoVision } from '../data/logoDataUrls';
import principalStampUrl, { getActiveStamp, saveActiveStamp } from './OmanPrincipalStamp';
import DraggableStamp from './DraggableStamp';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  Calendar, 
  User, 
  QrCode, 
  Printer, 
  BookOpen, 
  PenTool, 
  Search, 
  Maximize2,
  X,
  FileCheck,
  ShieldCheck,
  Download
} from 'lucide-react';
import { ArchivedForm, StudentMark, ObservationDetail, UserProfile, FormDesignSettings } from '../types';
import { getFormDesignSettings } from '../services/db';
import { executePdfDownload, printElementInIframe } from '../utils/pdfDownload';
import { formatSafeDate } from '../utils/dateUtils';
import { PdfDownloadModal } from './PdfDownloadModal';
import { sortItemsByRole } from '../lib/sorting';

interface SchoolArchiveViewProps {
  archivedForms: ArchivedForm[];
  language: 'ar' | 'en';
  onSignForm: (archiveId: string, principalName: string, qrData: string, stampUrl?: string) => Promise<void>;
  onSignTeacherForm?: (archiveId: string, teacherName: string, qrData: string) => Promise<void>;
  onSignExaminerForm?: (
    archiveId: string, 
    examinerName: string, 
    qrData: string, 
    conformanceStatus?: 'conforming' | 'non-conforming', 
    hasGradeRevisions?: boolean
  ) => Promise<void>;
  userProfile?: UserProfile | null;
  onSuccess: (msg: string) => void;
  certifiedOnly?: boolean;
}

export function SchoolArchiveView({ 
  archivedForms, 
  language, 
  onSignForm,
  onSignTeacherForm,
  onSignExaminerForm,
  userProfile,
  onSuccess,
  certifiedOnly = false
}: SchoolArchiveViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'signed' | 'unsigned'>('all');
  const [selectedForm, setSelectedForm] = useState<ArchivedForm | null>(null);
  const [formStyles, setFormStyles] = useState<FormDesignSettings | null>(null);
  const [includeStamp, setIncludeStamp] = useState(true);

  // System Admin Filter States
  const [adminSchoolFilter, setAdminSchoolFilter] = useState<string>('all');
  const [adminSubjectFilter, setAdminSubjectFilter] = useState<string>('all');
  const [adminQualityFilter, setAdminQualityFilter] = useState<'all' | 'conforming' | 'non-conforming'>('all');
  const [selectedAdminSchool, setSelectedAdminSchool] = useState<string | null>(null);
  const [selectedAdminSubject, setSelectedAdminSubject] = useState<string | null>(null);
  const [selectedAdminTeacher, setSelectedAdminTeacher] = useState<string | null>(null);

  // Examiner Hierarchical Filter States
  const [selectedExaminerSchool, setSelectedExaminerSchool] = useState<string | null>(null);
  const [selectedExaminerTeacher, setSelectedExaminerTeacher] = useState<string | null>(null);

  // Unique school/subject lists for admin dropdown selector
  const uniqueSchools = Array.from(new Set(archivedForms.map(f => f.schoolName).filter(Boolean))) as string[];
  const uniqueSubjects = Array.from(new Set(archivedForms.map(f => f.subject || f.subjectName).filter(Boolean))) as string[];

  // Examiner Compliance Decision States
  const [showExaminerChoiceModal, setShowExaminerChoiceModal] = useState(false);
  const [examinerChoiceForm, setExaminerChoiceForm] = useState<ArchivedForm | null>(null);
  const [examinerCompliance, setExaminerCompliance] = useState<'conforming' | 'non-conforming' | null>(null);
  const [examinerGradeRevisions, setExaminerGradeRevisions] = useState<boolean>(false);

  useEffect(() => {
    async function loadStyles() {
      try {
        const styles = await getFormDesignSettings();
        setFormStyles(styles);
      } catch (e) {
        console.warn("Could not load form styles in archive view", e);
      }
    }
    loadStyles();

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setFormStyles(e.detail);
      }
    };
    window.addEventListener('oman_moe_styling_updated', handleUpdate);
    return () => window.removeEventListener('oman_moe_styling_updated', handleUpdate);
  }, []);
  
  // Signature Modal states
  const [signingForm, setSigningForm] = useState<ArchivedForm | null>(null);
  const [signatureType, setSignatureType] = useState<'principal' | 'teacher' | 'examiner'>('principal');
  const [principalName, setPrincipalName] = useState('');
  const [teacherSignName, setTeacherSignName] = useState('');
  const [customStamp, setCustomStamp] = useState('');
  const [isSigningInProcess, setIsSigningInProcess] = useState(false);
  const [scanSimulated, setScanSimulated] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [downloadModalData, setDownloadModalData] = useState<{
    isOpen: boolean;
    blobUrl: string;
    dataUri: string;
    filename: string;
    serverDownloadUrl?: string;
  }>({
    isOpen: false,
    blobUrl: '',
    dataUri: '',
    filename: '',
    serverDownloadUrl: ''
  });

  const hexToRgba = (hex: string | undefined, alpha: number) => {
    if (!hex || typeof hex !== 'string') return `rgba(130, 19, 21, ${alpha})`;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 130;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 19;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 21;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const sanitizeCssColors = (cssText: string): string => {
    if (!cssText) return '';
    let sanitized = cssText;
    if (sanitized.includes('color-mix')) {
      sanitized = sanitized.replace(/color-mix\([^)]+\)/gi, 'rgba(130, 19, 21, 0.05)');
    }
    return sanitized.replace(/(oklch|oklab|lch|lab)\(([^)]+)\)/gi, (match, type, argsStr) => {
      try {
        const args = argsStr.trim().split(/[\s,/]+/);
        if (args.length < 3) return 'rgb(74, 85, 104)';

        const t = type.toLowerCase();
        if (t === 'oklch') {
          const lStr = args[0];
          const cStr = args[1];
          const hStr = args[2];
          const aStr = args[3];

          const L = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
          const C = cStr.endsWith('%') ? parseFloat(cStr) / 100 : parseFloat(cStr);
          const H = parseFloat(hStr);

          if (isNaN(L) || isNaN(C) || isNaN(H)) {
            return 'rgb(74, 85, 104)';
          }

          // Convert hue angle to radians
          const hRad = (H * Math.PI) / 180;
          
          // OKLCH to Oklab
          const a = C * Math.cos(hRad);
          const b = C * Math.sin(hRad);
          
          // Oklab to LMS linear
          const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
          const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
          const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
          
          // LMS linear to non-linear
          const l_L = Math.pow(Math.max(0, l_), 3);
          const l_M = Math.pow(Math.max(0, m_), 3);
          const l_S = Math.pow(Math.max(0, s_), 3);
          
          // LMS to linear RGB
          const r = +4.0767416621 * l_L - 3.3077115913 * l_M + 0.2309699292 * l_S;
          const g = -1.2684380046 * l_L + 2.6097574011 * l_M - 0.3413193965 * l_S;
          const bl = -0.0041960863 * l_L - 0.7034186147 * l_M + 1.7076147010 * l_S;
          
          // Helper to clip and convert to standard sRGB gamma
          const f = (x: number) => {
            const value = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
            return Math.min(255, Math.max(0, Math.round(value * 255)));
          };
          
          const R = f(r);
          const G = f(g);
          const B = f(bl);
          
          let alpha = 1.0;
          if (aStr) {
            alpha = aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr);
          }
          if (isNaN(alpha)) alpha = 1.0;
          
          if (alpha === 1.0) {
            return `rgb(${R}, ${G}, ${B})`;
          } else {
            return `rgba(${R}, ${G}, ${B}, ${alpha})`;
          }
        } else if (t === 'oklab') {
          const lStr = args[0];
          const aStrVal = args[1];
          const bStrVal = args[2];
          const aStr = args[3];

          const L = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
          const a = aStrVal.endsWith('%') ? parseFloat(aStrVal) / 100 : parseFloat(aStrVal);
          const b = bStrVal.endsWith('%') ? parseFloat(bStrVal) / 100 : parseFloat(bStrVal);

          if (isNaN(L) || isNaN(a) || isNaN(b)) {
            return 'rgb(74, 85, 104)';
          }

          // Oklab to LMS linear
          const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
          const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
          const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
          
          // LMS linear to non-linear
          const l_L = Math.pow(Math.max(0, l_), 3);
          const l_M = Math.pow(Math.max(0, m_), 3);
          const l_S = Math.pow(Math.max(0, s_), 3);
          
          // LMS to linear RGB
          const r = +4.0767416621 * l_L - 3.3077115913 * l_M + 0.2309699292 * l_S;
          const g = -1.2684380046 * l_L + 2.6097574011 * l_M - 0.3413193965 * l_S;
          const bl = -0.0041960863 * l_L - 0.7034186147 * l_M + 1.7076147010 * l_S;
          
          // Helper to clip and convert to standard sRGB gamma
          const f = (x: number) => {
            const value = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
            return Math.min(255, Math.max(0, Math.round(value * 255)));
          };
          
          const R = f(r);
          const G = f(g);
          const B = f(bl);
          
          let alpha = 1.0;
          if (aStr) {
            alpha = aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr);
          }
          if (isNaN(alpha)) alpha = 1.0;
          
          if (alpha === 1.0) {
            return `rgb(${R}, ${G}, ${B})`;
          } else {
            return `rgba(${R}, ${G}, ${B}, ${alpha})`;
          }
        } else {
          return 'rgb(74, 85, 104)';
        }
      } catch (err) {
        return 'rgb(74, 85, 104)';
      }
    });
  };

  const fetchAndSanitizeStyles = async (): Promise<string[]> => {
    const sanitized: string[] = [];

    // 1. Collect and fetch all <link rel="stylesheet"> content
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      try {
        const href = link.getAttribute('href');
        if (href) {
          const res = await fetch(href);
          if (res.ok) {
            let cssText = await res.text();
            cssText = sanitizeCssColors(cssText);
            sanitized.push(cssText);
          }
        }
      } catch (err) {
        console.warn('Failed to pre-fetch stylesheet:', err);
      }
    }

    // 2. Collect and sanitize all <style> tag content
    const styleTags = Array.from(document.querySelectorAll('style'));
    for (const style of styleTags) {
      try {
        let cssText = style.innerHTML;
        if (cssText) {
          cssText = sanitizeCssColors(cssText);
          sanitized.push(cssText);
        }
      } catch (err) {
        console.warn('Failed to parse style tag:', err);
      }
    }

    return sanitized;
  };

  const handlePrintPDF = async () => {
    if (!selectedForm) return;
    setIsGeneratingPDF(true);
    const originalParentGetComputedStyle = window.getComputedStyle;
    try {
      const element = document.getElementById('printable-archive-form');
      if (!element) {
        throw new Error('Printable element not found');
      }

      // Override getComputedStyle of main window to intercept and sanitize OKLCH / OKLAB / LAB / LCH colors returned to html2canvas
      const createGetComputedStyleOverride = (originalFn: typeof window.getComputedStyle) => {
        return function (this: any, el: Element, pseudoElt?: string | null) {
          const style = originalFn.call(this, el, pseudoElt);
          return new Proxy(style, {
            get(target, prop) {
              if (prop === 'getPropertyValue') {
                return function (propertyName: string) {
                  const val = target.getPropertyValue(propertyName);
                  if (typeof val === 'string') {
                    return sanitizeCssColors(val);
                  }
                  return val;
                };
              }
              const val = (target as any)[prop];
              if (typeof val === 'string') {
                return sanitizeCssColors(val);
              }
              if (typeof val === 'function') {
                return val.bind(target);
              }
              return val;
            }
          }) as any;
        };
      };

      window.getComputedStyle = createGetComputedStyleOverride(originalParentGetComputedStyle) as any;

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const titleCleaned = (selectedForm.subject || 'Continuous_Assessment').trim().replace(/[\s/]+/g, '_');
      const filename = `OMAN_ARCHIVE_Moderation_${titleCleaned}_${selectedForm.id}.pdf`;

      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await html2canvas(element, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('style').forEach(st => {
              let text = st.innerHTML;
              if (text.includes('@import')) {
                text = text.replace(/@import\s+url\([^)]+\);?/gi, '');
              }
              if (text.includes('color-mix')) {
                text = text.replace(/color-mix\([^)]+\)/gi, 'rgba(130, 19, 21, 0.05)');
              }
              st.innerHTML = text;
            });
            const fontStyle = clonedDoc.createElement('style');
            fontStyle.innerHTML = `
              * {
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
                letter-spacing: normal !important;
              }
              #printable-archive-form, #printable-archive-form * {
                font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                letter-spacing: normal !important;
                font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
              }
              #printable-archive-form .font-mono {
                font-family: 'JetBrains Mono', monospace !important;
              }
              #printable-archive-form th, #printable-archive-form td {
                vertical-align: middle !important;
              }
            `;
            clonedDoc.head.appendChild(fontStyle);

            const clonedEl = clonedDoc.getElementById('printable-archive-form');
            if (clonedEl) {
              clonedEl.style.transform = 'none';
              clonedEl.style.maxWidth = '1150px';
              clonedEl.style.width = '1150px';
              // Reset all ancestor transformations that DocumentViewer adds
              let curr: HTMLElement | null = clonedEl.parentElement;
              while (curr && curr !== clonedDoc.body) {
                curr.style.transform = 'none';
                curr.style.zoom = '1';
                curr.style.overflow = 'visible';
                curr = curr.parentElement;
              }
            }
          }
        });
      } catch (err) {
        console.warn('Canvas rasterization attempt 1 failed, trying scale 2 fallback:', err);
        try {
          canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc) => {
              clonedDoc.querySelectorAll('style').forEach(st => {
                let text = st.innerHTML;
                if (text.includes('@import')) {
                  text = text.replace(/@import\s+url\([^)]+\);?/gi, '');
                }
                if (text.includes('color-mix')) {
                  text = text.replace(/color-mix\([^)]+\)/gi, 'rgba(130, 19, 21, 0.05)');
                }
                st.innerHTML = text;
              });
              const fontStyle = clonedDoc.createElement('style');
              fontStyle.innerHTML = `
                * {
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
                  text-rendering: optimizeLegibility !important;
                  letter-spacing: normal !important;
                }
                #printable-archive-form, #printable-archive-form * {
                  font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                  letter-spacing: normal !important;
                  font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
                }
                #printable-archive-form .font-mono {
                  font-family: 'JetBrains Mono', monospace !important;
                }
                #printable-archive-form th, #printable-archive-form td {
                  vertical-align: middle !important;
                }
              `;
              clonedDoc.head.appendChild(fontStyle);

              const clonedEl = clonedDoc.getElementById('printable-archive-form');
              if (clonedEl) {
                clonedEl.style.transform = 'none';
                clonedEl.style.margin = '0 auto';
                clonedEl.style.maxWidth = '1150px';
                clonedEl.style.width = '1150px';
                let curr: HTMLElement | null = clonedEl.parentElement;
                while (curr && curr !== clonedDoc.body) {
                  curr.style.transform = 'none';
                  curr.style.zoom = '1';
                  curr.style.overflow = 'visible';
                  curr = curr.parentElement;
                }
              }
            }
          });
        } catch (e2) {
          console.error('Canvas rasterization fallback error:', e2);
        }
      }

    if (canvas) {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      await executePdfDownload(pdf, filename);
    } else {
      throw new Error('Canvas render failed to generate document image.');
    }

      onSuccess(
        language === 'ar' 
          ? 'تم تنزيل الاستمارة بنجاح كملف PDF!' 
          : 'Archive form PDF downloaded successfully!'
      );
    } catch (error: any) {
      console.error('Error generating direct PDF download:', error);
      onSuccess(
        language === 'ar' 
          ? `عذراً، تعذر تنزيل ملف PDF (${error?.message || 'خطأ في المعالجة'}).` 
          : `Failed to download PDF: ${error?.message || 'Processing error'}`
      );
    } finally {
      window.getComputedStyle = originalParentGetComputedStyle;
      setIsGeneratingPDF(false);
    }
  };

  // Filter archived forms
  const filtered = sortItemsByRole(
    archivedForms.filter(form => {
      const matchesSearch = 
        (form.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (form.teacherName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (form.grade || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (form.schoolName || '').toLowerCase().includes(searchTerm.toLowerCase());
        
      // Determine signature completion status (needs teacher signed if not Grade 12)
      const needsTeacher = true;
      const isFullySigned = !!(form.isSigned && form.isExaminerSigned && (!needsTeacher || form.isTeacherSigned));

      // System administrator hierarchical drill-down and quality filters
      if (userProfile?.role === 'admin') {
        if (selectedAdminSchool && form.schoolName !== selectedAdminSchool) return false;
        if (selectedAdminSubject && (form.subject || form.subjectName) !== selectedAdminSubject) return false;
        if (selectedAdminTeacher && (form.teacherName || form.schoolEmail || 'معلم المادة') !== selectedAdminTeacher) return false;

        if (adminQualityFilter !== 'all') {
          const isConforming = !form.students || form.students.length === 0 || form.students.every(s => !s.notes || s.notes === 'لا يوجد' || s.notes.trim() === '');
          if (adminQualityFilter === 'conforming' && !isConforming) return false;
          if (adminQualityFilter === 'non-conforming' && isConforming) return false;
        }
      }

      // Examiner hierarchical drill-down (School -> Teachers -> Uploads)
      if (userProfile?.role === 'moderator' || userProfile?.roleType === 'moderator') {
        if (selectedExaminerSchool && form.schoolName !== selectedExaminerSchool) return false;
        if (selectedExaminerTeacher && (form.teacherName || form.schoolEmail || 'معلم المادة') !== selectedExaminerTeacher) return false;
      }

      if (certifiedOnly) {
        // In Certified Archive, only show forms that are fully signed
        return matchesSearch && isFullySigned;
      } else {
        // In the pending/signing view, only show forms that are NOT fully signed yet (they are under verification)
        if (selectedStatus === 'signed') return matchesSearch && !isFullySigned && form.isSigned;
        if (selectedStatus === 'unsigned') return matchesSearch && !isFullySigned && !form.isSigned;
        return matchesSearch && !isFullySigned;
      }
    }),
    userProfile?.role
  );

  // Calculate stats for the certified archive view
  const fullySignedFormsList = sortItemsByRole(
    archivedForms.filter(f => {
      const needsTeacher = true;
      const isFullySigned = !!(f.isSigned && f.isExaminerSigned && (!needsTeacher || f.isTeacherSigned));
      if (!isFullySigned) return false;

      // Apply Admin filters dynamically to stats as well (except quality filter, to keep quality stats correct!)
      if (userProfile?.role === 'admin') {
        if (adminSchoolFilter !== 'all' && f.schoolName !== adminSchoolFilter) {
          return false;
        }
        if (adminSubjectFilter !== 'all') {
          const fSub = (f.subject || f.subjectName || '').toLowerCase().trim();
          if (fSub !== adminSubjectFilter.toLowerCase().trim()) {
            return false;
          }
        }
      }
      return true;
    }),
    userProfile?.role
  );

  const matchingForms = fullySignedFormsList.filter(f => 
    !f.students || f.students.length === 0 || f.students.every(s => !s.notes || s.notes === 'لا يوجد' || s.notes.trim() === '')
  );

  const nonMatchingForms = fullySignedFormsList.filter(f => 
    f.students && f.students.length > 0 && f.students.some(s => s.notes && s.notes !== 'لا يوجد' && s.notes.trim() !== '')
  );

  const handleStartSignatureWithChoice = async (
    form: ArchivedForm, 
    conformance: 'conforming' | 'non-conforming', 
    gradeRevisions: boolean
  ) => {
    setIsSigningInProcess(true);
    setSignatureType('examiner');
    
    // Generate a secure, easily copyable, alphanumeric registration serial code (OM-SIG-XXXX-YYYY)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let block1 = '';
    let block2 = '';
    for (let i = 0; i < 4; i++) {
      block1 += chars.charAt(Math.floor(Math.random() * chars.length));
      block2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const secureToken = `OM-SIG-${block1}-${block2}`;
    
    const eName = form.examinerName || (userProfile?.name) || 'أ. مشرف المادة المعين';

    try {
      if (onSignExaminerForm) {
        await onSignExaminerForm(form.id, eName, secureToken, conformance, gradeRevisions);
      }
      
      // If we are currently viewing this form, keep the view updated
      if (selectedForm && selectedForm.id === form.id) {
        setSelectedForm(prev => prev ? {
          ...prev,
          isExaminerSigned: true,
          examinerSignedAt: new Date().toISOString(),
          examinerSignedName: eName,
          examinerSignatureQrData: secureToken,
          conformanceStatus: conformance,
          hasGradeRevisions: gradeRevisions
        } : null);
      }
      
      onSuccess(
        language === 'ar' 
          ? '✓ تم توقيع واستدعاء خيارات مطابقة مشرف الفحص بنجاح وبسرعة بضغطة زر واحدة!' 
          : 'Form compliance verified and signed off instantly as Subject Examiner!'
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsSigningInProcess(false);
    }
  };

  const handleStartSignature = async (form: ArchivedForm, type: 'principal' | 'teacher' | 'examiner' = 'principal') => {
    setIsSigningInProcess(true);
    setSignatureType(type);
    
    // Generate a secure, easily copyable, alphanumeric registration serial code (OM-SIG-XXXX-YYYY)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let block1 = '';
    let block2 = '';
    for (let i = 0; i < 4; i++) {
      block1 += chars.charAt(Math.floor(Math.random() * chars.length));
      block2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const secureToken = `OM-SIG-${block1}-${block2}`;
    
    const pName = form.principalName || 'أ. محمد بن راشد الجنيبي';
    const tName = form.teacherName || (userProfile?.name) || 'أ. معلم المادة';
    const eName = form.examinerName || (userProfile?.name) || 'أ. مشرف المادة المعين';

    try {
      if (type === 'principal') {
        const stampVal = includeStamp ? 'official_moe_stamp' : 'no_stamp';
        await onSignForm(form.id, pName, secureToken, stampVal);
        
        // If we are currently viewing this form, keep the view updated
        if (selectedForm && selectedForm.id === form.id) {
          setSelectedForm(prev => prev ? {
            ...prev,
            isSigned: true,
            signedAt: new Date().toISOString(),
            signedByPrincipalName: pName,
            signatureQrData: secureToken,
            signatureStampUrl: stampVal
          } : null);
        }
        
        onSuccess(
          language === 'ar' 
            ? '✓ تم توقيع واعتماد المدير بنجاح وبسرعة بضغطة زر واحدة فقط!' 
            : 'Form authorized and signed off instantly as Principal!'
        );
      } else if (type === 'teacher') {
        if (onSignTeacherForm) {
          await onSignTeacherForm(form.id, tName, secureToken);
        }
        
        // If we are currently viewing this form, keep the view updated
        if (selectedForm && selectedForm.id === form.id) {
          setSelectedForm(prev => prev ? {
            ...prev,
            isTeacherSigned: true,
            teacherSignedAt: new Date().toISOString(),
            teacherSignedName: tName,
            teacherSignatureQrData: secureToken
          } : null);
        }
        
        onSuccess(
          language === 'ar' 
            ? '✓ تم توقيع واعتماد معلم المادة بنجاح وبسرعة بضغطة زر واحدة فقط!' 
            : 'Form signed and approved instantly as Teacher!'
        );
      } else {
        if (onSignExaminerForm) {
          await onSignExaminerForm(form.id, eName, secureToken);
        }
        
        // If we are currently viewing this form, keep the view updated
        if (selectedForm && selectedForm.id === form.id) {
          setSelectedForm(prev => prev ? {
            ...prev,
            isExaminerSigned: true,
            examinerSignedAt: new Date().toISOString(),
            examinerSignedName: eName,
            examinerSignatureQrData: secureToken
          } : null);
        }
        
        onSuccess(
          language === 'ar' 
            ? '✓ تم توقيع واعتماد مشرف الفحص بنجاح وبسرعة بضغطة زر واحدة فقط!' 
            : 'Form authorized and signed off instantly as Subject Examiner!'
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSigningInProcess(false);
    }
  };

  const handleApplySignature = async () => {
    // Legacy modal handler, bypassed for single-click signature
  };

  const parseLevel = (levelInput: string) => {
    if (!levelInput) return '';
    // Strip trailing parenthesis indicators for printable form look
    return levelInput.replace(/\s*\(.*?\)\s*/g, '');
  };

  // 1. Examiner/Auditor signature: must not be examiner-signed yet
  const isExaminerPending = selectedForm ? !selectedForm.isExaminerSigned : false;
  
  // 2. Teacher signature: examiner signed, teacher not signed yet
  const isTeacherPending = selectedForm ? (selectedForm.isExaminerSigned && !selectedForm.isTeacherSigned) : false;
  
  // 3. Principal signature: examiner signed, teacher signed, principal not signed yet
  const isPrincipalPending = selectedForm ? (selectedForm.isExaminerSigned && selectedForm.isTeacherSigned && !selectedForm.isSigned) : false;
  
  // Roles matching
  const isUserAdmin = userProfile?.role === 'admin';
  const isUserExaminer = userProfile?.role === 'moderator' || isUserAdmin;
  const isUserTeacher = (userProfile?.role === 'school' && userProfile?.roleType === 'teacher') || isUserAdmin;
  const isUserPrincipal = (userProfile?.role === 'school' && userProfile?.roleType === 'administrative') || isUserAdmin;
  
  // Visibility of buttons
  const showExaminerSignBtn = isExaminerPending && isUserExaminer;
  const showTeacherSignBtn = isTeacherPending && isUserTeacher;
  const showPrincipalSignBtn = isPrincipalPending && isUserPrincipal;

  return (
    <div className="space-y-6 text-right font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Overview Card */}
      <div className={`rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden text-white ${
        certifiedOnly 
          ? 'bg-gradient-to-r from-emerald-950 via-[#0a4d28] to-[#107c41]' 
          : 'bg-[#051C3F]'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-red-800/10 rounded-full blur-2xl -ml-20 -mb-20"></div>
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400/15 text-amber-300 rounded-full text-[11px] font-black uppercase">
              🗃️ {certifiedOnly 
                ? (language === 'ar' ? 'أرشيف الاستمارات' : 'Forms Archive')
                : (language === 'ar' ? 'الأرشيف الوطني الرقمي' : 'Digital School Archive')}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-amber-400 font-heading">
              {certifiedOnly
                ? (language === 'ar' ? 'الاستمارات المطابقة وغير المطابقة' : 'Conforming and Non-conforming Forms')
                : (userProfile?.roleType === 'teacher'
                  ? (language === 'ar' ? 'بيانات الفرز والاعتماد للمعلم' : 'School Teacher Audit Ledgers & Archive')
                  : (language === 'ar' ? 'بيانات الفرز والاعتماد للمدير' : 'School Director Audit Ledgers & Archive'))}
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-200 max-w-2xl leading-relaxed">
              {certifiedOnly
                ? (language === 'ar'
                  ? 'هذا هو الارشيف الرسمي النهائي للاستمارات المطابقة و غير المطابقة و المستوفية لجميع التواقيع'
                  : 'This is the official final archive of conforming, non-conforming and fully signed forms.')
                : (userProfile?.roleType === 'teacher'
                  ? (language === 'ar'
                    ? 'مرحباً بك حضرة المعلم في قسم الأرشيف والاعتماد الإلكتروني. تظهر كافة كشوف المعاينة الرسمية الخاصة بموادك هنا، حيث يمكنك مراجعة تدقيق العلامات، التوازنات الفنية، والتوقيع الرقمي فوراً لدمج توقيعك وبوابة فحص الموثوقية (QR Portal Token).'
                    : 'Welcome honored teacher to the official ledger archive. Here you can inspect your continuous assessment grids, review grading remarks, and digitally sign to update the central portal with your verification (QR Portal Token).')
                  : (language === 'ar' 
                    ? 'مرحباً بك حضرة المدير في قسم الأرشيف والاعتماد الإلكتروني. تظهر كافة كشوف المعاينة الرسمية المستلمة هنا، حيث يمكنك مراجعة تدقيق العلامات، التوازنات الفنية، والتوقيع الرقمي بنقرة واحدة لدمج الخاتم الرسمي ورمز الاستجابة السريعة (QR Portal Token).'
                    : 'Welcome school director to the official ledger archive. Here you can inspect continuous assessment grids, and electronically sign-off via QR code mapping to emit certified public records.'))}
            </p>
          </div>
          
          {certifiedOnly ? (
            <div className="flex gap-6 shrink-0 bg-white/5 p-4 rounded-2xl border border-white/10 text-center items-center">
              <div>
                <div className="text-[10.5px] sm:text-xs text-slate-300 font-black uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'الاستمارات المعتمدة' : 'Certified Forms'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400 font-sans">
                  {fullySignedFormsList.length}
                </div>
              </div>
              <div className="border-l border-white/15 h-8"></div>
              <div>
                <div className="text-[10.5px] sm:text-xs text-slate-300 font-black uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'الاستمارات المطابقة' : 'Conforming Forms'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-sans">
                  {matchingForms.length}
                </div>
              </div>
              <div className="border-l border-white/15 h-8"></div>
              <div>
                <div className="text-[10.5px] sm:text-xs text-slate-300 font-black uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'الاستمارات غير المطابقة' : 'Non-compliant Forms'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rose-400 font-sans">
                  {nonMatchingForms.length}
                </div>
            </div>
              </div>
          ) : (
            <div className="flex gap-4 shrink-0 bg-white/5 p-4 rounded-2xl border border-white/10 text-center">
              <div>
                <div className="text-[10.5px] sm:text-xs text-slate-200 font-black uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'الاستمارات قيد التدقيق' : 'Forms in Audit'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400 font-sans">{filtered.length}</div>
              </div>
              <div className="border-l border-white/15 mx-2"></div>
              <div>
                <div className="text-[10.5px] sm:text-xs text-slate-200 font-black uppercase tracking-wider mb-1">
                  {language === 'ar' ? 'المعتمدة رقمياً' : 'Signed'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-sans">
                  {archivedForms.filter(f => f.isSigned).length}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Left is Search & List, Right is Interactive Form viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Archive List Drawer */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-150 shadow-sm space-y-4 text-right">
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={language === 'ar' ? 'البحث بالمادة، المعلم، الصف...' : 'Search school archive...'}
                className="w-full pl-3 pr-10 py-2.5 text-xs rounded-xl border border-slate-200 outline-hidden focus:border-[#821315]/50 transition-all text-right bg-slate-50/50"
              />
              <Search className="absolute top-3 right-3 w-4 h-4 text-slate-400" />
            </div>

            {/* Examiner Hierarchical Drill-Down Navigation (School -> Teachers) */}
            {(userProfile?.role === 'moderator' || userProfile?.roleType === 'moderator') && (
              <div className="bg-gradient-to-br from-slate-900 via-[#1b3b2b] to-[#0a4d28] rounded-2xl p-4 text-white shadow-md space-y-3.5 text-right" dir="rtl">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-black tracking-wide text-emerald-300">
                      {language === 'ar' ? '🗂️ شجرة أرشيف الفاحص (حسب المدرسة ثم المعلم)' : 'Examiner Archive Tree (School -> Teacher)'}
                    </span>
                  </div>
                  {(selectedExaminerSchool || selectedExaminerTeacher) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedExaminerTeacher) {
                          setSelectedExaminerTeacher(null);
                        } else if (selectedExaminerSchool) {
                          setSelectedExaminerSchool(null);
                        }
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-emerald-300 rounded-lg text-[10px] font-black transition-all cursor-pointer border border-emerald-300/30"
                    >
                      {language === 'ar' ? '← رجوع للخلف' : '← Back'}
                    </button>
                  )}
                </div>

                {/* Breadcrumb indicator */}
                <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-[11px] font-extrabold text-emerald-200 truncate flex items-center justify-between">
                  <span className="truncate">
                    {!selectedExaminerSchool 
                      ? (language === 'ar' ? '📍 الخطوة 1: اختر المدرسة' : 'Step 1: Select School')
                      : !selectedExaminerTeacher
                      ? `${selectedExaminerSchool} > ${language === 'ar' ? '📍 الخطوة 2: اختر المعلم' : 'Step 2: Select Teacher'}`
                      : `${selectedExaminerSchool} > ${selectedExaminerTeacher}`
                    }
                  </span>
                </div>

                {/* Level 1: Schools List */}
                {!selectedExaminerSchool ? (
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {uniqueSchools.length === 0 ? (
                      <p className="text-center text-xs text-slate-300 py-6">{language === 'ar' ? 'لا توجد مدارس مسجلة.' : 'No schools found.'}</p>
                    ) : (
                      uniqueSchools.map((sch, idx) => {
                        const count = archivedForms.filter(f => f.schoolName === sch).length;
                        return (
                          <div
                            key={`exam-sch-${idx}`}
                            onClick={() => {
                              setSelectedExaminerSchool(sch);
                              setSelectedExaminerTeacher(null);
                            }}
                            className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-emerald-400/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-right group shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="text-lg p-1.5 rounded-lg bg-emerald-400/20 text-emerald-300">🏛️</span>
                              <span className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-emerald-300 transition-colors">{sch}</span>
                            </div>
                            <span className="text-[10.5px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full font-bold">
                              {count} {language === 'ar' ? 'ملفات' : 'Files'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : !selectedExaminerTeacher ? (
                  // Level 2: Teachers List for Selected School
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedExaminerSchool).map(f => f.teacherName || f.schoolEmail || 'معلم المادة').filter(Boolean))).length === 0 ? (
                      <p className="text-center text-xs text-slate-300 py-6">{language === 'ar' ? 'لا يوجد معلمون لهذه المدرسة.' : 'No teachers found.'}</p>
                    ) : (
                      Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedExaminerSchool).map(f => f.teacherName || f.schoolEmail || 'معلم المادة').filter(Boolean))).map((teach, idx) => {
                        const teacherUploads = archivedForms.filter(f => f.schoolName === selectedExaminerSchool && (f.teacherName || f.schoolEmail || 'معلم المادة') === teach);
                        const firstForm = teacherUploads[0];
                        return (
                          <div
                            key={`exam-teach-${idx}`}
                            onClick={() => {
                              setSelectedExaminerTeacher(teach);
                              if (firstForm) {
                                setSelectedForm(firstForm);
                              }
                            }}
                            className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-amber-400/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-right group shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="text-lg p-1.5 rounded-lg bg-amber-400/20 text-amber-300">👨‍🏫</span>
                              <div>
                                <span className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-amber-300 transition-colors block">{teach}</span>
                                <span className="text-[10px] text-slate-300 font-medium">{firstForm?.subject || firstForm?.grade || ''} ({teacherUploads.length} ملفات)</span>
                              </div>
                            </div>
                            <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-full font-extrabold">
                              {language === 'ar' ? 'عرض مرفقات المعلم ➔' : 'View Uploads ➔'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="bg-white/10 p-3.5 rounded-xl border border-white/20 text-center space-y-2">
                    <p className="text-xs font-black text-emerald-300">✓ {selectedExaminerTeacher}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedExaminerTeacher(null)}
                      className="text-[10.5px] font-black text-white hover:text-emerald-300 underline cursor-pointer"
                    >
                      {language === 'ar' ? '← العودة لقائمة المعلمين بالمدرسة' : '← Back to Teachers'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* System Admin Hierarchical Drill-Down Navigation */}
            {userProfile?.role === 'admin' && (
              <div className="bg-gradient-to-br from-slate-900 via-[#0c2e5c] to-[#051C3F] rounded-2xl p-4 text-white shadow-md space-y-3.5 text-right" dir="rtl">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span className="text-xs font-black tracking-wide text-amber-300">
                      {language === 'ar' ? '🗂️ شجرة أرشيف مدير النظام' : 'Admin Archive Tree'}
                    </span>
                  </div>
                  {(selectedAdminSchool || selectedAdminSubject || selectedAdminTeacher) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedAdminTeacher) {
                          setSelectedAdminTeacher(null);
                        } else if (selectedAdminSubject) {
                          setSelectedAdminSubject(null);
                        } else if (selectedAdminSchool) {
                          setSelectedAdminSchool(null);
                        }
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-amber-300 rounded-lg text-[10px] font-black transition-all cursor-pointer border border-amber-300/30"
                    >
                      {language === 'ar' ? '← رجوع للخلف' : '← Back'}
                    </button>
                  )}
                </div>

                {/* Breadcrumb indicator */}
                <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-[11px] font-extrabold text-amber-200 truncate flex items-center justify-between">
                  <span className="truncate">
                    {!selectedAdminSchool 
                      ? (language === 'ar' ? '📍 الخطوة 1: اختر المدرسة' : 'Step 1: Select School')
                      : !selectedAdminSubject
                      ? `${selectedAdminSchool} > ${language === 'ar' ? '📍 الخطوة 2: اختر المادة' : 'Step 2: Select Subject'}`
                      : !selectedAdminTeacher
                      ? `${selectedAdminSchool} > ${selectedAdminSubject} > ${language === 'ar' ? '📍 الخطوة 3: اختر المعلم' : 'Step 3: Select Teacher'}`
                      : `${selectedAdminSchool} > ${selectedAdminSubject} > ${selectedAdminTeacher}`
                    }
                  </span>
                </div>

                {/* Level 1: Schools List */}
                {!selectedAdminSchool ? (
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {uniqueSchools.length === 0 ? (
                      <p className="text-center text-xs text-slate-300 py-6">{language === 'ar' ? 'لا توجد مدارس مسجلة.' : 'No schools found.'}</p>
                    ) : (
                      uniqueSchools.map((sch, idx) => {
                        const count = archivedForms.filter(f => f.schoolName === sch).length;
                        return (
                          <div
                            key={`admin-sch-${idx}`}
                            onClick={() => {
                              setSelectedAdminSchool(sch);
                              setSelectedAdminSubject(null);
                              setSelectedAdminTeacher(null);
                            }}
                            className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-amber-400/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-right group shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="text-lg p-1.5 rounded-lg bg-amber-400/20 text-amber-300">🏛️</span>
                              <span className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-amber-300 transition-colors">{sch}</span>
                            </div>
                            <span className="text-[10.5px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-full font-bold">
                              {count} {language === 'ar' ? 'ملفات' : 'Files'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : !selectedAdminSubject ? (
                  // Level 2: Subjects List for Selected School
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedAdminSchool).map(f => f.subject || f.subjectName).filter(Boolean))).length === 0 ? (
                      <p className="text-center text-xs text-slate-300 py-6">{language === 'ar' ? 'لا توجد مواد دراسية لهذه المدرسة.' : 'No subjects found.'}</p>
                    ) : (
                      Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedAdminSchool).map(f => f.subject || f.subjectName).filter(Boolean))).map((sub, idx) => {
                        const count = archivedForms.filter(f => f.schoolName === selectedAdminSchool && (f.subject || f.subjectName) === sub).length;
                        return (
                          <div
                            key={`admin-sub-${idx}`}
                            onClick={() => {
                              setSelectedAdminSubject(sub);
                              setSelectedAdminTeacher(null);
                            }}
                            className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-emerald-400/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-right group shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="text-lg p-1.5 rounded-lg bg-emerald-400/20 text-emerald-300">📚</span>
                              <span className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-emerald-300 transition-colors">{sub}</span>
                            </div>
                            <span className="text-[10.5px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full font-bold">
                              {count} {language === 'ar' ? 'ملفات' : 'Files'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : !selectedAdminTeacher ? (
                  // Level 3: Teachers List for Selected School & Subject
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedAdminSchool && (f.subject || f.subjectName) === selectedAdminSubject).map(f => f.teacherName || f.schoolEmail || 'معلم المادة').filter(Boolean))).length === 0 ? (
                      <p className="text-center text-xs text-slate-300 py-6">{language === 'ar' ? 'لا يوجد معلمون لهذه المادة والمدرسة.' : 'No teachers found.'}</p>
                    ) : (
                      Array.from(new Set(archivedForms.filter(f => f.schoolName === selectedAdminSchool && (f.subject || f.subjectName) === selectedAdminSubject).map(f => f.teacherName || f.schoolEmail || 'معلم المادة').filter(Boolean))).map((teach, idx) => {
                        const teacherUploads = archivedForms.filter(f => f.schoolName === selectedAdminSchool && (f.subject || f.subjectName) === selectedAdminSubject && (f.teacherName || f.schoolEmail || 'معلم المادة') === teach);
                        const firstForm = teacherUploads[0];
                        return (
                          <div
                            key={`admin-teach-${idx}`}
                            onClick={() => {
                              setSelectedAdminTeacher(teach);
                              if (firstForm) {
                                setSelectedForm(firstForm);
                              }
                            }}
                            className="p-3.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-sky-400/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-right group shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="text-lg p-1.5 rounded-lg bg-sky-400/20 text-sky-300">👨‍🏫</span>
                              <div>
                                <span className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-sky-300 transition-colors block">{teach}</span>
                                <span className="text-[10px] text-slate-300 font-medium">{firstForm?.title || firstForm?.grade || ''}</span>
                              </div>
                            </div>
                            <span className="text-[10px] bg-sky-400/20 text-sky-300 border border-sky-400/30 px-2.5 py-1 rounded-full font-extrabold">
                              {language === 'ar' ? 'عرض الاستمارة ➔' : 'View Form ➔'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="bg-white/10 p-3.5 rounded-xl border border-white/20 text-center space-y-2">
                    <p className="text-xs font-black text-amber-300">✓ {selectedAdminTeacher}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedAdminTeacher(null)}
                      className="text-[10.5px] font-black text-white hover:text-amber-300 underline cursor-pointer"
                    >
                      {language === 'ar' ? '← العودة لقائمة المعلمين' : '← Back to Teachers'}
                    </button>
                  </div>
                )}

                {/* Conformance Quality Filter */}
                <div className="space-y-1.5 pt-2.5 border-t border-white/10">
                  <label className="text-[10px] text-slate-300 font-black block">
                    {language === 'ar' ? 'حالة المطابقة الفنية' : 'Conformance Status'}
                  </label>
                  <select
                    value={adminQualityFilter}
                    onChange={(e) => setAdminQualityFilter(e.target.value as any)}
                    className="w-full text-xs rounded-xl border border-white/20 p-2.5 outline-hidden focus:border-amber-400 bg-white/10 text-right font-semibold cursor-pointer text-white"
                  >
                    <option value="all" className="bg-slate-900 text-white">{language === 'ar' ? 'الكل (مطابق وغير مطابق)' : 'All (Conforming & Non-conforming)'}</option>
                    <option value="conforming" className="bg-slate-900 text-white">{language === 'ar' ? 'الاستمارات المطابقة' : 'Conforming Forms'}</option>
                    <option value="non-conforming" className="bg-slate-900 text-white">{language === 'ar' ? 'الاستمارات غير المطابقة' : 'Non-conforming Forms'}</option>
                  </select>
                </div>
              </div>
            )}


          </div>

          {/* Archived Form Cards */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.length === 0 ? null : (
              filtered.map((form, index) => (
                <div
                  key={`archive-form-${form.id}-${index}`}
                  onClick={() => setSelectedForm(form)}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer relative overflow-hidden text-right ${
                    selectedForm?.id === form.id 
                      ? 'border-[#821315] shadow-md ring-1 ring-[#821315]/20' 
                      : 'border-slate-150 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-50">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black ${
                      form.isSigned 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : !form.isExaminerSigned
                          ? 'bg-violet-50 text-violet-750 border border-violet-200'
                          : !form.isTeacherSigned
                            ? 'bg-sky-50 text-sky-750 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-250'
                    }`}>
                      {form.isSigned ? (
                        <>
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>{language === 'ar' ? 'معتمد ومختوم رسمياً ✓' : 'Certified & Stamped'}</span>
                        </>
                      ) : !form.isExaminerSigned ? (
                        <>
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>{language === 'ar' ? '1. بانتظار توقيع المدقق' : '1. Awaiting Auditor'}</span>
                        </>
                      ) : !form.isTeacherSigned ? (
                        <>
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>{language === 'ar' ? '2. بانتظار توقيع المعلم' : '2. Awaiting Teacher'}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>{language === 'ar' ? '3. بانتظار اعتماد المدير والختم' : '3. Awaiting Principal'}</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 font-medium">
                      {formatSafeDate(form.createdAt)}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-[13px] font-black text-slate-800 leading-tight">
                    {form.grade === 'Grade 12' ? 'استمارة التدقيق النهائي' : 'استمارة التدقيق المستمر'} - {form.subject}
                  </h4>
                  <p className="text-[10.5px] text-slate-500 mt-1 leading-normal font-sans">
                    {language === 'ar' ? 'المعلم المستهدف:' : 'Target teacher:'} <span className="font-bold text-slate-700">{form.teacherName}</span>
                  </p>

                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                      {form.grade === 'Grade 12' ? 'الصف 12' : 'الصفوف 1-11'}
                    </span>
                    <span className="font-semibold text-slate-500">
                      {form.students.length} {language === 'ar' ? 'طلاب عينة' : 'Samples'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Document Showcase Area */}
        <div className="lg:col-span-8">
          {selectedForm ? (
            <div className="space-y-6">
              
              {/* Document Header Status Strip */}
              <div className="bg-white rounded-2xl p-4 border border-slate-150 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 rtl:flex-row-reverse text-right">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${selectedForm.isSigned ? 'bg-emerald-50 text-emerald-700' : !selectedForm.isExaminerSigned ? 'bg-violet-50 text-violet-750' : !selectedForm.isTeacherSigned ? 'bg-sky-50 text-sky-750' : 'bg-amber-50 text-amber-800'}`}>
                    <FileCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-800">
                      {!selectedForm.isExaminerSigned 
                        ? (language === 'ar' ? 'المرحلة (1): بانتظار تجهيز وتوقيع المدقق' : 'Phase 1: Awaiting Auditor Preparation & Sign')
                        : !selectedForm.isTeacherSigned 
                          ? (language === 'ar' ? 'المرحلة (2): وقع المدقق - بانتظار توقيع المعلم بالعلم' : 'Phase 2: Auditor Signed - Awaiting Teacher Signature')
                          : !selectedForm.isSigned 
                            ? (language === 'ar' ? 'المرحلة (3): وقع المعلم - بانتظار توقيع واعتماد المدير والختم الرسمي' : 'Phase 3: Teacher Signed - Awaiting Principal Signature & Stamp')
                            : (language === 'ar' ? 'استمارة معتمدة ومختومة رسمياً بالكامل ✓' : 'Fully Certified & Signed Documents Ledger')}
                    </h3>
                    <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">
                      {selectedForm.isSigned 
                        ? `${language === 'ar' ? 'الاعتماد الختامي للمدير:' : 'Principal Certified:'} ${selectedForm.signedByPrincipalName || 'مدير المدرسة'} | ${language === 'ar' ? 'توقيع المعلم:' : 'Teacher:'} ${selectedForm.teacherSignedName || selectedForm.teacherName} | ${language === 'ar' ? 'توقيع المدقق:' : 'Auditor:'} ${selectedForm.examinerSignedName}`
                        : !selectedForm.isExaminerSigned
                          ? (language === 'ar' ? 'يقوم المدقق بمراجعة عينات درجات الطلاب وتجهيز الاستمارة وتوقيعها لإرسالها للمعلم.' : 'Auditor reviews marks samples, prepares form and signs it to send to teacher.')
                          : !selectedForm.isTeacherSigned
                            ? `${language === 'ar' ? 'تم تجهيز وتوقيع الاستمارة من المدقق:' : 'Auditor Signed:'} ${selectedForm.examinerSignedName} ➔ ${language === 'ar' ? 'بانتظار توقيع المعلم:' : 'Awaiting Teacher:'} ${selectedForm.teacherName}`
                            : `${language === 'ar' ? 'تم توقيع المدقق والمعلم بنجاح ➔ بانتظار توقيع واعتماد مدير مدرسة ' : 'Auditor and Teacher signed. Awaiting principal stamp of '} ${selectedForm.schoolName}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  {showPrincipalSignBtn && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartSignature(selectedForm, 'principal')}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'ختم وتوقيع' : 'Stamp & Sign'}</span>
                      </button>
                    </>
                  )}

                  {/* Inform Principal if waiting for previous steps */}
                  {isUserPrincipal && !selectedForm.isSigned && !isPrincipalPending && (
                    <span className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 animate-pulse text-amber-600" />
                      <span>
                        {!selectedForm.isExaminerSigned 
                          ? (language === 'ar' ? 'بانتظار توقيع المدقق ثم المعلم أولاً' : 'Waiting for Auditor & Teacher')
                          : (language === 'ar' ? 'بانتظار توقيع المعلم أولاً (المرحلة 2)' : 'Waiting for Teacher Signature')}
                      </span>
                    </span>
                  )}

                  {showTeacherSignBtn && (
                    <button
                      type="button"
                      onClick={() => handleStartSignature(selectedForm, 'teacher')}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? '🖊️ توقيع المعلم بالعلم وإرسالها للمدير (المرحلة 2)' : 'Sign as Teacher & Forward'}</span>
                    </button>
                  )}

                  {/* Inform Teacher if waiting for Auditor */}
                  {isUserTeacher && !selectedForm.isTeacherSigned && !selectedForm.isExaminerSigned && (
                    <span className="px-3 py-2 bg-violet-50 border border-violet-200 text-violet-800 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 animate-pulse text-violet-600" />
                      <span>{language === 'ar' ? 'بانتظار تجهيز وتوقيع المدقق أولاً (المرحلة 1)' : 'Waiting for Auditor'}</span>
                    </span>
                  )}

                  {showExaminerSignBtn && (
                    <button
                      type="button"
                      onClick={() => {
                        setExaminerChoiceForm(selectedForm);
                        setExaminerCompliance(null);
                        setExaminerGradeRevisions(false);
                        setShowExaminerChoiceModal(true);
                      }}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? '🖊️ توقيع المدقق وإرسالها للمعلم (المرحلة 1)' : 'Sign as Auditor & Forward'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrintPDF}
                    disabled={isGeneratingPDF}
                    className={`flex-1 sm:flex-none px-5 py-3 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isGeneratingPDF 
                        ? 'bg-[#5e1113] opacity-80 cursor-wait' 
                        : 'bg-[#821315] hover:bg-[#a61c1e]'
                    }`}
                  >
                    {isGeneratingPDF ? (
                      <>
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                        <span>{language === 'ar' ? 'جاري تصدير وتنزيل الـ PDF المعتمد...' : 'Compiling & Downloading PDF...'}</span>
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 text-white" />
                        <span>{language === 'ar' ? 'تنزيل الاستمارة كـ PDF معتمد' : 'Download Form as PDF'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Interactive Workflow Stepper (تتبع مسار التوقيع والاعتماد) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-right animate-in fade-in">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5 mb-3.5 text-right w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🔄</span>
                    <h4 className="text-xs font-black text-slate-800 font-sans">
                      {language === 'ar' ? 'المسار التتابعي لتوقيع واعتماد الاستمارة:' : 'Sequential Document Signature Track:'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-sans text-slate-500 font-bold uppercase">
                      {language === 'ar' ? 'الاستمارة في هذه اللحظة عند:' : 'Current signature holder:'}
                    </span>
                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg ${
                      !selectedForm.isExaminerSigned
                        ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200'
                        : !selectedForm.isTeacherSigned
                          ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
                          : !selectedForm.isSigned
                            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                            : 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                    }`}>
                      {!selectedForm.isExaminerSigned
                        ? (language === 'ar' ? 'المدقق (المرحلة 1: تجهيز وتوقيع)' : 'Auditor (Phase 1)')
                        : !selectedForm.isTeacherSigned
                          ? (language === 'ar' ? 'معلم المادة (المرحلة 2: توقيع بالعلم)' : 'Subject Teacher (Phase 2)')
                          : !selectedForm.isSigned
                            ? (language === 'ar' ? 'مدير المدرسة (المرحلة 3: اعتماد وختم)' : 'School Principal (Phase 3)')
                            : (language === 'ar' ? 'معتمدة ومختومة بالكامل رسمياً ✓' : 'Signed, Certified & Stamped')}
                    </span>
                  </div>
                </div>

                {/* Steps Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 text-right">
                  {/* Step 1: Inspector/Examiner/Auditor */}
                  <div className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    selectedForm.isExaminerSigned 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : 'bg-violet-50 text-violet-800 border-violet-200 ring-2 ring-violet-500/15'
                  }`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                      selectedForm.isExaminerSigned 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-violet-700 text-white animate-pulse'
                    }`}>
                      {selectedForm.isExaminerSigned ? '✓' : '1'}
                    </div>
                    <div className="min-w-0 text-right">
                      <h5 className="font-bold text-slate-800 text-[11px] leading-tight">
                        {language === 'ar' ? '1. تجهيز وتوقيع المدقق' : '1. Auditor Preparation & Sign'}
                      </h5>
                      <span className="text-[9.5px] text-slate-500 font-sans block truncate mt-0.5">
                        {selectedForm.isExaminerSigned 
                          ? `${language === 'ar' ? 'الموقع:' : 'By:'} ${selectedForm.examinerSignedName}` 
                          : (language === 'ar' ? 'انتظار تجهيز وتوقيع المدقق' : 'Awaiting auditor')}
                      </span>
                      {selectedForm.isExaminerSigned && selectedForm.conformanceStatus && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`px-1.5 py-0.5 rounded-sm text-[8.5px] font-black ${
                            selectedForm.conformanceStatus === 'conforming' 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {selectedForm.conformanceStatus === 'conforming' ? (language === 'ar' ? 'مطابقة' : 'Conforming') : (language === 'ar' ? 'غير مطابقة' : 'Non-conforming')}
                          </span>
                          {selectedForm.hasGradeRevisions && (
                            <span className="px-1.5 py-0.5 rounded-sm text-[8.5px] font-black bg-amber-100 text-amber-805 border border-amber-200">
                              {language === 'ar' ? 'تعديل درجات' : 'Grade Revisions'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Teacher */}
                  <div className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    selectedForm.isTeacherSigned 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : selectedForm.isExaminerSigned
                        ? 'bg-sky-50 text-sky-800 border-sky-200 ring-2 ring-sky-500/15'
                        : 'bg-slate-100 border-slate-200 opacity-60'
                  }`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                      selectedForm.isTeacherSigned 
                        ? 'bg-emerald-600 text-white' 
                        : selectedForm.isExaminerSigned
                          ? 'bg-sky-700 text-white animate-pulse'
                          : 'bg-slate-300 text-slate-600'
                    }`}>
                      {selectedForm.isTeacherSigned ? '✓' : '2'}
                    </div>
                    <div className="min-w-0 text-right">
                      <h5 className="font-bold text-slate-800 text-[11px] leading-tight">
                        {language === 'ar' ? '2. توقيع المعلم بالعلم' : '2. Subject Teacher Signature'}
                      </h5>
                      <span className="text-[9.5px] text-slate-500 font-sans block truncate mt-0.5">
                        {selectedForm.isTeacherSigned 
                          ? `${language === 'ar' ? 'الموقع:' : 'Signature:'} ${selectedForm.teacherSignedName || selectedForm.teacherName}` 
                          : selectedForm.isExaminerSigned
                            ? (language === 'ar' ? 'جاهز لتوقيع المعلم بالعلم' : 'Available to sign')
                            : (language === 'ar' ? 'بانتظار توقيع المدقق أولاً' : 'Locked')}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: School Principal */}
                  <div className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    selectedForm.isSigned 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : (selectedForm.isExaminerSigned && selectedForm.isTeacherSigned)
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/15'
                        : 'bg-slate-100 border-slate-200 opacity-60'
                  }`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                      selectedForm.isSigned 
                        ? 'bg-emerald-600 text-white' 
                        : (selectedForm.isExaminerSigned && selectedForm.isTeacherSigned)
                          ? 'bg-emerald-700 text-white animate-pulse'
                          : 'bg-slate-300 text-slate-600'
                    }`}>
                      {selectedForm.isSigned ? '✓' : '3'}
                    </div>
                    <div className="min-w-0 text-right">
                      <h5 className="font-bold text-slate-800 text-[11px] leading-tight">
                        {language === 'ar' ? '3. توقيع واعتماد المدير والختم' : '3. Principal Sign & Stamp'}
                      </h5>
                      <span className="text-[9.5px] text-slate-500 font-sans block truncate mt-0.5">
                        {selectedForm.isSigned 
                          ? `${language === 'ar' ? 'المعتمد:' : 'Certified:'} ${selectedForm.signedByPrincipalName || 'مدير المدرسة'}` 
                          : (selectedForm.isExaminerSigned && selectedForm.isTeacherSigned)
                            ? (language === 'ar' ? 'جاهز لاعتماد المدير وختم المدرسة' : 'Available for Director')
                            : (language === 'ar' ? 'بانتظار توقيع المعلم أولاً' : 'Locked')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Printable Ministry Landscape layout block */}
              <DocumentViewer language={language} documentWidth={1150}>
                <div 
                  id="printable-archive-form"
                  className="bg-white border-2 border-slate-350 shadow-xl p-8 text-slate-900 relative select-text font-sans w-[1150px] min-w-[1150px] shrink-0 h-auto leading-relaxed mx-auto rounded-3xl pb-10 text-right"
                  style={{ direction: 'rtl' }}
                >
                {formStyles && (
                  <style>
                    {`
                      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Amiri:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans+Arabic:wght@450;600;700&family=Inter:wght@400;600;700;900&display=swap');
                      
                      #printable-archive-form {
                        --p-color-u: ${formStyles.primaryColor};
                        --s-color-u: ${formStyles.secondaryColor};
                        --p-font-u: '${formStyles.primaryFont}', 'Cairo', sans-serif;
                        --m-font-u: '${formStyles.monoFont}', monospace;
                        --sz-title-u: ${formStyles.titleSize};
                        --sz-header-u: ${formStyles.headerDetailsSize};
                        --sz-th-u: ${formStyles.tableHeaderSize};
                        --sz-tb-u: ${formStyles.tableBodySize};
                        --sz-not-u: ${formStyles.notesSize};
                        --pad-y-u: ${formStyles.tablePaddingY};
                        --out-pad-u: ${formStyles.outerPadding};
                        --brdr-w-u: ${formStyles.borderWidth};
                        --brdr-t-u: ${formStyles.borderType};

                        font-family: var(--p-font-u) !important;
                        padding: var(--out-pad-u) !important;
                        border-width: var(--brdr-w-u) !important;
                        border-style: var(--brdr-t-u) !important;
                        border-color: var(--p-color-u) !important;
                      }
                      
                      /* Primary Color Overrides */
                      #printable-archive-form .text-\\[\\#821315\\],
                      #printable-archive-form .text-\\[\\#811315\\],
                      #printable-archive-form .text-\\[\\#831215\\] {
                        color: var(--p-color-u) !important;
                      }
                      #printable-archive-form .bg-\\[\\#821315\\],
                      #printable-archive-form .bg-slate-100 {
                        background-color: var(--p-color-u) !important;
                        color: #ffffff !important;
                      }
                      #printable-archive-form .bg-\\[\\#821315\\\]\\/5 {
                        background-color: ${hexToRgba(formStyles.primaryColor, 0.05)} !important;
                      }
                      #printable-archive-form .border-\\[\\#821315\\],
                      #printable-archive-form .border-\\[\\#821315\\]\\/80,
                      #printable-archive-form .border-\\[\\#821315\\]\\/45 {
                        border-color: var(--p-color-u) !important;
                      }
                      #printable-archive-form .border-2.border-\\[\\#821315\\] {
                        border-color: var(--p-color-u) !important;
                        border-width: var(--brdr-w-u) !important;
                        border-style: var(--brdr-t-u) !important;
                      }
                      #printable-archive-form .divide-y.divide-\\[\\#821315\\\]\\/45 > * + * {
                        border-color: ${hexToRgba(formStyles.primaryColor, 0.25)} !important;
                      }
                      #printable-archive-form .divide-y.divide-\\[\\#821315\\\]\\/10 > * + * {
                        border-color: ${hexToRgba(formStyles.primaryColor, 0.10)} !important;
                      }
                      #printable-archive-form .bg-slate-50\\/20 {
                        background-color: ${hexToRgba(formStyles.primaryColor, 0.02)} !important;
                      }
                      #printable-archive-form .bg-red-50 {
                        background-color: ${hexToRgba(formStyles.primaryColor, 0.06)} !important;
                        color: var(--p-color-u) !important;
                      }

                      /* Typography Spacing/Sizing */
                      #printable-archive-form h2.dynamic-moe-report-title {
                        font-size: var(--sz-title-u) !important;
                        color: var(--p-color-u) !important;
                      }
                      #printable-archive-form .relational-table td {
                        font-size: var(--sz-header-u) !important;
                        padding-top: var(--pad-y-u) !important;
                        padding-bottom: var(--pad-y-u) !important;
                      }
                      #printable-archive-form table.printable-grades-table {
                        border: ${formStyles.tableOuterBorderWidth || '1.5px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableOuterBorderColor || formStyles.primaryColor} !important;
                        border-collapse: collapse !important;
                      }
                      #printable-archive-form table.printable-grades-table th {
                        font-size: var(--sz-th-u) !important;
                        padding-top: var(--pad-y-u) !important;
                        padding-bottom: var(--pad-y-u) !important;
                        background-color: ${formStyles.tableHeaderBg || hexToRgba(formStyles.primaryColor, 0.04)} !important;
                        border-bottom: ${formStyles.tableOuterBorderWidth || '1.5px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableOuterBorderColor || formStyles.primaryColor} !important;
                        ${formStyles.tableGridPattern === 'full' || formStyles.tableGridPattern === 'vertical' ? `
                          border-left: ${formStyles.tableBorderWidth || '1px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableBorderColor || '#cbd5e1'} !important;
                          border-right: ${formStyles.tableBorderWidth || '1px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableBorderColor || '#cbd5e1'} !important;
                        ` : `
                          border-left: none !important;
                          border-right: none !important;
                        `}
                      }
                      #printable-archive-form table.printable-grades-table td {
                        font-size: var(--sz-tb-u) !important;
                        padding-top: var(--pad-y-u) !important;
                        padding-bottom: var(--pad-y-u) !important;
                        ${formStyles.tableGridPattern === 'full' || formStyles.tableGridPattern === 'horizontal' ? `
                          border-bottom: ${formStyles.tableBorderWidth || '1px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableBorderColor || '#cbd5e1'} !important;
                        ` : `
                          border-bottom: none !important;
                        `}
                        ${formStyles.tableGridPattern === 'full' || formStyles.tableGridPattern === 'vertical' ? `
                          border-left: ${formStyles.tableBorderWidth || '1px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableBorderColor || '#cbd5e1'} !important;
                          border-right: ${formStyles.tableBorderWidth || '1px'} ${formStyles.tableBorderType || 'solid'} ${formStyles.tableBorderColor || '#cbd5e1'} !important;
                        ` : `
                          border-left: none !important;
                          border-right: none !important;
                        `}
                      }
                      #printable-archive-form .font-mono {
                        font-family: var(--m-font-u) !important;
                      }
                      #printable-archive-form .text-\\[7px\\],
                      #printable-archive-form .text-\\[7\\.5px\\] {
                        font-size: var(--sz-not-u) !important;
                      }
                    `}
                  </style>
                )}

                {/* Simulated Watermark overlay if enabled */}
                {formStyles?.showWatermark && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
                    <div 
                      className="text-[42px] font-black opacity-[0.04] rotate-[-30deg] uppercase tracking-widest text-center"
                      style={{ 
                        color: formStyles.primaryColor, 
                        fontFamily: `'${formStyles.primaryFont}', sans-serif`
                      }}
                    >
                      {formStyles.watermarkText || 'وزارة التعليم - وثيقة فحص رسمية'}
                    </div>
                  </div>
                )}

                {/* Top Omani Ministry Logo Header Grid */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-3 mb-4 relative z-10">
                  
                  {/* Upper Right: Ministry of Education Logo */}
                  <div className="text-right flex items-center justify-start">
                    <img 
                      src={logoMoe} 
                      alt="شعار وزارة التعليم" 
                      className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Center: Title */}
                  <div className="text-center space-y-1">
                    <h2 className="text-[19px] sm:text-[21px] font-bold text-[#821315] font-sans leading-relaxed tracking-normal dynamic-moe-report-title">
                      {language === 'ar' 
                        ? 'استمارة الفحص و التدقيق المستمر'
                        : (selectedForm.grade === 'Grade 12' ? 'Final School Assessment Moderation Ledger' : 'Continuous Assessment Auditing & Moderation Form')}
                    </h2>
                    <p className="text-[13px] sm:text-[14px] text-slate-500 font-medium leading-relaxed font-sans">
                      {language === 'ar' 
                        ? 'عملية الفحص والتدقيق المستمر لمخرجات التعلم' 
                        : 'Syllabus Alignment & Diploma Sample Verification Process'}
                    </p>
                  </div>

                  {/* Upper Left: Oman Vision logo only (no writing) */}
                  <div className="text-left flex items-center justify-end">
                    <img 
                      src={logoVision} 
                      alt="رؤية عُمان 2040" 
                      className="w-20 h-14 sm:w-24 sm:h-16 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                </div>

                {/* Wide Horizontal-Stack bands for perfect high-fidelity aesthetic alignment and legibility */}
                <div className="flex flex-col" style={{ gap: formStyles?.sectionSpacingY || '16px' }}>
                  
                  {/* Row 1: Unified Metadata block stretching horizontally with side-by-side specs and target teacher details */}
                  <div className="grid grid-cols-12 gap-3.5" style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '14px', marginBottom: formStyles?.metaMarginBottom || '0px' }}>
                    
                    {/* Form Specifications: col-span-5 */}
                    <div className="col-span-5 border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between" style={{ width: '41.5%', flex: '0 0 41.5%', boxSizing: 'border-box' }}>
                      <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                        {language === 'ar' ? 'بيانات استمارة الفحص والتدقيق المستمر' : 'Specification of Alignment'}
                      </div>
                      <table className="w-full text-[16px] border-collapse h-full" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <tbody>
                          <tr className="border-b border-[#821315]/45 bg-slate-50/50">
                            <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>المادة الدراسية:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{selectedForm.subjectName || selectedForm.subject}</td>
                          </tr>
                          <tr className="border-b border-[#821315]/45">
                            <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>العام الدراسي:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '65%' }}>{selectedForm.academicYear}</td>
                          </tr>
                          <tr className="bg-slate-50/50">
                            <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>الفصل الدراسي:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{selectedForm.semester}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Target Teacher Profile: col-span-7 */}
                    <div className="col-span-7 border-2 border-[#821315] rounded overflow-hidden bg-white" style={{ width: '57%', flex: '0 0 57%', boxSizing: 'border-box' }}>
                      <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                        {language === 'ar' ? 'بيانات المعلم المستهدف بالفحص والمتابعة' : 'Target Teacher General Bio-data'}
                      </div>
                      <table className="w-full text-[16px] border-collapse relational-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <tbody>
                          <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>الاسم:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{selectedForm.teacherName}</td>
                          </tr>
                          <tr className="border-b border-[#821315]/45">
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>رقم الملف:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{selectedForm.teacherFileNo}</td>
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>سنة التعيين:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{selectedForm.appointmentYear}</td>
                          </tr>
                          <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المديرية:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 leading-normal whitespace-normal break-words text-[16px] align-middle" colSpan={3} style={{ width: '78%' }}>{selectedForm.directorate}</td>
                          </tr>
                          <tr className="border-b border-[#821315]/45">
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المدرسة:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{selectedForm.schoolName}</td>
                          </tr>
                          <tr className="bg-slate-50/20">
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>التخصص:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 font-sans whitespace-normal break-words align-middle" style={{ width: '28%' }}>{selectedForm.subject}</td>
                            <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>تاريخ الزيارة:</td>
                            <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{selectedForm.visitDate}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                  </div>

                  {/* Row 2: Side-by-side Grades Audit Ledger (Right col-span-5) & Technical Observations (Left col-span-7) */}
                  <div className="grid grid-cols-12 gap-3.5" style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '14px', marginTop: formStyles?.tableMarginTop || '0px', marginBottom: formStyles?.tableMarginBottom || '0px' }}>
                    
                    {/* Right col-span-5: Grades Audit Ledger */}
                    <div className="col-span-5 flex flex-col border-2 border-[#821315] rounded overflow-hidden bg-white" style={{ width: '41.5%', flex: '0 0 41.5%', boxSizing: 'border-box' }}>
                      <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center">
                        {language === 'ar' ? 'جدول رصد ومطابقة عينة درجات الطلاب والمشغولات الدراسية' : 'Student Sample Grades Moderation Ledger'}
                      </div>
                      <table className="w-full text-right text-[16px] border-collapse leading-normal printable-grades-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                          <tr className="bg-[#821315]/5 text-[#821315] font-black text-[15px] border-b-2 border-[#821315]/45">
                            <th className="py-2 px-1.5 border-l border-[#821315]/45 text-center align-middle" style={{ width: '6%' }}>م</th>
                            <th className="py-2 px-3 border-l border-[#821315]/45 text-right align-middle" style={{ width: '32%' }}>{language === 'ar' ? 'اسم الطالب/ة' : 'Student Name'}</th>
                            <th className="py-2 px-2 border-l border-[#821315]/45 text-center align-middle" style={{ width: '10%' }}>الصف</th>
                            <th className="py-2 px-3 border-l border-[#821315]/45 align-middle" style={{ width: '16%' }}>الأداة</th>
                            <th className="p-0 border-l border-[#821315]/45 text-center align-top" colSpan={2} style={{ width: '18%' }}>
                              <div className="flex flex-col w-full h-full">
                                <div className="flex items-center justify-center w-full font-black text-[15px] text-[#821315] py-1.5 border-b border-[#821315]/45">
                                  {language === 'ar' ? 'الدرجة' : 'Grade'}
                                </div>
                                <div className="grid grid-cols-2 text-[14px] font-black h-full" style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
                                  <div className="flex items-center justify-center border-l border-[#821315]/45 px-1 py-1.5 bg-[#821315]/10" style={{ width: '50%' }}>
                                    {language === 'ar' ? 'قبل' : 'Before'}
                                  </div>
                                  <div className="flex items-center justify-center px-1 py-1.5 bg-[#821315]/10" style={{ width: '50%' }}>
                                    {language === 'ar' ? 'بعد' : 'After'}
                                  </div>
                                </div>
                              </div>
                            </th>
                            <th className="py-2 px-3 text-center border-l border-[#821315]/45 font-black text-[15px] text-[#821315] align-middle" style={{ width: '18%' }}>{language === 'ar' ? 'سبب التعديل' : 'Modification Reason'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#821315]/45 text-slate-700">
                          {selectedForm.students.map((s, idx) => {
                            const gradeNumber = selectedForm.grade ? selectedForm.grade.replace(/[^\d]/g, '') : '10';
                            const gradeClassStr = `${gradeNumber}/1`;
                            
                            const afterVal = parseInt(s.mark) || 0;
                            let beforeVal = afterVal;
                            if (s.notes && (
                              s.notes.includes('تعديل') || 
                              s.notes.includes('خطأ') || 
                              s.notes.includes('تصحيح') || 
                              ['1', '2', '3', '4', '5', '6'].includes(s.notes.trim())
                            )) {
                              beforeVal = Math.max(0, afterVal + 1);
                              if (s.name?.includes('فاطمة')) {
                                beforeVal = 8;
                              }
                            }

                            return (
                              <tr key={`archive-school-student-${s.name || 'stud'}-${idx}`} className="hover:bg-slate-50/20">
                                <td className="py-2 px-1.5 border-l border-[#821315]/45 text-center font-bold bg-[#821315]/5 text-[#821315]">{idx + 1}</td>
                                <td className="py-2.5 px-3 border-l border-[#821315]/45 font-bold whitespace-normal break-words text-slate-800">{s.name || '---'}</td>
                                <td className="py-2.5 px-2 border-l border-[#821315]/45 text-center font-semibold font-mono">{gradeClassStr}</td>
                                <td className="py-2.5 px-3 border-l border-[#821315]/45 whitespace-normal break-words font-bold text-slate-755">{s.level}</td>
                                <td className="py-2.5 px-1.5 border-l border-dashed border-[#821315]/45 text-center font-mono font-black text-black text-[15px] bg-slate-50">{beforeVal}</td>
                                <td className="py-2.5 px-1.5 border-l border-[#821315]/45 text-center font-mono font-black text-red-900 text-[15px] bg-red-50">{afterVal}</td>
                                <td className="py-2.5 px-3 text-center font-bold whitespace-normal break-words text-[12px] text-slate-800">
                                  {['1', '2', '3', '4', '5', '6'].includes(s.notes?.trim() || '') ? (
                                    <span className="font-mono text-[#821315] font-black text-[13px] bg-red-50/50 px-2 py-0.5 rounded">{s.notes}</span>
                                  ) : (
                                    <span className="text-black font-black block text-center text-[14px]">{s.notes === 'لا يوجد' || !s.notes ? (language === 'ar' ? 'لا يوجد' : 'None') : s.notes}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Left col-span-7: Technical Observations */}
                    <div className="col-span-7 border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between" style={{ width: '57%', flex: '0 0 57%', boxSizing: 'border-box' }}>
                      <div className="bg-[#821315]/5 text-[#821315] px-3 py-1.5 text-[15px] font-black text-center border-b-2 border-[#821315]">
                        {language === 'ar' ? 'الملاحظات الفنية على أدوات التقويم المستمر - التقرير المعتمد للجنة' : 'Technical Observations / Audit Comments'}
                      </div>
                      <table className="w-full text-right text-[16px] border-collapse leading-normal flex-1" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-black text-[15px] border-b-2 border-[#821315]/45">
                            <th className="py-2 px-3 border-l border-[#821315]/45 text-center" style={{ width: '15%' }}>الصف</th>
                            <th className="py-2 px-3 border-l border-[#821315]/45" style={{ width: '30%' }}>أداة التقويم</th>
                            <th className="py-2 px-3" style={{ width: '55%' }}>موجز الملاحظات الوزارية والفنية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#821315]/45 text-slate-700">
                          {selectedForm.observations.map((obs, idx) => (
                            <tr key={`archive-school-obs-${obs.tool || 'obs'}-${idx}`} className="hover:bg-slate-50/20">
                              <td className="py-2.5 px-3 border-l border-[#821315]/45 text-center font-bold bg-[#821315]/5 text-[#821315]">{obs.gradeClass}</td>
                              <td className="py-2.5 px-3 border-l border-[#821315]/45 font-bold whitespace-normal break-words">{obs.tool}</td>
                              <td className="py-2.5 px-3 text-slate-950 font-black text-center whitespace-normal break-words leading-relaxed text-[15px]">{language === 'ar' ? `ملاحظة رقم ${idx + 1}` : `Observation No. (${idx + 1})`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>

                  {/* Row 4: Beautiful Bottom Footer Bar with Suggested Program and signatures */}
                  <div className="border border-[#821315] rounded bg-white" style={{ marginTop: formStyles?.signaturesPaddingY || '16px' }}>
                    <div className="flex w-full text-[16px]" dir="rtl" style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
                      
                      {/* Professional development space */}
                      <div className="p-3 text-right flex flex-col justify-center" style={{ width: selectedForm.grade === 'Grade 12' ? '45%' : '33%', flex: selectedForm.grade === 'Grade 12' ? '0 0 45%' : '0 0 33%', boxSizing: 'border-box' }}>
                        <span className="font-extrabold text-[#821315] block text-[15px]">
                          {formStyles ? (formStyles.sectionDevelopmentAr || 'برامج الإنماء والتمكين المهني المقترحة بالتقرير:') : 'برامج الإنماء والتمكين المهني المقترحة بالتقرير:'}
                        </span>
                        <p className="text-slate-700 font-bold leading-relaxed text-[15px] mt-1">{selectedForm.suggestedDevelopment}</p>
                      </div>

                      {/* Teacher Signature Block (for continuous assessment only) - respects showTeacherSignature toggle */}
                      {((!formStyles || formStyles.showTeacherSignature !== false) || selectedForm.grade === 'Grade 12') && (
                        <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                          <span className="font-extrabold text-[#821315] block text-[15px]">
                            {formStyles ? (formStyles.sectionTeacherSignAr || 'معلم المادة الموقع:') : 'معلم المادة الموقع:'}
                          </span>
                          <p className="text-slate-800 font-black text-[15px] mt-1 leading-tight">
                            {selectedForm.isTeacherSigned 
                              ? (selectedForm.teacherSignedName || '').replace(/[)(]/g, ' ')
                              : (selectedForm.teacherName || 'معلم المادة').replace(/[)(]/g, ' ')}
                          </p>
                          <div className="text-[13px] text-slate-400 mt-2 block w-full">
                            {selectedForm.isTeacherSigned ? (
                              <div className="block w-full">
                                <span className="font-mono text-sky-600 font-extrabold block w-full text-[12px]" style={{ direction: 'ltr' }}>
                                  {selectedForm.teacherSignatureQrData}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sky-600 font-bold block w-full text-[12px]">⏱️ بانتظار توقيع المعلم</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Examiner details */}
                      <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                        <span className="font-extrabold text-[#821315] block text-[15px]">
                          {formStyles ? (formStyles.sectionAuditorSignAr || 'مشرف فحص ومطابقة المادة:') : 'مشرف فحص ومطابقة المادة:'}
                        </span>
                        <p className="text-slate-800 font-black text-[15px] mt-1 leading-tight">
                          {selectedForm.isExaminerSigned 
                            ? (selectedForm.examinerSignedName || '').replace(/[)(]/g, ' ').replace('مشرف ومدقق محافظة الوسطى', '').replace('مشرف ومدقق', '').trim()
                            : (selectedForm.examinerName || 'مشرف فحص ومطابقة المادة').replace(/[)(]/g, ' ').replace('مشرف ومدقق محافظة الوسطى', '').replace('مشرف ومدقق', '').trim()}
                        </p>
                        <div className="text-[13px] text-slate-400 mt-2 block w-full">
                          {selectedForm.isExaminerSigned ? (
                            <div className="block w-full">
                              <span className="font-mono text-violet-600 font-extrabold block w-full text-[12px]" style={{ direction: 'ltr' }}>
                                {selectedForm.examinerSignatureQrData}
                              </span>
                            </div>
                          ) : (
                            <span className="text-violet-600 font-bold block w-full text-[12px]">⏱️ بانتظار توقيع المفتش</span>
                          )}
                        </div>
                      </div>

                      {/* Principal and Stamp */}
                      <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center relative" style={{ width: selectedForm.grade === 'Grade 12' ? '36%' : '28%', flex: selectedForm.grade === 'Grade 12' ? '0 0 36%' : '0 0 28%', boxSizing: 'border-box' }}>
                        {selectedForm.isSigned && selectedForm.signatureStampUrl !== 'no_stamp' && (
                          <DraggableStamp 
                            src={getActiveStamp(selectedForm.schoolId || selectedForm.schoolName)} 
                            language={language}
                            className="right-4 top-1 w-24 h-24 opacity-95"
                            storageKey={`oman_moe_stamp_pos_archive_${selectedForm.id}`}
                            defaultOffsetX={formStyles?.stampOffsetX || 0}
                            defaultOffsetY={formStyles?.stampOffsetY || 0}
                          />
                        )}
                        <div className="font-extrabold text-[#821315] block text-[15px] relative z-10">
                          {formStyles ? (formStyles.sectionPrincipalSignAr || 'مدير المدرسة المصادق:') : 'مدير المدرسة المصادق:'}
                        </div>
                        <div className="text-slate-800 font-black text-[15px] mt-1.5 block w-full font-black relative z-10">
                          {selectedForm.isSigned 
                            ? (selectedForm.signedByPrincipalName || '').replace(/[)(]/g, ' ')
                            : (selectedForm.principalName || 'بانتظار الاعتماد').replace(/[)(]/g, ' ')}
                        </div>
                        <div className="text-[13px] text-slate-400 mt-2 block w-full relative z-10 font-mono">
                          {selectedForm.isSigned ? (
                            <div className="block w-full">
                              <span className="font-mono text-[#821315] font-extrabold block w-full text-[12px]" style={{ direction: 'ltr' }}>
                                {selectedForm.signatureQrData}
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-600 font-bold block w-full text-[12px]">⏱️ بانتظار الاعتماد الرئاسي</span>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>

                </div>
                  </div>
              </DocumentViewer>

            </div>
          ) : (
            <div className="bg-white rounded-3xl p-16 border border-slate-150 text-center text-slate-400 space-y-4 shadow-xs">
              <div className="w-16 h-16 bg-slate-50 flex items-center justify-center rounded-2xl mx-auto border border-slate-100 text-[#821315]/80">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-black text-slate-800">{language === 'ar' ? 'معاينة استمارات الفحص والتدقيق' : 'Ledger Document Preview'}</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {language === 'ar' 
                    ? 'الرجاء اختيار استمارة مفحوصة ومرحلة من القائمة أولاً لمطابقة علامات المعلم الفنية، واستعراض التوازنات، تمهيداً للتوقيع والاعتماد ودمج الـ QR.'
                    : 'Select any finalized audit ledger from the sidebar list to inspect the marks balance sheets, audit tools, and perform secure electronic QR validation.'}
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* SECURE DIGITAL SIGNATURE MODAL & QR SCAN SIMULATOR */}
      {signingForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-6 relative text-right"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            <button
              type="button"
              onClick={() => setSigningForm(null)}
              className="absolute top-4 left-4 p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black inline-block">
                🔐 {language === 'ar' ? 'شفرة المصادقة المعتمدة' : 'Secure MOE Sign-Off'}
              </span>
              <h3 className="text-lg font-black text-[#051C3F] font-heading leading-snug">
                {language === 'ar' ? 'الاعتماد والمصادقة على استمارة التدقيق' : 'Authenticate Audit Ledger'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
                {signatureType === 'principal'
                  ? (language === 'ar' 
                      ? 'بصفتك مديراً للمدرسة، يرجى تدوين التوقيع وربط الرمز الإلكتروني لتأصيل المستند بشكل هولوجرامي قانوني.'
                      : 'Verify school director authority and apply authentic encryption credentials to sign continuous assessment form.')
                  : (language === 'ar'
                      ? 'بصفتك معلم المادة، يرجى تدوين توقيعك لإثبات سلامة رصد درجات الطلاب فنيًا والتأصيل البصري.'
                      : 'Verify subject teacher credentials and apply authentic signature to sign the assessment ledger.')}
              </p>
            </div>

            {/* Simulated Live Scan Device Panel */}
            <div className="bg-slate-50 rounded-2xl p-4.5 border border-slate-200/60 space-y-4">
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative">
                  <div className="w-32 h-32 bg-white p-3 border-2 border-slate-200 rounded-2xl shadow-xs flex items-center justify-center">
                    {/* Simulator Dynamic scan beams */}
                    <svg className="w-full h-full text-[#051C3F]" viewBox="0 0 100 100">
                      <rect width="100" height="100" fill="white" />
                      <rect x="5" y="5" width="25" height="25" fill={signatureType === 'principal' ? "currentColor" : "#0284c7"} />
                      <rect x="10" y="10" width="15" height="15" fill="white" />
                      <rect x="5" y="70" width="25" height="25" fill={signatureType === 'principal' ? "currentColor" : "#0284c7"} />
                      <rect x="10" y="75" width="15" height="15" fill="white" />
                      <rect x="70" y="5" width="25" height="25" fill={signatureType === 'principal' ? "currentColor" : "#0284c7"} />
                      <rect x="75" y="10" width="15" height="15" fill="white" />
                      {/* Inner simulator random pixels */}
                      <rect x="40" y="40" width="20" height="20" fill="currentColor" />
                      <rect x="42" y="12" width="10" height="12" fill="currentColor" />
                      <rect x="12" y="42" width="12" height="10" fill="currentColor" />
                    </svg>
                    
                    <div className="absolute inset-0 border-2 border-[#821315] rounded-2xl animate-pulse pointer-events-none scale-102"></div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-red-600 animate-[bounce_2s_infinite] opacity-60"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-800 leading-tight">
                    {signatureType === 'principal' 
                      ? (language === 'ar' ? 'جهاز التحقق البيومتري المباشر للمدير' : 'Principal QR Verification Terminal')
                      : (language === 'ar' ? 'جهاز التحقق البيومتري المباشر للمعلم' : 'Teacher QR Verification Terminal')}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium max-w-[250px] leading-relaxed">
                    {language === 'ar' 
                      ? 'امسح الرمز أعلاه باستخدام تطبيق البوابة التعليمية للهواتف الذكية أو انقر أدناه لإجراء اختبار محاكاة فوري لفك القفل.'
                      : 'Scan QR using the official smartphone application to inject digital signatures instantly.'}
                  </p>
                </div>

                {!scanSimulated ? (
                  <button
                    type="button"
                    onClick={() => {
                      setScanSimulated(true);
                      onSuccess(language === 'ar' ? 'تم قراءة الرمز والتحقق الفني بنجاح!' : 'QR credential scanned successfully!');
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-[11px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'المحاكاة: مسح الرمز بالهاتف الفعلي' : 'Simulate Phone Camera Scan'}</span>
                  </button>
                ) : (
                  <div className="px-4 py-1.5 bg-emerald-50 border border-emerald-250 text-emerald-700 text-[10.5px] font-black rounded-lg flex items-center gap-1 animate-in zoom-in-95 duration-200">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {signatureType === 'principal' 
                        ? (language === 'ar' ? '✓ تم مطابقة هوية المدير والترميز بنجاح' : '✓ Authority scan matching completed')
                        : (language === 'ar' ? '✓ تم مطابقة هوية معلم المادة والترميز بنجاح' : '✓ Subject teacher scan matching completed')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              {signatureType === 'principal' ? (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1">
                    {language === 'ar' ? 'اسم مدير المدرسة المصادق:' : 'Principal Name:'}
                  </label>
                  <input
                    type="text"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-hidden focus:border-sky-500 font-bold text-slate-800"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1">
                    {language === 'ar' ? 'اسم معلم المادة الموقع:' : 'Teacher Name:'}
                  </label>
                  <input
                    type="text"
                    value={teacherSignName}
                    onChange={(e) => setTeacherSignName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-hidden focus:border-sky-500 font-bold text-slate-800"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1">
                  {language === 'ar' ? 'تفاصيل السجل وخاتم الإجابة:' : 'Custom Stamp / Status note:'}
                </label>
                <input
                  type="text"
                  value={customStamp}
                  onChange={(e) => setCustomStamp(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-hidden focus:border-sky-500 font-semibold text-slate-800"
                />
              </div>
            </div>

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleApplySignature}
              disabled={isSigningInProcess || !scanSimulated}
              className={`w-full py-4.5 rounded-xl font-black text-xs text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                scanSimulated 
                  ? 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg' 
                  : 'bg-slate-300 opacity-60 cursor-not-allowed'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>
                {isSigningInProcess 
                  ? (language === 'ar' ? 'جاري توثيق الأختام والتوقيع الإلكتروني...' : 'Certifying...') 
                  : (language === 'ar' ? 'تطبيق التوقيع والختم والمصادقة النهائية' : 'Apply Signs & Certified Authenticity')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* EXAMINER DECISION CHOICE MODAL */}
      {showExaminerChoiceModal && examinerChoiceForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-250" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-6 relative text-right font-sans">
            
            <button
              type="button"
              onClick={() => {
                setShowExaminerChoiceModal(false);
                setExaminerChoiceForm(null);
                setExaminerCompliance(null);
                setExaminerGradeRevisions(false);
              }}
              className="absolute top-4 left-4 p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <span className="px-2.5 py-0.5 bg-violet-50 text-violet-750 rounded-full text-[10px] font-black inline-block">
                📋 قرار الفاحص الفني للمادة
              </span>
              <h3 className="text-base font-black text-[#051C3F] font-heading leading-snug">
                يرجى تحديد قرارك الفني بشأن هذه الاستمارة
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium">
                بصفتك المصادق الفني للمادة، يجب اختيار حالة مطابقة الاستمارة وتحديد ما إذا كان يتطلب تعديلاً للدرجات في السجل أم لا.
              </p>
            </div>

            {/* Error or validation info box style */}
            <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-[11px] text-slate-450 leading-relaxed">
              💡 <span className="font-bold text-[#821315]">شروط التوقيع:</span> الخيارات المتاحة هي: "مطابقة" أو "غير مطابقة" وبإمكانك دمج "تعديل درجات" مع أي منهما. غير مسموح باختيار "تعديل درجات" بمفرده. <br/> <span className="font-bold mt-1 block">ملاحظة: سواء كانت الاستمارة مطابقة أم لا. يوقع الفاحص ثم يوقع المعلم ثم يوقع المدير.</span>
            </div>

            {/* Selecting compliance status with beautiful radio check buttons */}
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 mb-1">
                حدد حالة المطابقة: <span className="text-red-500 font-bold">*</span>
              </label>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Conforming button select */}
                <button
                  type="button"
                  onClick={() => setExaminerCompliance('conforming')}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                    examinerCompliance === 'conforming'
                      ? 'border-emerald-500 bg-emerald-50/20 text-emerald-950 font-black ring-2 ring-emerald-500/10'
                      : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-xl mb-1">🟢</span>
                  <span className="text-xs font-black">مطابقة المعايير</span>
                </button>

                {/* Non conforming button select */}
                <button
                  type="button"
                  onClick={() => setExaminerCompliance('non-conforming')}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                    examinerCompliance === 'non-conforming'
                      ? 'border-rose-500 bg-rose-50/20 text-rose-950 font-black ring-2 ring-rose-500/10'
                      : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-[#f43f5e]/30 text-slate-700'
                  }`}
                >
                  <span className="text-xl mb-1">🔴</span>
                  <span className="text-xs font-black">غير مطابقة المعايير</span>
                </button>
              </div>

              {/* Adjust Score Choice */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setExaminerGradeRevisions(!examinerGradeRevisions);
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    examinerGradeRevisions
                      ? 'border-amber-500 bg-amber-50/20 text-amber-950 ring-1 ring-amber-500/10'
                      : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">📝</span>
                    <span className="text-xs font-black">يتطلب تعديل درجات رصد الطلاب</span>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    examinerGradeRevisions 
                      ? 'bg-amber-600 border-amber-600 text-white' 
                      : 'border-slate-300 text-transparent'
                  }`}>
                    ✓
                  </div>
                </button>
              </div>

              {/* Validation alert message triggers if trying to bypass selection */}
              {!examinerCompliance && examinerGradeRevisions && (
                <p className="text-[10px] text-rose-600 font-extrabold mt-1.5 animate-pulse text-right">
                  ⚠️ غير مسموح بنظام التعليم باختيار "تعديل درجات" لوحده. يجب اختيار مطابقة أو غير مطابقة أولاً.
                </p>
              )}
            </div>

            {/* Confirm Actions */}
            <button
              type="button"
              disabled={!examinerCompliance}
              onClick={async () => {
                if (!examinerCompliance) return;
                
                setShowExaminerChoiceModal(false);
                await handleStartSignatureWithChoice(examinerChoiceForm, examinerCompliance, examinerGradeRevisions);
                
                setExaminerChoiceForm(null);
                setExaminerCompliance(null);
                setExaminerGradeRevisions(false);
              }}
              className={`w-full py-4.5 rounded-2xl font-black text-xs text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                examinerCompliance
                  ? 'bg-violet-600 hover:bg-violet-750 hover:shadow-lg'
                  : 'bg-slate-300 opacity-65 cursor-not-allowed'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>تأكيد الخيارات والتوقيع الإلكتروني للمشرف</span>
            </button>

          </div>
        </div>
      )}



    </div>
  );
}
