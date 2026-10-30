import React, { useState } from 'react';
import { 
  Search, 
  ShieldCheck, 
  FileCheck, 
  Clock, 
  User, 
  School, 
  Hash, 
  AlertCircle,
  QrCode,
  Fingerprint,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  Award,
  UserCheck
} from 'lucide-react';
import { ArchivedForm } from '../types';
import { Language } from '../lib/translations';
import { formatSafeDate, formatSafeDateTime } from '../utils/dateUtils';

interface SignatureVerifierViewProps {
  archivedForms: ArchivedForm[];
  language: Language;
}

export type SignatureRole = 'examiner' | 'principal' | 'teacher';

export interface VerifiedSignatureDetail {
  form: ArchivedForm;
  role: SignatureRole;
  roleTitleAr: string;
  roleTitleEn: string;
  signerName: string;
  qrCode: string;
  signedAt?: string;
  stampUrl?: string;
}

function formatSignatureInput(value: string, prevValue: string = ''): string {
  if (!value) return '';
  const isDeleting = value.length < prevValue.length;
  const rawUpper = value.toUpperCase();
  const clean = rawUpper.replace(/[^A-Z0-9]/g, '');

  if (!clean) return '';

  if (isDeleting) {
    let res = '';
    if (clean.length <= 2) return clean;
    res += clean.slice(0, 2) + '-';

    if (clean.length <= 5) {
      if (clean.length === 5 && !rawUpper.endsWith('-')) return res + clean.slice(2);
      return res + clean.slice(2) + (clean.length === 5 ? '-' : '');
    }
    res += clean.slice(2, 5) + '-';

    if (clean.length <= 9) {
      if (clean.length === 9 && !rawUpper.endsWith('-')) return res + clean.slice(5);
      return res + clean.slice(5) + (clean.length === 9 ? '-' : '');
    }
    res += clean.slice(5, 9) + '-';

    return res + clean.slice(9, 13);
  }

  // User is typing forward: auto-append hyphen immediately on reaching segment bounds (OM-, OM-AUD-, OM-AUD-5X12-)
  let res = '';
  // Part 1: OM
  if (clean.length < 2) {
    return clean;
  }
  if (clean.length === 2) {
    return clean + '-';
  }
  res += clean.slice(0, 2) + '-';

  // Part 2: AUD, DIR, TCH, SIG
  if (clean.length < 5) {
    return res + clean.slice(2);
  }
  if (clean.length === 5) {
    return res + clean.slice(2, 5) + '-';
  }
  res += clean.slice(2, 5) + '-';

  // Part 3: 4-char segment
  if (clean.length < 9) {
    return res + clean.slice(5);
  }
  if (clean.length === 9) {
    return res + clean.slice(5, 9) + '-';
  }
  res += clean.slice(5, 9) + '-';

  // Part 4: Final 4-char segment
  return res + clean.slice(9, 13);
}

