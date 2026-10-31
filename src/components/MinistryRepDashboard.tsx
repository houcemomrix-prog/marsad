import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Search, 
  Send, 
  Eye, 
  Stamp, 
  FileCheck, 
  UserCheck, 
  School, 
  BookOpen, 
  Filter, 
  Calendar,
  AlertTriangle,
  Award,
  FileText,
  X,
  Sparkles,
  QrCode,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  LayoutGrid,
  List,
  Home,
  RefreshCw
} from 'lucide-react';
import { ArchivedForm, UserProfile } from '../types';
import { translateSubject, translateGrade } from '../lib/translations';
import { formatSafeDate, formatSafeDateTime } from '../utils/dateUtils';
import { LOGO_MOE_B64 as logoMoe } from '../data/logoDataUrls';

interface MinistryRepDashboardProps {
  userProfile: UserProfile;
  archivedForms: ArchivedForm[];
  language: 'ar' | 'en';
  onSignAndEndorse: (
    archiveId: string,
    repName: string,
    qrData: string,
    decision: string,
    notes: string,
    nextStage: 'admin_transferred_to_principal' | 'completed'
  ) => Promise<void>;
  onOpenOfficialFormPreview?: (form: ArchivedForm) => void;
  onRefreshForms?: () => Promise<void> | void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export const MinistryRepDashboard: React.FC<MinistryRepDashboardProps> = ({
  userProfile,
  archivedForms,
  language,
  onSignAndEndorse,
  onOpenOfficialFormPreview,
  onRefreshForms,
  onSuccess,
  onError
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<'all' | 'pending' | 'endorsed'>('all');
  const [viewMode, setViewMode] = useState<'folders' | 'list'>('folders');
  
  // Folder Navigation State
  const [openedSchoolFolder, setOpenedSchoolFolder] = useState<string | null>(null);
  const [openedSubjectFolder, setOpenedSubjectFolder] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Directive form modal state
  const [selectedFormForDirective, setSelectedFormForDirective] = useState<ArchivedForm | null>(null);
  const [ministerialDecision, setMinisterialDecision] = useState<string>(
    'اعتماد تقرير وتعديلات لجنة الفحص وتثبيتها وتحويلها لمدير المدرسة'
  );
  const [ministerialNotes, setMinisterialNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. STRICT FILTER: Only Non-Conforming Final Inspection Forms (الاستمارات غير المطابقة فقط فقط)
  const strictlyNonConformingForms = useMemo(() => {
    return archivedForms.filter((f) => {
      // Form must be non-conforming or have revisions
      const hasDiscrepancy =
        f.conformanceStatus === 'non-conforming' ||
        f.hasGradeRevisions === true ||
        (f.students && f.students.some(s => 
          (s.notes && ['1', '2', '3', '4', '5', '6'].includes(s.notes.trim())) || 
          (s.notes && s.notes !== 'لا يوجد' && s.notes !== 'مطابق للشروط فنيًا' && s.notes.trim() !== '')
        ));

      // Strictly exclude any form that is explicitly conforming without discrepancies
      if (!hasDiscrepancy && f.conformanceStatus !== 'non-conforming') {
        return false;
      }

      // Must be Final inspection or escalated to ministry rep
      const isFinalOrEscalated =
        f.assessmentType === 'test' ||
        f.type === 'test' ||
        f.assessmentTitle?.includes('نهائي') ||
        f.title?.includes('نهائي') ||
        f.grade === 'الصف الثاني عشر' ||
        f.grade === 'Grade 12' ||
        f.workflowStage === 'transferred_to_ministry_rep' ||
        Boolean(f.ministryRepTransferredAt) ||
        Boolean(f.isMinistryRepSigned);

      return isFinalOrEscalated;
    });
  }, [archivedForms]);

  // 2. Filter by search query & ministerial endorsement stage
  const filteredNonConformingForms = useMemo(() => {
    return strictlyNonConformingForms.filter((f) => {
      const matchesSearch =
        !searchQuery ||
        f.schoolName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.teacherName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.subjectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.examinerName?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterStage === 'pending') {
        return !f.isMinistryRepSigned;
      }
      if (filterStage === 'endorsed') {
        return Boolean(f.isMinistryRepSigned);
      }
      return true;
    });
  }, [strictlyNonConformingForms, searchQuery, filterStage]);

  // 3. LEVEL 1: School Folders Grouping (Only schools with non-conforming forms)
  const schoolFoldersData = useMemo(() => {
    const map = new Map<string, ArchivedForm[]>();
    filteredNonConformingForms.forEach((f) => {
      const school = f.schoolName || 'مدرسة غير محددة';
      if (!map.has(school)) map.set(school, []);
      map.get(school)!.push(f);
    });

    return Array.from(map.entries()).map(([schoolName, forms]) => {
      // Group by subject (only subjects that have non-conforming forms)
      const subjectsMap = new Map<string, ArchivedForm[]>();
      forms.forEach((form) => {
        const subj = form.subjectName || form.subject || 'عام';
        if (!subjectsMap.has(subj)) subjectsMap.set(subj, []);
        subjectsMap.get(subj)!.push(form);
      });

      const pendingCount = forms.filter(f => !f.isMinistryRepSigned).length;
      const endorsedCount = forms.filter(f => Boolean(f.isMinistryRepSigned)).length;

      return {
        schoolName,
        totalForms: forms.length,
        subjectsCount: subjectsMap.size,
        pendingCount,
        endorsedCount,
        forms,
        subjectsMap
      };
    }).sort((a, b) => b.totalForms - a.totalForms);
  }, [filteredNonConformingForms]);

  // 4. LEVEL 2: Subject Cards inside the selected school (Only subjects with non-conforming forms!)
  const selectedSchoolData = useMemo(() => {
    if (!openedSchoolFolder) return null;
    const schoolForms = filteredNonConformingForms.filter(
      (f) => (f.schoolName || 'مدرسة غير محددة') === openedSchoolFolder
    );

    const subjectsMap = new Map<string, ArchivedForm[]>();
    schoolForms.forEach((f) => {
      const subj = f.subjectName || f.subject || 'عام';
      if (!subjectsMap.has(subj)) subjectsMap.set(subj, []);
      subjectsMap.get(subj)!.push(f);
    });

    // Only include subjects that actually have non-conforming forms!
    const subjectCards = Array.from(subjectsMap.entries()).map(([subjectName, forms]) => {
      const pendingCount = forms.filter(f => !f.isMinistryRepSigned).length;
      const endorsedCount = forms.filter(f => Boolean(f.isMinistryRepSigned)).length;
      return {
        subjectName,
        formsCount: forms.length,
        pendingCount,
        endorsedCount,
        forms
      };
    }).sort((a, b) => b.formsCount - a.formsCount);

    const pendingTotal = schoolForms.filter(f => !f.isMinistryRepSigned).length;
    const endorsedTotal = schoolForms.filter(f => Boolean(f.isMinistryRepSigned)).length;

    return {
      schoolName: openedSchoolFolder,
      totalForms: schoolForms.length,
      pendingTotal,
      endorsedTotal,
      forms: schoolForms,
      subjectCards
    };
  }, [openedSchoolFolder, filteredNonConformingForms]);

  // 5. LEVEL 3: Forms for selected subject in selected school
  const selectedSubjectForms = useMemo(() => {
    if (!openedSchoolFolder || !openedSubjectFolder) return [];
    return filteredNonConformingForms.filter(
      (f) =>
        (f.schoolName || 'مدرسة غير محددة') === openedSchoolFolder &&
        (f.subjectName || f.subject || 'عام') === openedSubjectFolder
    );
  }, [openedSchoolFolder, openedSubjectFolder, filteredNonConformingForms]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = strictlyNonConformingForms.length;
    const pending = strictlyNonConformingForms.filter((f) => !f.isMinistryRepSigned).length;
    const endorsed = strictlyNonConformingForms.filter((f) => f.isMinistryRepSigned).length;
    const schoolsCount = new Set(strictlyNonConformingForms.map(f => f.schoolName)).size;
    return { total, pending, endorsed, schoolsCount };
  }, [strictlyNonConformingForms]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshForms?.();
      onSuccess?.(language === 'ar' ? 'تم تحديث استمارات ممثل الوزارة بنجاح!' : 'Ministry representative records refreshed!');
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleOpenDirectiveModal = (form: ArchivedForm) => {
    setSelectedFormForDirective(form);
    setMinisterialDecision(
      form.ministryRepDecision || 'اعتماد تقرير وتعديلات لجنة الفحص وتثبيتها وتحويلها لمدير المدرسة'
    );
    setMinisterialNotes(
      form.ministryRepNotes ||
        `بناءً على نتائج الفحص والتدقيق النهائي، يُعتمد تقرير لجنة الفحص وتُثبت الدرجات المعدلة وفق الضوابط واللوائح الوزارية، وتُحال الاستمارة إلى إدارة المدرسة للتوقيع والختم.`
    );
  };

  const handleSubmitDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFormForDirective) return;
    if (!ministerialNotes.trim()) {
      onError?.(language === 'ar' ? 'يرجى كتابة نص التوجيه والقرار الوزاري.' : 'Please enter the ministerial directive notes.');
      return;
    }

    setIsSubmitting(true);
    try {
      const repName = userProfile.name || 'ممثل وزارة التربية والتعليم';
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrData = `OM-MOE-MIN-REP-${randomCode}`;

      await onSignAndEndorse(
        selectedFormForDirective.id,
        repName,
        qrData,
        ministerialDecision,
        ministerialNotes.trim(),
        'admin_transferred_to_principal'
      );

      onSuccess?.(
        language === 'ar'
          ? `تم اعتماد القرار والتوجيه الوزاري بنجاح وتحويل الاستمارة لمدير المدرسة!`
          : `Ministerial decision endorsed and form forwarded to school principal!`
      );
      setSelectedFormForDirective(null);
      await onRefreshForms?.();
    } catch (err: any) {
      console.error(err);
      onError?.(err?.message || (language === 'ar' ? 'فشل حفظ القرار الوزاري' : 'Failed to save ministerial decision'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render individual form card
  const renderFormCard = (form: ArchivedForm) => {
    const isEndorsed = Boolean(form.isMinistryRepSigned);
    const modifiedStudentsCount = (form.students || []).filter(
      s => (s.notes && ['1', '2', '3', '4', '5', '6'].includes(s.notes.trim())) || 
           (s.notes && s.notes !== 'لا يوجد' && s.notes !== 'مطابق للشروط فنيًا' && s.notes.trim() !== '')
    ).length;

    return (
      <div
        key={form.id}
        className={`bg-white rounded-3xl border-2 transition-all p-5 sm:p-6 shadow-sm hover:shadow-md ${
          isEndorsed 
            ? 'border-emerald-300 bg-emerald-50/15' 
            : 'border-rose-300 bg-rose-50/10 ring-1 ring-rose-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#821315] text-white flex items-center justify-center font-black text-lg shrink-0 shadow-xs">
              {(form.teacherName || 'م')[0]}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                  <span>{language === 'ar' ? 'فحص نهائي: غير مطابقة' : 'Final Audit: Non-Conforming'}</span>
                </span>
                
                {isEndorsed ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-[#0b5e32] border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0b5e32]" />
                    <span>{language === 'ar' ? '✓ تم توقيع واعتماد ممثل الوزارة' : '✓ Endorsed by Ministry Rep'}</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-800" />
                    <span>{language === 'ar' ? 'بانتظار قرار ممثل الوزارة' : 'Awaiting Decision'}</span>
                  </span>
                )}

                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                  {translateGrade(form.grade, language)}
                </span>
              </div>

              <h3 className="text-base font-black text-slate-900 mt-1">
                {form.assessmentTitle || `استمارة فحص نهائي — ${form.teacherName}`}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-bold mt-1">
                <span className="inline-flex items-center gap-1 text-slate-800">
                  <School className="w-3.5 h-3.5 text-[#821315]" />
                  {form.schoolName}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-indigo-800">
                  <BookOpen className="w-3.5 h-3.5" />
                  {translateSubject(form.subjectName || form.subject, language)}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-slate-700">
                  <UserCheck className="w-3.5 h-3.5 text-teal-700" />
                  {form.teacherName}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                  <Calendar className="w-3.5 h-3.5" />
                  {form.visitDate || formatSafeDate(form.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {onOpenOfficialFormPreview && (
              <button
                type="button"
                onClick={() => onOpenOfficialFormPreview(form)}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Eye className="w-3.5 h-3.5 text-amber-300" />
                <span>{language === 'ar' ? 'معاينة الاستمارة الرسمية' : 'View Official Form'}</span>
              </button>
            )}

            {!isEndorsed ? (
              <button
                type="button"
                onClick={() => handleOpenDirectiveModal(form)}
                className="px-4 py-2 bg-[#821315] hover:bg-[#6c1012] text-white font-black text-xs rounded-xl cursor-pointer shadow-md transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Stamp className="w-4 h-4 text-amber-300" />
                <span>{language === 'ar' ? 'إصدار القرار والتوجيه الوزاري' : 'Issue Directive & Endorse'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenDirectiveModal(form)}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#0b5e32] border border-emerald-300 font-black text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-[#0b5e32]" />
                <span>{language === 'ar' ? 'تعديل التوجيه الوزاري' : 'Edit Directive'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Audit Discrepancy Breakdown Box */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-white rounded-2xl border border-slate-200">
            <span className="text-[10.5px] font-extrabold text-slate-400 block uppercase">
              {language === 'ar' ? 'الفاحص المعتمد:' : 'Certified Examiner:'}
            </span>
            <p className="font-black text-slate-800 mt-0.5">{form.examinerName || 'فاحص المادة'}</p>
            <span className="text-[10.5px] text-indigo-700 font-mono mt-1 block">
              {form.examinerSignatureQrData || 'OM-EXM-VERIFIED'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-slate-200">
            <span className="text-[10.5px] font-extrabold text-slate-400 block uppercase">
              {language === 'ar' ? 'عينات الطلاب المعدلة درجاتهم:' : 'Modified Student Samples:'}
            </span>
            <p className="font-black text-red-900 mt-0.5">
              {modifiedStudentsCount} {language === 'ar' ? 'طلاب تم تعديل درجاتهم' : 'Modified Students'}
            </p>
            <span className="text-[10.5px] text-slate-500 mt-1 block">
              {language === 'ar' ? 'أسباب التعديل: 1 إلى 6 مسجلة بالجدول' : 'Reason codes 1-6 logged'}
            </span>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-slate-200">
            <span className="text-[10.5px] font-extrabold text-slate-400 block uppercase">
              {language === 'ar' ? 'حالة التحويل من مدير النظام:' : 'Admin Forward Status:'}
            </span>
            <p className="font-black text-slate-800 mt-0.5">
              {form.ministryRepTransferredBy || form.adminReviewedBy || 'أ. حسام عمري (مدير النظام)'}
            </p>
            <span className="text-[10.5px] text-slate-500 font-mono mt-1 block">
              {form.ministryRepTransferredAt ? formatSafeDateTime(form.ministryRepTransferredAt, 'ar-OM') : 'محولة للاختصاص'}
            </span>
          </div>
        </div>

        {/* If already endorsed, show the issued decision */}
        {isEndorsed && form.ministryRepDecision && (
          <div className="mt-3.5 p-3.5 bg-emerald-50 border border-emerald-300/80 rounded-2xl text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-black text-[#0b5e32] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#0b5e32]" />
                <span>{language === 'ar' ? 'قرار وتوجيه ممثل الوزارة المعتمد:' : 'Endorsed Ministerial Decision:'}</span>
              </span>
              <span className="font-mono text-[10.5px] text-slate-500">
                {form.ministryRepSignedAt ? formatSafeDateTime(form.ministryRepSignedAt, 'ar-OM') : ''}
              </span>
            </div>
            <p className="text-slate-800 font-black text-xs leading-relaxed">
              {form.ministryRepDecision}
            </p>
            {form.ministryRepNotes && (
              <p className="text-slate-700 font-medium text-[11.5px] leading-relaxed pt-1 border-t border-emerald-200/60 whitespace-pre-wrap">
                {form.ministryRepNotes}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Top Ministerial Banner */}
      <div className="bg-gradient-to-r from-[#4a0d18] via-[#821315] to-[#3a0812] text-white rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-amber-500/30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 p-2 border border-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
              <img src={logoMoe} alt="وزارة التربية والتعليم" className="w-full h-full object-contain filter drop-shadow" />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-xs flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-slate-950" />
                  <span>{language === 'ar' ? 'حساب معتمد: ممثل الوزارة' : 'Authorized: Ministry Representative'}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-white/15 text-amber-200 border border-white/20">
                  {userProfile.directorate || 'ديوان عام وزارة التربية والتعليم'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/30 text-rose-100 border border-rose-400/40">
                  {language === 'ar' ? 'الاستمارات غير المطابقة فقط' : 'Non-Conforming Forms Only'}
                </span>
              </div>
              
              <h2 className="text-xl sm:text-2xl font-black text-white font-heading">
                {language === 'ar' ? 'منصة ممثل الوزارة — حوكمة استمارات الفحص النهائي غير المطابقة' : 'Ministry Representative Portal — Non-Conforming Final Audits'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-200/90 max-w-2xl leading-relaxed">
                {language === 'ar'
                  ? 'يحتوي هذا الحساب حصرياً على الاستمارات غير المطابقة فقط، مقسمة حسب مجلدات المدارس وداخل كل مدرسة تجد المواد التي رُصدت بها عدم مطابقة، لإصدار القرارات والتوجيهات الوزارية الملزمة والمصادقة الرقمية.'
                  : 'Contains strictly non-conforming final inspection forms grouped by school folders, with non-conforming subject sub-ledgers and circular badge counters.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="w-full sm:w-auto px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 text-amber-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{language === 'ar' ? 'تحديث البيانات' : 'Refresh'}</span>
            </button>

            <div className="w-full sm:w-auto px-4 py-2.5 bg-black/25 rounded-2xl border border-white/15 text-center">
              <span className="text-[10.5px] font-bold text-amber-300 block">
                {language === 'ar' ? 'الصفة الوزارية:' : 'Official Title:'}
              </span>
              <span className="text-xs font-black text-white">
                {userProfile.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setFilterStage('all')}
          className={`p-5 rounded-2xl border transition-all text-right cursor-pointer flex items-center justify-between ${
            filterStage === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-xs'
          }`}
        >
          <div>
            <p className="text-xs font-extrabold opacity-80 mb-1">
              {language === 'ar' ? 'إجمالي الاستمارات غير المطابقة' : 'Total Non-Conforming Forms'}
            </p>
            <h3 className="text-2xl font-black font-mono">
              {stats.total}
            </h3>
            <span className="text-[10.5px] opacity-75 mt-1 block">
              {language === 'ar' ? `موزعة على (${stats.schoolsCount}) مدارس` : `Across ${stats.schoolsCount} schools`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#821315]/10 text-[#821315] flex items-center justify-center font-black">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStage('pending')}
          className={`p-5 rounded-2xl border transition-all text-right cursor-pointer flex items-center justify-between ${
            filterStage === 'pending'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-xs'
          }`}
        >
          <div>
            <p className="text-xs font-extrabold opacity-90 mb-1">
              {language === 'ar' ? 'بانتظار قرار وتوجيه ممثل الوزارة' : 'Awaiting Ministry Decision'}
            </p>
            <h3 className="text-2xl font-black font-mono">
              {stats.pending}
            </h3>
            <span className="text-[10.5px] opacity-75 mt-1 block">
              {language === 'ar' ? 'تتطلب المصادقة والتوجيه' : 'Action required'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStage('endorsed')}
          className={`p-5 rounded-2xl border transition-all text-right cursor-pointer flex items-center justify-between ${
            filterStage === 'endorsed'
              ? 'bg-[#0b5e32] text-white border-emerald-800 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-xs'
          }`}
        >
          <div>
            <p className="text-xs font-extrabold opacity-80 mb-1">
              {language === 'ar' ? 'تم اعتمادها وإحالتها لإدارة المدرسة' : 'Endorsed & Forwarded to Principal'}
            </p>
            <h3 className="text-2xl font-black font-mono">
              {stats.endorsed}
            </h3>
            <span className="text-[10.5px] opacity-75 mt-1 block">
              {language === 'ar' ? 'معتمدة بالختم الرقمي' : 'Digitally certified'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#0b5e32] flex items-center justify-center font-black">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </button>
      </div>

      {/* Filter, Search & View Mode Switcher */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 rtl:right-3.5 ltr:left-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ar' ? 'ابحث باسم المدرسة، المعلم، المادة، أو الفاحص...' : 'Search by school, teacher, subject, or examiner...'}
            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#821315] focus:bg-white transition-all"
          />
        </div>

        {/* View Switcher: Folders vs List */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('folders')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'folders'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            <span>{language === 'ar' ? 'مجلدات المدارس والمواد' : 'Folders View'}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5 text-amber-300" />
            <span>{language === 'ar' ? 'القائمة المباشرة' : 'Direct List'}</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      {viewMode === 'folders' ? (
        <div className="space-y-6">
          {/* LEVEL 1: School Folders Grid */}
          {!openedSchoolFolder ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                    <Folder className="w-5 h-5 fill-amber-500 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {language === 'ar'
                        ? 'مجلدات المدارس التي بها استمارات غير مطابقة'
                        : 'School Folders with Non-Conforming Forms'}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold">
                      {language === 'ar'
                        ? 'اختر مدرسة لفتح مجلدها والاطلاع على المواد التي بها عدم مطابقة'
                        : 'Select a school to open its folder and view non-conforming subjects'}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-black text-rose-800 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                  <span>
                    {schoolFoldersData.length}{' '}
                    {language === 'ar' ? 'مدارس لديها استمارات غير مطابقة' : 'Schools with discrepancies'}
                  </span>
                </span>
              </div>

              {schoolFoldersData.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center text-3xl shadow-xs">
                    🛡️
                  </div>
                  <h4 className="font-black text-slate-800 text-base">
                    {language === 'ar' ? 'لا توجد مدارس بها استمارات غير مطابقة حالياً' : 'No schools with non-conforming forms found'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {language === 'ar'
                      ? 'يحتوي هذا الحساب حصرياً على الاستمارات غير المطابقة فقط فقط. جميع الاستمارات الحالية مطابقة أو لم يتم تحويل استمارات غير مطابقة بعد.'
                      : 'This view exclusively shows non-conforming final inspection forms.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {schoolFoldersData.map((sch) => (
                    <button
                      key={sch.schoolName}
                      type="button"
                      onClick={() => {
                        setOpenedSchoolFolder(sch.schoolName);
                        setOpenedSubjectFolder(null);
                      }}
                      className="bg-white hover:bg-amber-50/20 border-2 border-amber-200/90 hover:border-[#821315] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all text-right rtl:text-right ltr:text-left cursor-pointer group relative overflow-hidden flex flex-col justify-between"
                    >
                      {/* Top colored accent strip */}
                      <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-[#821315] to-[#4a0d18]" />

                      {/* Corner Floating Counter Badge for School */}
                      <div
                        className="absolute -top-2.5 -right-2.5 rtl:-right-2.5 ltr:-left-2.5 z-20 w-8.5 h-8.5 rounded-full font-black text-xs flex items-center justify-center shadow-md ring-4 ring-white border bg-rose-600 text-white border-rose-700"
                        title={`${sch.totalForms} استمارة غير مطابقة`}
                      >
                        {sch.totalForms}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-4 pt-1">
                          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                            <Folder className="w-7 h-7 fill-amber-400 text-amber-700" />
                          </div>
                          
                          <div className="flex flex-col items-end gap-1">
                            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[11px] font-black rounded-full border border-rose-300">
                              {sch.totalForms} {language === 'ar' ? 'استمارة غير مطابقة' : 'Discrepant Forms'}
                            </span>
                            {sch.pendingCount > 0 ? (
                              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {sch.pendingCount} {language === 'ar' ? 'بانتظار القرار' : 'Pending'}
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {language === 'ar' ? '✓ تم اعتمادها' : '✓ Endorsed'}
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="text-base font-black text-slate-900 mb-1.5 group-hover:text-[#821315] transition-colors leading-snug">
                          {sch.schoolName}
                        </h4>

                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 mt-2">
                          <BookOpen className="w-4 h-4 text-indigo-700" />
                          <span>
                            {language === 'ar'
                              ? `المواد التي بها عدم مطابقة: (${sch.subjectsCount}) مواد`
                              : `Contains (${sch.subjectsCount}) non-conforming subjects`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-[#821315]">
                        <span>{language === 'ar' ? 'فتح مجلد المدرسة واستعراض المواد' : 'Open School Folder'}</span>
                        <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !openedSubjectFolder ? (
            /* LEVEL 2: Non-conforming Subject Cards inside Opened School Folder with Corner Floating Badge */
            <div className="space-y-5">
              {/* Breadcrumb Navigation */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenedSchoolFolder(null);
                      setOpenedSubjectFolder(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'كل مجلدات المدارس' : 'All School Folders'}</span>
                  </button>
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  <span className="inline-flex items-center gap-1.5 text-slate-900 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-300">
                    <FolderOpen className="w-4 h-4 text-amber-600 fill-amber-300" />
                    <span>{openedSchoolFolder}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenedSchoolFolder(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  <span>{language === 'ar' ? 'العودة لقائمة المدارس' : 'Back to Schools'}</span>
                </button>
              </div>

              {/* School Banner */}
              <div className="bg-gradient-to-r from-[#4a0d18] via-[#821315] to-[#5a101a] text-white rounded-3xl p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <School className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-black text-amber-300">
                      {language === 'ar' ? 'مجلد المدرسة المحدد:' : 'Selected School Folder:'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black">{openedSchoolFolder}</h3>
                  <p className="text-xs text-amber-100/90 mt-1 max-w-xl">
                    {language === 'ar'
                      ? 'المواد التي فيها عدم مطابقة داخل هذه المدرسة. يظهر في ركن كل مادة دائرة بها عدد الاستمارات غير المطابقة.'
                      : 'Non-conforming subjects within this school. Each subject card has a corner badge displaying the count of non-conforming forms.'}
                  </p>
                </div>
                
                <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                  <div className="p-3 bg-white/10 rounded-2xl border border-white/20 text-center">
                    <span className="text-2xl font-black font-mono block">{selectedSchoolData?.totalForms || 0}</span>
                    <span className="text-[10px] font-bold text-amber-200">{language === 'ar' ? 'استمارة غير مطابقة' : 'Discrepant Forms'}</span>
                  </div>
                  <div className="p-3 bg-white/10 rounded-2xl border border-white/20 text-center">
                    <span className="text-2xl font-black font-mono block">{selectedSchoolData?.subjectCards.length || 0}</span>
                    <span className="text-[10px] font-bold text-amber-200">{language === 'ar' ? 'مواد بها ملاحظات' : 'Subjects'}</span>
                  </div>
                </div>
              </div>

              {/* Subject Cards Grid (ONLY non-conforming subjects!) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-700" />
                    <span>{language === 'ar' ? 'المواد التي بها عدم مطابقة (اختر المادة لفتح استماراتها):' : 'Subjects with Discrepancies:'}</span>
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    {selectedSchoolData?.subjectCards.length} {language === 'ar' ? 'مواد رُصدت بها عدم مطابقة' : 'subjects found'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
                  {selectedSchoolData?.subjectCards.map((subj) => (
                    <button
                      key={subj.subjectName}
                      type="button"
                      onClick={() => setOpenedSubjectFolder(subj.subjectName)}
                      className="relative p-6 rounded-3xl border-2 text-right rtl:text-right ltr:text-left transition-all flex flex-col justify-between bg-white hover:bg-rose-50/30 border-rose-200 hover:border-rose-400 shadow-md hover:shadow-lg cursor-pointer group scale-[1.01]"
                    >
                      {/* CORNER FLOATING CIRCULAR BADGE DISPLAYING COUNT OF NON-CONFORMING FORMS */}
                      <div
                        className="absolute -top-3 -right-3 rtl:-right-3 ltr:-left-3 z-20 w-9 h-9 rounded-full font-black text-xs flex items-center justify-center shadow-lg ring-4 ring-white border bg-rose-600 text-white border-rose-700 animate-pulse scale-105"
                        title={`${subj.subjectName}: ${subj.formsCount} استمارة غير مطابقة`}
                      >
                        {subj.formsCount}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center font-black group-hover:scale-110 transition-transform shadow-xs">
                            <BookOpen className="w-6 h-6 text-rose-700" />
                          </div>

                          <span className="px-2.5 py-1 text-[11px] font-black rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                            <span>{subj.formsCount} {language === 'ar' ? 'استمارة غير مطابقة' : 'Forms'}</span>
                          </span>
                        </div>

                        <h4 className="text-base font-black text-slate-900 group-hover:text-[#821315] transition-colors mb-1">
                          {translateSubject(subj.subjectName, language)}
                        </h4>
                        
                        <p className="text-xs text-slate-500 font-bold mb-3">
                          {language === 'ar' ? 'فحص نهائي — تتطلب الاعتماد والتوجيه الوزاري' : 'Final Inspection Audit'}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
                          {subj.pendingCount > 0 ? (
                            <span className="text-[11px] font-black text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>{subj.pendingCount} {language === 'ar' ? 'بانتظار القرار الوزاري' : 'Pending'}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-black text-[#0b5e32] bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-[#0b5e32]" />
                              <span>{language === 'ar' ? 'تم اعتماد جميع الاستمارات' : 'All Endorsed'}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-[#821315]">
                        <span>{language === 'ar' ? 'فتح استمارات هذه المادة' : 'Open Subject Forms'}</span>
                        <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* LEVEL 3: Non-Conforming Forms inside Opened School & Opened Subject */
            <div className="space-y-5">
              {/* Breadcrumb Navigation */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenedSchoolFolder(null);
                      setOpenedSubjectFolder(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'كل مجلدات المدارس' : 'All School Folders'}</span>
                  </button>
                  
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  
                  <button
                    type="button"
                    onClick={() => setOpenedSubjectFolder(null)}
                    className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    <span>{openedSchoolFolder}</span>
                  </button>
                  
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  
                  <span className="inline-flex items-center gap-1.5 text-rose-900 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-300">
                    <BookOpen className="w-3.5 h-3.5 text-rose-700" />
                    <span>{translateSubject(openedSubjectFolder, language)}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenedSubjectFolder(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  <span>{language === 'ar' ? 'العودة لمواد المدرسة' : 'Back to Subjects'}</span>
                </button>
              </div>

              {/* Subject Title Banner */}
              <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black">
                      {openedSchoolFolder} ⬅ {translateSubject(openedSubjectFolder, language)}
                    </h3>
                    <p className="text-xs text-slate-300">
                      {language === 'ar'
                        ? 'الاستمارات غير المطابقة في هذه المادة — يمكنك معاينة الاستمارة الرسمية وإصدار القرار والتوجيه الوزاري'
                        : 'Non-conforming forms for this subject — view official form and endorse directives'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-black">
                    {selectedSubjectForms.length} {language === 'ar' ? 'استمارة غير مطابقة' : 'Forms'}
                  </span>
                </div>
              </div>

              {/* Forms List for this Subject */}
              <div className="space-y-4">
                {selectedSubjectForms.map(renderFormCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* FLAT LIST VIEW MODE */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-black text-slate-800">
              {language === 'ar' ? 'جميع استمارات الفحص النهائي غير المطابقة:' : 'All Non-Conforming Final Audit Forms:'}
            </h3>
            <span className="text-xs font-bold text-slate-500">
              {filteredNonConformingForms.length} {language === 'ar' ? 'استمارة معروضة' : 'Forms shown'}
            </span>
          </div>

          {filteredNonConformingForms.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center text-3xl shadow-xs">
                🛡️
              </div>
              <h4 className="font-black text-slate-800 text-base">
                {language === 'ar' ? 'لا توجد استمارات غير مطابقة مطابقة لمعايير البحث' : 'No forms match the search criteria'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {language === 'ar'
                  ? 'حساب ممثل الوزارة مخصص حصرياً للاستمارات غير المطابقة فقط.'
                  : 'Ministry representative account is strictly reserved for non-conforming forms.'}
              </p>
            </div>
          ) : (
            filteredNonConformingForms.map(renderFormCard)
          )}
        </div>
      )}

      {/* Ministerial Directives Modal */}
      {selectedFormForDirective && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border-2 border-[#821315] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#821315] to-[#4a0d18] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg">
                  ⚖️
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    {language === 'ar' ? 'إصدار القرار والتوجيه الوزاري لممثل الوزارة' : 'Issue Ministerial Directive & Endorsement'}
                  </h3>
                  <p className="text-xs text-amber-200">
                    {selectedFormForDirective.schoolName} — {translateSubject(selectedFormForDirective.subjectName || selectedFormForDirective.subject, language)} — {selectedFormForDirective.teacherName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFormForDirective(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitDirective} className="p-6 space-y-4 text-right" dir="rtl">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-black text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>تنبيه عدم المطابقة بالفحص النهائي:</span>
                </div>
                <p className="text-slate-700 leading-relaxed font-medium">
                  تبين وجود تعديلات في درجات الطلاب وملاحظات فنية من لجنة الفحص. بصفتك ممثل الوزارة، يرجى اعتماد التوجيه الوزاري الملزم لإدارة المدرسة والمعلم.
                </p>
              </div>

              {/* Decision select */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  القرار الوزاري المعتمد:
                </label>
                <select
                  value={ministerialDecision}
                  onChange={(e) => setMinisterialDecision(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#821315] cursor-pointer"
                >
                  <option value="اعتماد تقرير وتعديلات لجنة الفحص وتثبيتها وتحويلها لمدير المدرسة">
                    1. اعتماد تقرير وتعديلات لجنة الفحص وتثبيتها وتحويلها لمدير المدرسة
                  </option>
                  <option value="المصادقة على نتائج الفحص مع التوجيه بلفت نظر فني لإدارة المدرسة والمعلم">
                    2. المصادقة على نتائج الفحص مع التوجيه بلفت نظر فني لإدارة المدرسة والمعلم
                  </option>
                  <option value="إلزام المدرسة بإعادة مراجعة دفاتر الطلاب وتصحيح المشغولات طبقاً للوثيقة">
                    3. إلزام المدرسة بإعادة مراجعة دفاتر الطلاب وتصحيح المشغولات طبقاً للوثيقة
                  </option>
                  <option value="اعتماد استثنائي ومصادقة نهائية مشروطة بمتابعة المشرف التربوي الزائر">
                    4. اعتماد استثنائي ومصادقة نهائية مشروطة بمتابعة المشرف التربوي الزائر
                  </option>
                </select>
              </div>

              {/* Ministerial notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  التوجيهات والقرارات الوزارية (تظهر رسمياً في الاستمارة والأرشيف):
                </label>
                <textarea
                  rows={4}
                  required
                  value={ministerialNotes}
                  onChange={(e) => setMinisterialNotes(e.target.value)}
                  placeholder="اكتب التوجيه الوزاري والقرار الصادر بشأن هذه الاستمارة..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#821315] leading-relaxed"
                />
              </div>

              {/* Electronic Signature Badge info */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#821315]" />
                  <div>
                    <span className="font-black text-slate-800 block">التوقيع الرقمي والختم الوزاري:</span>
                    <span className="text-[11px] text-slate-500 font-mono">OM-MOE-MIN-REP (معتمد بالساعة والتاريخ)</span>
                  </div>
                </div>
                <span className="px-3 py-1 bg-[#821315]/10 text-[#821315] font-black rounded-lg text-xs">
                  {userProfile.name}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedFormForDirective(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-xs font-black text-white bg-gradient-to-r from-[#821315] to-[#a31a1d] hover:brightness-110 rounded-xl shadow-md cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  <Stamp className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الاعتماد والتحويل...' : 'اعتماد القرار وتحويل الاستمارة لمدير المدرسة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