export function SignatureVerifierView({ archivedForms, language }: SignatureVerifierViewProps) {
  const [searchSerial, setSearchSerial] = useState('');
  const [selectedVerifiable, setSelectedVerifiable] = useState<ArchivedForm | null>(null);
  const [activeSelectedRole, setActiveSelectedRole] = useState<SignatureRole>('examiner');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Filter signed forms that have AT LEAST ONE verifiable signature (Examiner, Principal, or Teacher)
  const signedForms = archivedForms.filter(f => 
    (f.isExaminerSigned && f.examinerSignatureQrData) ||
    (f.isSigned && f.signatureQrData) ||
    (f.isTeacherSigned && f.teacherSignatureQrData)
  );

  // Strict 100% exact match helper
  const matchesCode = (query: string, code?: string) => {
    if (!code) return false;
    const queryClean = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dbClean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!queryClean || !dbClean) return false;

    // Enforce 100% exact equality
    return queryClean === dbClean;
  };

  // Find matching signature and determine role (Examiner, Principal, or Teacher)
  const findMatchForQuery = (query: string): { form: ArchivedForm; role: SignatureRole } | null => {
    if (!query.trim()) return null;

    // 1. Search Examiner signatures first (OM-AUD-...)
    for (const f of signedForms) {
      if ((f.isExaminerSigned || f.examinerSignatureQrData) && matchesCode(query, f.examinerSignatureQrData)) {
        return { form: f, role: 'examiner' };
      }
    }

    // 2. Search Principal signatures (OM-DIR-...)
    for (const f of signedForms) {
      if ((f.isSigned || f.signatureQrData) && matchesCode(query, f.signatureQrData)) {
        return { form: f, role: 'principal' };
      }
    }

    // 3. Search Teacher signatures (OM-TCH-...)
    for (const f of signedForms) {
      if ((f.isTeacherSigned || f.teacherSignatureQrData) && matchesCode(query, f.teacherSignatureQrData)) {
        return { form: f, role: 'teacher' };
      }
    }

    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSignatureInput(e.target.value, searchSerial);
    setSearchSerial(formatted);
    setHasSubmitted(false);
    // Never show signature owner details while typing!
    setSelectedVerifiable(null);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);

    if (!searchSerial.trim()) {
      setSelectedVerifiable(null);
      return;
    }

    const result = findMatchForQuery(searchSerial);
    if (result) {
      setSelectedVerifiable(result.form);
      setActiveSelectedRole(result.role);
    } else {
      setSelectedVerifiable(null);
    }
  };

  const handleSelectFormDirectly = (form: ArchivedForm, defaultRole?: SignatureRole) => {
    const roleToUse = defaultRole || (
      form.isExaminerSigned && form.examinerSignatureQrData ? 'examiner' :
      form.isSigned && form.signatureQrData ? 'principal' : 'teacher'
    );
    const code = roleToUse === 'examiner' ? form.examinerSignatureQrData :
                 roleToUse === 'principal' ? form.signatureQrData :
                 form.teacherSignatureQrData;

    const formattedCode = formatSignatureInput(code || '');
    setSearchSerial(formattedCode || code || '');
    setSelectedVerifiable(form);
    setActiveSelectedRole(roleToUse);
    setHasSubmitted(true);
  };

  // Build current active verification details for the selected form & role
  const getActiveDetail = (): VerifiedSignatureDetail | null => {
    if (!selectedVerifiable) return null;
    const f = selectedVerifiable;

    if (activeSelectedRole === 'examiner' && (f.isExaminerSigned || f.examinerSignatureQrData)) {
      return {
        form: f,
        role: 'examiner',
        roleTitleAr: 'الفاحص والمدقق التربوي الفني المعتمد',
        roleTitleEn: 'Educational Auditor & Technical Inspector',
        signerName: f.examinerSignedName || f.examinerName || 'أ. سالم بن راشد الهنائي (مشرف الفحص)',
        qrCode: f.examinerSignatureQrData || 'OM-AUD-VERIFIED',
        signedAt: f.examinerSignedAt || f.createdAt,
        stampUrl: f.examinerSignatureStampUrl || 'اعتماد وتوقيع الفاحص الفني المعتمد'
      };
    }

    if (activeSelectedRole === 'principal' && (f.isSigned || f.signatureQrData)) {
      return {
        form: f,
        role: 'principal',
        roleTitleAr: 'مدير المدرسة المعتمد والمصادق',
        roleTitleEn: 'Authorizing School Principal',
        signerName: f.signedByPrincipalName || f.principalName || 'مدير المدرسة',
        qrCode: f.signatureQrData || 'OM-DIR-VERIFIED',
        signedAt: f.signedAt || f.createdAt,
        stampUrl: f.signatureStampUrl || 'الختم الرسمي لمدرسة السلطنة'
      };
    }

    if (activeSelectedRole === 'teacher' && (f.isTeacherSigned || f.teacherSignatureQrData)) {
      return {
        form: f,
        role: 'teacher',
        roleTitleAr: 'معلم المادة المستلم والمستهدف بالتطوير',
        roleTitleEn: 'Assigned Subject Teacher',
        signerName: f.teacherSignedName || f.teacherName || 'معلم المادة',
        qrCode: f.teacherSignatureQrData || 'OM-TCH-VERIFIED',
        signedAt: f.teacherSignedAt || f.createdAt,
        stampUrl: f.teacherSignatureStampUrl || 'تأكيد واستلام معلم المادة'
      };
    }

    // Fallback to Examiner if present
    if (f.isExaminerSigned || f.examinerSignatureQrData) {
      return {
        form: f,
        role: 'examiner',
        roleTitleAr: 'الفاحص والمدقق التربوي الفني المعتمد',
        roleTitleEn: 'Educational Auditor & Technical Inspector',
        signerName: f.examinerSignedName || f.examinerName || 'مشرف الفحص الفني',
        qrCode: f.examinerSignatureQrData || 'OM-AUD-VERIFIED',
        signedAt: f.examinerSignedAt || f.createdAt,
        stampUrl: f.examinerSignatureStampUrl || 'اعتماد وتوقيع الفاحص الفني'
      };
    }

    // Fallback to Principal
    if (f.isSigned || f.signatureQrData) {
      return {
        form: f,
        role: 'principal',
        roleTitleAr: 'مدير المدرسة المعتمد والمصادق',
        roleTitleEn: 'Authorizing School Principal',
        signerName: f.signedByPrincipalName || f.principalName || 'مدير المدرسة',
        qrCode: f.signatureQrData || 'OM-DIR-VERIFIED',
        signedAt: f.signedAt || f.createdAt,
        stampUrl: f.signatureStampUrl || 'الختم الرسمي للمدرسة'
      };
    }

    return null;
  };

  const activeDetail = getActiveDetail();

  return (
    <div className="space-y-6 text-right font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Hero Banner header */}
      <div className="bg-gradient-to-r from-slate-900 via-[#051C3F] to-[#0a2c5c] text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden text-right">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-2xl -ml-10 -mb-10"></div>
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2 text-right">
            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 text-[10.5px] font-black rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <Fingerprint className="w-3.5 h-3.5" />
              {language === 'ar' ? 'البوابة الوطنية الفيدرالية للتحقق من التواقيع' : 'National Verification Gateway'}
            </span>
            <h2 className="text-xl sm:text-2xl font-black font-heading tracking-tight text-white leading-tight">
              {language === 'ar' ? 'أداة التثبت والتحقق الفوري من تواقيع الفاحص والمدير والمعلم' : 'Multi-Role Audit Signature Resolver'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium leading-relaxed font-sans">
              {language === 'ar' 
                ? 'نظام التحقق الإلكتروني المركزي للتحقق من هوية الفاحصين والمدققين التربويين ومديري المدارس والمعلمين الذين وقعوا وصادقوا على استمارات التقييم والتدقيق المستمر.'
                : 'Central verification engine to query and authenticate digital signatures of Educational Auditors, School Principals, and Teachers across Oman.'}
            </p>
          </div>
        </div>
      </div>

      {/* Grid containing Resolver tool and live signed archives */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Resolver Query Panel (col-span-12 or col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Query Box component */}
          <div className="bg-white rounded-3xl border border-slate-200/60 p-5 sm:p-6 shadow-sm space-y-5">
            <div className="space-y-1 text-right">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base font-heading">
                {language === 'ar' ? 'فحص ومطابقة الرمز التسلسلي للتوقيع (توقيع الفاحص / المدير / المعلم)' : 'Lookup Signature Serial (Auditor / Principal / Teacher)'}
              </h3>
              <p className="text-[11.5px] text-slate-400 font-sans leading-relaxed">
                {language === 'ar' 
                  ? 'أدخل الرمز التسلسلي للتوقيع المطبوع على الاستمارة (مثال: توقيع الفاحص OM-AUD-XXXXXX أو توقيع المدير OM-DIR-XXXXXX) للتحقق المباشر من الهوية وصلاحيات الاعتماد.' 
                  : 'Enter the verification serial code (e.g. Auditor OM-AUD-XXXX, Principal OM-DIR-XXXX, Teacher OM-TCH-XXXX) to validate signature identity.'}
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder={language === 'ar' ? 'أدخل رمز التوقيع هنا (مثال: OM-AUD-5X12-9A34 أو OM-DIR-7K99)' : 'e.g. OM-AUD-5X12-9A34 or OM-DIR-7K99'}
                  value={searchSerial}
                  onChange={handleInputChange}
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 outline-hidden transition-all text-xs font-mono font-bold uppercase tracking-wider text-right text-slate-800"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4 text-purple-600" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 hover:from-purple-950 hover:to-black text-white text-xs font-black rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-purple-900/10"
              >
                <ShieldCheck className="w-4 h-4 text-purple-300 animate-pulse" />
                <span>{language === 'ar' ? 'تحقق ومطابقة توقيع الفاحص / المدير / المعلم الآن' : 'Verify Digital Identity & Credentials'}</span>
              </button>
            </form>

            {/* Verification Result Display */}
            <div className="pt-2">
              {!searchSerial.trim() && !selectedVerifiable ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/40 flex flex-col items-center justify-center space-y-2">
                  <QrCode className="w-10 h-10 text-slate-300 animate-pulse" />
                  <span className="text-[11px] text-slate-400 font-sans">
                    {language === 'ar' ? 'في انتظار إدخال الرمز التسلسلي للتثبت من التوقيع...' : 'Awaiting alphanumeric signature key...'}
                  </span>
                </div>
              ) : hasSubmitted && selectedVerifiable && activeDetail ? (
                // Verified successfully display card
                <div className="bg-gradient-to-b from-purple-50/30 via-white to-slate-50/50 border border-purple-200/80 p-5 rounded-2xl space-y-4 animate-in zoom-in-95 duration-150 text-right shadow-xs">
                  
                  {/* Top verification badge & code */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider leading-none font-sans flex items-center gap-1.5 border shadow-2xs ${
                      activeDetail.role === 'examiner'
                        ? 'bg-purple-100 border-purple-300 text-purple-900'
                        : activeDetail.role === 'principal'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                        : 'bg-indigo-100 border-indigo-300 text-indigo-900'
                    }`}>
                      <ShieldCheck className="w-3.5 h-3.5 text-current animate-bounce" />
                      <span>
                        {activeDetail.role === 'examiner'
                          ? (language === 'ar' ? '✓ توقيع الفاحص والمدقق التربوي موثق' : '✓ Verified Examiner / Auditor Signature')
                          : activeDetail.role === 'principal'
                          ? (language === 'ar' ? '✓ توقيع مدير المدرسة المعتمد موثق' : '✓ Verified School Principal Signature')
                          : (language === 'ar' ? '✓ توقيع معلم المادة موثق' : '✓ Verified Subject Teacher Signature')}
                      </span>
                    </span>

                    <span className="font-mono text-xs text-purple-900 font-extrabold bg-purple-100/60 border border-purple-200 px-2.5 py-1 rounded-lg">
                      {activeDetail.qrCode}
                    </span>
                  </div>

                  <div className="pt-2 space-y-4">
                    
                    {/* Signed Representative Identity details */}
                    <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        activeDetail.role === 'examiner'
                          ? 'bg-purple-100 text-purple-800'
                          : activeDetail.role === 'principal'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        <User className="w-6 h-6" />
                      </div>
                      <div className="space-y-1.5 text-right w-full">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[10.5px] text-slate-400 font-extrabold uppercase">
                            {language === 'ar' ? 'اسم صاحب التوقيع:' : 'Signatory Name:'}
                          </span>
                          <span className="text-[10px] text-purple-900 font-bold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md font-mono">
                            {activeDetail.qrCode}
                          </span>
                        </div>

                        <strong className="text-slate-900 font-black text-base block font-heading">
                          {activeDetail.signerName.startsWith('أ.') || activeDetail.signerName.startsWith('د.') ? activeDetail.signerName : `أ. ${activeDetail.signerName}`}
                        </strong>
                        
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div className="space-y-0.5">
                            <span className="text-slate-400 font-bold block text-[10px]">
                              {language === 'ar' ? 'الصفة والمسمى الوظيفي:' : 'Official Role / Title:'}
                            </span>
                            <span className="text-purple-950 font-extrabold block">
                              {activeDetail.roleTitleAr}
                            </span>
                          </div>

                          <div className="space-y-0.5">
                            <span className="text-slate-400 font-bold block text-[10px]">
                              {language === 'ar' ? 'تاريخ ووقت التوقيع بالبوابة:' : 'Signature Timestamp:'}
                            </span>
                            <span className="text-slate-800 font-mono font-extrabold block">
                              {formatSafeDateTime(activeDetail.signedAt || selectedVerifiable.createdAt, language === 'ar' ? 'ar-OM' : 'en-US')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Target Form & School Metadata (إستمارة الأستاذ... / مدرسة...) */}
                    <div className="bg-white border border-slate-200/80 p-4 rounded-xl text-right space-y-2 shadow-2xs">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">
                        {language === 'ar' ? 'الاستمارة والمؤسسة المعنية بالتثبت:' : 'Target Assessment Form:'}
                      </span>
                      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                        <div className="text-xs sm:text-sm font-black text-slate-900 flex flex-wrap items-center gap-1.5 justify-end">
                          <span className="text-slate-500">{language === 'ar' ? 'إستمارة الأستاذ: ' : 'Teacher Form: '}</span>
                          <strong className="text-purple-950 underline">{selectedVerifiable.teacherName}</strong>
                          <span className="text-slate-400 font-bold">/</span>
                          <span className="text-slate-500">{language === 'ar' ? 'مدرسة: ' : 'School: '}</span>
                          <strong className="text-emerald-900 font-black">{selectedVerifiable.schoolName}</strong>
                        </div>
                        <div className="text-[11px] text-slate-600 font-semibold flex flex-wrap items-center gap-2 justify-end pt-2 border-t border-slate-200/60">
                          <span className="bg-white border border-slate-200 px-2.5 py-0.5 rounded text-slate-800 font-extrabold">
                            {selectedVerifiable.assessmentTitle || selectedVerifiable.subjectName}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span>{selectedVerifiable.grade}</span>
                          <span className="text-slate-400">•</span>
                          <span>{selectedVerifiable.academicYear}</span>
                        </div>
                      </div>
                    </div>

                    {/* All Signatures Audit Checklist on Form */}
                    <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl space-y-2">
                      <span className="text-[10px] text-slate-500 font-black block text-right">
                        {language === 'ar' ? 'سلسلة اعتماد وتواقيع الاستمارة الرقمية:' : 'Form Authorization Signatures Ledger:'}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {/* Examiner status */}
                        <div className={`p-2 rounded-lg border text-right space-y-0.5 ${
                          selectedVerifiable.isExaminerSigned || selectedVerifiable.examinerSignatureQrData
                            ? 'bg-purple-50 border-purple-200 text-purple-900'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-black">{language === 'ar' ? '1. توقيع الفاحص' : '1. Examiner'}</span>
                            <CheckCircle2 className="w-3 h-3 text-purple-600" />
                          </div>
                          <span className="text-[9px] font-mono block font-bold truncate">{selectedVerifiable.examinerSignatureQrData || 'غير موقع'}</span>
                          <span className="text-[8.5px] block truncate text-slate-600">{selectedVerifiable.examinerSignedName || selectedVerifiable.examinerName}</span>
                        </div>

                        {/* Principal status */}
                        <div className={`p-2 rounded-lg border text-right space-y-0.5 ${
                          selectedVerifiable.isSigned || selectedVerifiable.signatureQrData
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-black">{language === 'ar' ? '2. توقيع المدير' : '2. Principal'}</span>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          </div>
                          <span className="text-[9px] font-mono block font-bold truncate">{selectedVerifiable.signatureQrData || 'قيد الانتظار'}</span>
                          <span className="text-[8.5px] block truncate text-slate-600">{selectedVerifiable.signedByPrincipalName || selectedVerifiable.principalName}</span>
                        </div>

                        {/* Teacher status */}
                        <div className={`p-2 rounded-lg border text-right space-y-0.5 ${
                          selectedVerifiable.isTeacherSigned || selectedVerifiable.teacherSignatureQrData
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-black">{language === 'ar' ? '3. توقيع المعلم' : '3. Teacher'}</span>
                            <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                          </div>
                          <span className="text-[9px] font-mono block font-bold truncate">{selectedVerifiable.teacherSignatureQrData || 'قيد الانتظار'}</span>
                          <span className="text-[8.5px] block truncate text-slate-600">{selectedVerifiable.teacherSignedName || selectedVerifiable.teacherName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stamping details */}
                    <div className="bg-purple-500/5 p-3 rounded-xl border border-purple-200/40 flex items-center justify-between gap-2">
                      <div className="text-right">
                        <span className="text-[9.5px] text-purple-900 font-black block">{language === 'ar' ? 'حالة التثبت الأمني والختم:' : 'Security Verification Stamp:'}</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeDetail.stampUrl}</p>
                      </div>
                      <span className="p-1.5 bg-purple-100 text-purple-800 rounded-lg">
                        <FileCheck className="w-4 h-4 animate-pulse" />
                      </span>
                    </div>

                  </div>
                </div>
              ) : hasSubmitted && searchSerial.trim() ? (
                // Code not matching/found alert (Only after explicit submission)
                <div className="bg-rose-50/70 border border-rose-200 p-5 rounded-2xl space-y-2 animate-in zoom-in-95 duration-150 text-right">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>{language === 'ar' ? 'فشل التثبت: الرمز التسلسلي غير صحيح أو غير مسجل' : 'Invalid Signature Serial'}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed max-w-md">
                    {language === 'ar' 
                      ? `لم يتم العثور على رمز توقيع مطابـق لـ "${searchSerial.trim().toUpperCase()}". يرجى التأكد من كتابة رمز توقيع الفاحص (OM-AUD-...) أو توقيع المدير (OM-DIR-...) أو توقيع المعلم (OM-TCH-...).`
                      : `The signature ledger database produced no records matching "${searchSerial.trim()}". Ensure code starts with OM-AUD-, OM-DIR-, or OM-TCH-.`}
                  </p>
                </div>
              ) : (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/40 flex flex-col items-center justify-center space-y-2">
                  <QrCode className="w-10 h-10 text-purple-300 animate-pulse" />
                  <span className="text-[11px] text-slate-500 font-sans font-medium">
                    {language === 'ar' ? 'أكمل كتابة الرمز واضغط على "تحقق ومطابقة" للتثبت...' : 'Type complete signature serial then click Verify...'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Log list of Signed archives (col-span-12 or col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4">
            <div className="space-y-1 text-right">
              <div className="flex items-center gap-1.5 justify-start">
                <span className="p-1 bg-purple-50 rounded-lg text-purple-700">
                  <Sparkles className="w-4 h-4 stroke-[1.5]" />
                </span>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base font-heading">
                  {language === 'ar' ? 'سجل التوايع والمعاملات المتاحة' : 'Signed Ledger Transactions'}
                </h3>
              </div>
              <p className="text-[11.5px] text-slate-400 font-sans leading-relaxed">
                {language === 'ar' 
                  ? 'قائمة بجميع استمارات الفحص المعتمدة. انقر على أي رمز توقيع (توقيع الفاحص OM-AUD أو المدير OM-DIR) لفحصه ومطابقته فوراً.' 
                  : 'A list of registered signed forms you can verify. Click any signature code to inspect identity credentials.'}
              </p>
            </div>

            <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
              {signedForms.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-150 rounded-2xl text-slate-400 text-[11px] font-sans">
                  {language === 'ar' ? 'لا توجد استمارات موقّعة حالياً للأرشفة.' : 'No signed records reported in ledger logs yet.'}
                </div>
              ) : (
                signedForms.map((form, index) => {
                  const isSelected = selectedVerifiable?.id === form.id;
                  return (
                    <div
                      key={`signed-form-${form.id}-${index}`}
                      className={`p-3.5 border rounded-2xl text-right transition-all space-y-2.5 relative hover:scale-[1.005] ${
                        isSelected 
                          ? 'border-purple-600 bg-purple-50/20 shadow-xs ring-1 ring-purple-600/20' 
                          : 'border-slate-150 bg-slate-50/30 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {/* Available signature badges for this form */}
                      <div className="flex flex-wrap items-center justify-between gap-1 text-right">
                        <div className="flex flex-wrap items-center gap-1">
                          {/* Examiner signature badge */}
                          {form.examinerSignatureQrData && (
                            <button
                              type="button"
                              onClick={() => handleSelectFormDirectly(form, 'examiner')}
                              className="px-2 py-0.5 rounded text-[8px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 hover:bg-purple-200 font-mono tracking-wide cursor-pointer flex items-center gap-0.5"
                              title="انقر لفحص توقيع الفاحص"
                            >
                              <span>🔍</span>
                              <span>{form.examinerSignatureQrData}</span>
                            </button>
                          )}

                          {/* Principal signature badge */}
                          {form.signatureQrData && (
                            <button
                              type="button"
                              onClick={() => handleSelectFormDirectly(form, 'principal')}
                              className="px-2 py-0.5 rounded text-[8px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 font-mono tracking-wide cursor-pointer flex items-center gap-0.5"
                              title="انقر لفحص توقيع مدير المدرسة"
                            >
                              <span>🏛️</span>
                              <span>{form.signatureQrData}</span>
                            </button>
                          )}

                          {/* Teacher signature badge */}
                          {form.teacherSignatureQrData && (
                            <button
                              type="button"
                              onClick={() => handleSelectFormDirectly(form, 'teacher')}
                              className="px-2 py-0.5 rounded text-[8px] font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-300 hover:bg-indigo-200 font-mono tracking-wide cursor-pointer flex items-center gap-0.5"
                              title="انقر لفحص توقيع المعلم"
                            >
                              <span>✍️</span>
                              <span>{form.teacherSignatureQrData}</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[9px] text-slate-400 shrink-0">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {formatSafeDate(form.examinerSignedAt || form.signedAt || form.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Title & metadata summary */}
                      <div 
                        onClick={() => handleSelectFormDirectly(form)}
                        className="space-y-0.5 cursor-pointer"
                      >
                        <h4 className="font-extrabold text-slate-900 text-xs truncate leading-tight font-heading">
                          {form.assessmentTitle || form.subjectName}
                        </h4>
                        <div className="text-[10.5px] text-slate-500 font-sans flex flex-wrap items-center gap-1.5 justify-end">
                          <strong className="text-slate-700 font-bold">{form.schoolName}</strong>
                          <span className="text-slate-300">|</span>
                          <span className="text-purple-950 font-bold">
                            {language === 'ar' ? 'الفاحص: ' : 'Auditor: '}
                            {form.examinerSignedName || form.examinerName || 'أ. سالم الهنائي'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

