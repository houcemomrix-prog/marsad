import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  FileCheck,
  Send,
  ShieldCheck,
  UserCheck,
  School,
  BookOpen,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Eye,
  Sparkles,
  Check,
  AlertCircle,
  Filter,
  QrCode,
  Stamp,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  Home,
  LayoutGrid,
  List,
  Building2
} from 'lucide-react';
import { ArchivedForm, UserProfile } from '../types';
import { translateSubject, translateGrade, isSubjectMatch, isUniversalSubject } from '../lib/translations';
import { formatSafeDate } from '../utils/dateUtils';
import principalStampUrl, { getActiveStamp } from './OmanPrincipalStamp';

interface FormTrackerViewProps {
  archivedForms: ArchivedForm[];
  userProfile: UserProfile | null;
  language: 'ar' | 'en';
  onRefresh?: () => Promise<void> | void;
  onOpenInArchive?: (form: ArchivedForm) => void;
  onTransferToPrincipal?: (archiveId: string, adminName: string) => Promise<void>;
  onSignPrincipal?: (archiveId: string, principalName: string, qrData: string, stampUrl?: string) => Promise<void>;
  onSignTeacher?: (archiveId: string, teacherName: string, qrData: string) => Promise<void>;
  onSignExaminer?: (
    archiveId: string,
    examinerName: string,
    qrData: string,
    conformanceStatus?: 'conforming' | 'non-conforming',
    hasGradeRevisions?: boolean
  ) => Promise<void>;
  onSuccess?: (msg: string) => void;
}

type TrackerStageFilter =
  | 'all'
  | 'stage_1_examiner'
  | 'stage_2_admin'
  | 'stage_3_principal'
  | 'stage_4_teacher'
  | 'completed';

export function getFormComputedStage(form: ArchivedForm): {
  stageNumber: 1 | 2 | 3 | 4 | 5;
  stageKey: 'stage_1_examiner' | 'stage_2_admin' | 'stage_3_principal' | 'stage_4_teacher' | 'completed';
  progressPercent: number;
  labelAr: string;
  labelEn: string;
  nextActorAr: string;
  nextActorEn: string;
  badgeColor: string;
} {
  const isCompleted =
    form.workflowStage === 'completed' || (Boolean(form.isSigned) && Boolean(form.isTeacherSigned));
  const isPrincipalSigned =
    form.workflowStage === 'principal_signed_transferred_to_teacher' || Boolean(form.isSigned);
  const isAdminTransferred =
    form.workflowStage === 'admin_transferred_to_principal' ||
    Boolean(form.adminReviewedBy) ||
    Boolean(form.adminReviewedAt);
  const isExaminerSigned = Boolean(form.isExaminerSigned);

  if (isCompleted) {
    return {
      stageNumber: 5,
      stageKey: 'completed',
      progressPercent: 100,
      labelAr: 'مكتملة ومعتمدة نهائياً (4/4)',
      labelEn: 'Completed & Certified (4/4)',
      nextActorAr: 'تم استكمال جميع التواقيع والأرشفة الوزارية',
      nextActorEn: 'All signatures completed and archived',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    };
  }

  if (isPrincipalSigned) {
    return {
      stageNumber: 4,
      stageKey: 'stage_4_teacher',
      progressPercent: 75,
      labelAr: 'المرحلة 4: بانتظار توقيع المعلم بالعلم',
      labelEn: 'Stage 4: Awaiting Teacher Signature',
      nextActorAr: `معلم المادة (${form.teacherName || 'المعلم'}) — التوقيع بالعلم والمراجعة`,
      nextActorEn: `Subject Teacher (${form.teacherName || 'Teacher'}) — Sign to Acknowledge`,
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300'
    };
  }

  if (isAdminTransferred) {
    return {
      stageNumber: 3,
      stageKey: 'stage_3_principal',
      progressPercent: 50,
      labelAr: 'المرحلة 3: محولة لمدير المدرسة للتوقيع والختم',
      labelEn: 'Stage 3: Transferred to School Principal for Sign & Stamp',
      nextActorAr: `مدير المدرسة (${form.schoolName || 'المدرسة'}) — التوقيع والختم والتحويل للمعلم`,
      nextActorEn: `School Principal (${form.schoolName || 'School'}) — Sign, Stamp & Forward to Teacher`,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300'
    };
  }

  if (isExaminerSigned || form.workflowStage === 'examiner_submitted_to_admin') {
    return {
      stageNumber: 2,
      stageKey: 'stage_2_admin',
      progressPercent: 25,
      labelAr: 'المرحلة 2: بانتظار تحويل مدير النظام لمدير المدرسة',
      labelEn: 'Stage 2: Awaiting System Admin Transfer to Principal',
      nextActorAr: 'مدير النظام — مراجعة الاستمارة وتحويلها لمدير المدرسة',
      nextActorEn: 'System Admin — Review & Transfer to School Principal',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300'
    };
  }

  return {
    stageNumber: 1,
    stageKey: 'stage_1_examiner',
    progressPercent: 10,
    labelAr: 'المرحلة 1: بانتظار توقيع الفاحص / المدقق',
    labelEn: 'Stage 1: Awaiting Examiner Signature',
    nextActorAr: `فاحص المادة (${form.examinerName || 'المدقق'}) — استكمال الفحص والتوقيع`,
    nextActorEn: `Subject Examiner (${form.examinerName || 'Examiner'}) — Complete Audit & Sign`,
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300'
  };
}

export function FormTrackerView({
  archivedForms,
  userProfile,
  language,
  onRefresh,
  onOpenInArchive,
  onTransferToPrincipal,
  onSignPrincipal,
  onSignTeacher,
  onSignExaminer,
  onSuccess
}: FormTrackerViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<TrackerStageFilter>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingFormId, setProcessingFormId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  // Folder navigation and view mode state
  const [viewMode, setViewMode] = useState<'folders' | 'list'>('folders');
  const [openedSchoolFolder, setOpenedSchoolFolder] = useState<string | null>(null);
  const [openedSubjectFolder, setOpenedSubjectFolder] = useState<string | null>(null);

  // Today's ISO date string
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Available unique dates from forms
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    archivedForms.forEach((f) => {
      const d = f.visitDate || (f.createdAt ? f.createdAt.split('T')[0] : '');
      if (d) set.add(d);
    });
    return Array.from(set).sort().reverse();
  }, [archivedForms]);

  // Selected date filter (defaults to today if present, or first available date, or 'all')
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(() => {
    if (availableDates.includes(todayIso)) return todayIso;
    return availableDates[0] || 'all';
  });

  // Update sync timestamp whenever archivedForms changes in real time
  useEffect(() => {
    setLastSyncTime(
      new Date().toLocaleTimeString(language === 'ar' ? 'ar-OM' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
  }, [archivedForms, language]);

  // Listen to storage and custom real-time events to update timestamp immediately
  useEffect(() => {
    const handleSyncPulse = () => {
      setLastSyncTime(
        new Date().toLocaleTimeString(language === 'ar' ? 'ar-OM' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    };
    window.addEventListener('oman_moe_archived_forms_updated', handleSyncPulse);
    return () => window.removeEventListener('oman_moe_archived_forms_updated', handleSyncPulse);
  }, [language]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      setLastSyncTime(
        new Date().toLocaleTimeString(language === 'ar' ? 'ar-OM' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    } finally {
      setTimeout(() => setIsRefreshing(false), 350);
    }
  };

  // Role-aware scoping (while keeping full visibility of relevant forms)
  const roleScopedForms = useMemo(() => {
    if (!userProfile) return archivedForms;
    if (userProfile.role === 'admin') return archivedForms;

    if (userProfile.role === 'moderator') {
      if (userProfile.subject && !isUniversalSubject(userProfile.subject)) {
        const subjectMatches = archivedForms.filter((f) => {
          const s = f.subject || f.subjectName;
          return Boolean(s) && isSubjectMatch(userProfile.subject!, s);
        });
        return subjectMatches.length > 0 ? subjectMatches : archivedForms;
      }
      return archivedForms;
    }

    if (userProfile.role === 'school') {
      const userSchool = (userProfile.schoolName || '').trim();
      const schoolMatches = archivedForms.filter((f) => {
        if (!userSchool || !f.schoolName) return true;
        const s1 = f.schoolName.replace(/(مدرسة|للتعليم|الأساسي|الأساسية)/g, '').trim();
        const s2 = userSchool.replace(/(مدرسة|للتعليم|الأساسي|الأساسية)/g, '').trim();
        return s1.includes(s2) || s2.includes(s1) || f.schoolId === userProfile.uid;
      });
      const baseList = schoolMatches.length > 0 ? schoolMatches : archivedForms;

      if (userProfile.roleType === 'teacher') {
        const cleanUser = (userProfile.name || '').replace(/^أ\.\s*|^د\.\s*/g, '').trim();
        const teacherMatches = baseList.filter((f) => {
          const cleanFormTeacher = (f.teacherName || '').replace(/^أ\.\s*|^د\.\s*/g, '').trim();
          return (
            (cleanUser && cleanFormTeacher && (cleanFormTeacher.includes(cleanUser) || cleanUser.includes(cleanFormTeacher))) ||
            (userProfile.subject && isSubjectMatch(userProfile.subject, f.subject || f.subjectName))
          );
        });
        return teacherMatches.length > 0 ? teacherMatches : baseList;
      }

      return baseList;
    }

    return archivedForms;
  }, [archivedForms, userProfile]);

  // Forms filtered by date selector ("في ذلك اليوم")
  const dateFilteredForms = useMemo(() => {
    return roleScopedForms.filter((f) => {
      if (selectedDateFilter === 'all') return true;
      const formDate = f.visitDate || (f.createdAt ? f.createdAt.split('T')[0] : '');
      return formDate === selectedDateFilter;
    });
  }, [roleScopedForms, selectedDateFilter]);

  // Level 1: Schools with forms on the selected date
  const schoolFoldersData = useMemo(() => {
    const map = new Map<string, ArchivedForm[]>();
    dateFilteredForms.forEach((f) => {
      const s = f.schoolName || 'مدرسة غير محددة';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    });

    return Array.from(map.entries()).map(([schoolName, forms]) => {
      const subjectsMap = new Map<string, number>();
      forms.forEach((form) => {
        const subj = form.subjectName || form.subject || 'عام';
        subjectsMap.set(subj, (subjectsMap.get(subj) || 0) + 1);
      });
      return {
        schoolName,
        totalForms: forms.length,
        subjectsCount: subjectsMap.size,
        forms,
        subjectsMap
      };
    });
  }, [dateFilteredForms]);

  // Level 2: Subject cards in selected school folder with form counts
  const selectedSchoolData = useMemo(() => {
    if (!openedSchoolFolder) return null;
    const schoolForms = dateFilteredForms.filter(
      (f) => (f.schoolName || 'مدرسة غير محددة') === openedSchoolFolder
    );

    // Standard curriculum subjects list
    const standardSubjects = [
      'الرياضيات',
      'العلوم',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'الدراسات الاجتماعية',
      'التربية الإسلامية',
      'الفيزياء',
      'الكيمياء',
      'الأحياء',
      'المهارات الحياتية',
      'الفنون التشكيلية',
      'المهارات الموسيقية',
      'تقنية المعلومات',
      'الرياضة المدرسية'
    ];

    const subjectsMap = new Map<string, ArchivedForm[]>();
    schoolForms.forEach((f) => {
      const subj = f.subjectName || f.subject || 'عام';
      if (!subjectsMap.has(subj)) subjectsMap.set(subj, []);
      subjectsMap.get(subj)!.push(f);
    });

    // Merge standard list with any actual subjects in forms
    const allSubjectNames = Array.from(
      new Set([...standardSubjects, ...Array.from(subjectsMap.keys())])
    );

    const subjectCards = allSubjectNames.map((subj) => {
      const forms = subjectsMap.get(subj) || [];
      return {
        subjectName: subj,
        formsCount: forms.length,
        forms
      };
    });

    // Sort subjects so those with forms appear first
    subjectCards.sort((a, b) => b.formsCount - a.formsCount);

    return {
      schoolName: openedSchoolFolder,
      totalForms: schoolForms.length,
      forms: schoolForms,
      subjectCards
    };
  }, [openedSchoolFolder, dateFilteredForms]);

  const uniqueSchools = useMemo(
    () => Array.from(new Set(roleScopedForms.map((f) => f.schoolName).filter(Boolean))),
    [roleScopedForms]
  );

  const uniqueSubjects = useMemo(
    () => Array.from(new Set(roleScopedForms.map((f) => f.subjectName || f.subject).filter(Boolean))),
    [roleScopedForms]
  );

  const stats = useMemo(() => {
    let stage1 = 0;
    let stage2 = 0;
    let stage3 = 0;
    let stage4 = 0;
    let completed = 0;

    roleScopedForms.forEach((f) => {
      const st = getFormComputedStage(f);
      if (st.stageKey === 'stage_1_examiner') stage1++;
      else if (st.stageKey === 'stage_2_admin') stage2++;
      else if (st.stageKey === 'stage_3_principal') stage3++;
      else if (st.stageKey === 'stage_4_teacher') stage4++;
      else if (st.stageKey === 'completed') completed++;
    });

    return {
      total: roleScopedForms.length,
      stage1,
      stage2,
      stage3,
      stage4,
      completed
    };
  }, [roleScopedForms]);

  const filteredForms = useMemo(() => {
    return roleScopedForms.filter((form) => {
      const st = getFormComputedStage(form);
      if (stageFilter !== 'all' && st.stageKey !== stageFilter) {
        return false;
      }
      if (schoolFilter !== 'all' && form.schoolName !== schoolFilter) {
        return false;
      }
      if (subjectFilter !== 'all' && (form.subjectName || form.subject) !== subjectFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          form.id,
          form.teacherName,
          form.schoolName,
          form.subjectName,
          form.subject,
          form.examinerName,
          form.examinerSignedName,
          form.principalName,
          form.signedByPrincipalName,
          form.teacherFileNo,
          form.grade
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [roleScopedForms, stageFilter, schoolFilter, subjectFilter, searchQuery]);

  const handleQuickAdminTransfer = async (form: ArchivedForm) => {
    if (!onTransferToPrincipal || !userProfile) return;
    setProcessingFormId(form.id);
    try {
      const adminName = userProfile.name || 'مدير النظام';
      await onTransferToPrincipal(form.id, adminName);
      onSuccess?.(
        language === 'ar'
          ? `تم تحويل استمارة (${form.teacherName}) إلى مدير المدرسة (${form.schoolName}) بنجاح وبشكل متزامن!`
          : `Form for (${form.teacherName}) transferred to School Principal in real-time!`
      );
    } finally {
      setProcessingFormId(null);
    }
  };

  const handleQuickPrincipalSign = async (form: ArchivedForm) => {
    if (!onSignPrincipal || !userProfile) return;
    setProcessingFormId(form.id);
    try {
      const pName = userProfile.name || form.principalName || 'مدير المدرسة';
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrData = `OM-MOE-SIG-${randomCode}`;
      const stampToUse = getActiveStamp(form.schoolName) || principalStampUrl;
      await onSignPrincipal(form.id, pName, qrData, stampToUse);
      onSuccess?.(
        language === 'ar'
          ? `تم توقيع وختم الاستمارة وتحويلها للمعلم (${form.teacherName}) بنجاح!`
          : `Form signed, stamped, and forwarded to Teacher (${form.teacherName})!`
      );
    } finally {
      setProcessingFormId(null);
    }
  };

  const handleQuickTeacherSign = async (form: ArchivedForm) => {
    if (!onSignTeacher || !userProfile) return;
    setProcessingFormId(form.id);
    try {
      const tName = userProfile.name || form.teacherName || 'معلم المادة';
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrData = `OM-TCH-SIG-${randomCode}`;
      await onSignTeacher(form.id, tName, qrData);
      onSuccess?.(
        language === 'ar'
          ? `تم توقيع المعلم بالعلم واكتمال اعتماد الاستمارة رسمياً!`
          : `Teacher signature recorded and form officially completed!`
      );
    } finally {
      setProcessingFormId(null);
    }
  };

  const handleQuickExaminerSign = async (form: ArchivedForm) => {
    if (!onSignExaminer || !userProfile) return;
    setProcessingFormId(form.id);
    try {
      const eName = userProfile.name || form.examinerName || 'مشرف فحص وتدقيق المادة';
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrData = `OM-EXM-SIG-${randomCode}`;
      await onSignExaminer(
        form.id,
        eName,
        qrData,
        form.conformanceStatus || 'conforming',
        Boolean(form.hasGradeRevisions)
      );
      onSuccess?.(
        language === 'ar'
          ? `تم توقيع الفاحص وإرسال الاستمارة لمدير النظام بنجاح!`
          : `Examiner signature recorded and form submitted to System Admin!`
      );
    } finally {
      setProcessingFormId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Top Hero Banner with Real-Time Sync Pulse */}
      <div className="bg-gradient-to-r from-[#073b20] via-[#0b5e32] to-[#0f4c3a] text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-emerald-700/40 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-xs font-black">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="w-2 h-2 rounded-full bg-emerald-300 -ml-3.5 rtl:-mr-3.5 rtl:ml-0" />
                <span>
                  {language === 'ar'
                    ? 'متزامن لحظياً مع جميع الحسابات عبر السحابة'
                    : 'Live Real-Time Cloud Sync Active'}
                </span>
              </span>
              <span className="text-[11px] font-mono bg-black/25 px-3 py-1 rounded-full text-amber-300 border border-amber-400/20">
                {language === 'ar' ? `آخر مزامنة لحظية: ${lastSyncTime}` : `Last Sync: ${lastSyncTime}`}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black font-heading text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-amber-400 shrink-0" />
              <span>
                {language === 'ar'
                  ? 'أداة تتبع الاستمارة المباشر (مسار الاعتماد المتزامن)'
                  : 'Live Form Status Tracker (Synchronized Workflow Pipeline)'}
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-emerald-100/90 max-w-3xl leading-relaxed">
              {language === 'ar'
                ? 'تتبع حي ومباشر لحالة كل استمارة فحص وتدقيق عبر المراحل الأربع: (1) توقيع الفاحص ⬅ (2) تحويل مدير النظام ⬅ (3) توقيع وختم مدير المدرسة ⬅ (4) توقيع المعلم بالعلم. أي إجراء يتم في أي حساب يظهر فوراً لجميع المستخدمين.'
                : 'Real-time tracking of every Continuous Assessment Audit Form across all 4 official stages: (1) Examiner Sign -> (2) Admin Transfer -> (3) Principal Sign & Stamp -> (4) Teacher Sign.'}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 text-amber-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{language === 'ar' ? 'تحديث المزامنة الآن' : 'Sync Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Stage Filter KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setStageFilter('all')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-80">
              {language === 'ar' ? 'إجمالي الاستمارات' : 'Total Forms'}
            </span>
            <FileCheck className={`w-4 h-4 ${stageFilter === 'all' ? 'text-amber-400' : 'text-slate-500'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.total}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'جميع المراحل المتزامنة' : 'All synced stages'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStageFilter('stage_1_examiner')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'stage_1_examiner'
              ? 'bg-rose-700 text-white border-rose-700 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-rose-50/50 text-slate-800 border-rose-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-85">
              {language === 'ar' ? '1. لدى الفاحص' : '1. With Examiner'}
            </span>
            <Clock className={`w-4 h-4 ${stageFilter === 'stage_1_examiner' ? 'text-rose-200' : 'text-rose-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.stage1}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'بانتظار توقيع المدقق' : 'Awaiting examiner sign'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStageFilter('stage_2_admin')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'stage_2_admin'
              ? 'bg-amber-600 text-white border-amber-600 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-amber-50/50 text-slate-800 border-amber-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-85">
              {language === 'ar' ? '2. لدى مدير النظام' : '2. With Admin'}
            </span>
            <Send className={`w-4 h-4 ${stageFilter === 'stage_2_admin' ? 'text-amber-100' : 'text-amber-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.stage2}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'بانتظار التحويل للمدير' : 'Awaiting transfer to Principal'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStageFilter('stage_3_principal')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'stage_3_principal'
              ? 'bg-blue-700 text-white border-blue-700 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-blue-50/50 text-slate-800 border-blue-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-85">
              {language === 'ar' ? '3. لدى مدير المدرسة' : '3. With Principal'}
            </span>
            <Stamp className={`w-4 h-4 ${stageFilter === 'stage_3_principal' ? 'text-blue-200' : 'text-blue-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.stage3}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'بانتظار التوقيع والختم' : 'Awaiting sign & stamp'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStageFilter('stage_4_teacher')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'stage_4_teacher'
              ? 'bg-indigo-700 text-white border-indigo-700 shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-indigo-50/50 text-slate-800 border-indigo-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-85">
              {language === 'ar' ? '4. لدى المعلم' : '4. With Teacher'}
            </span>
            <UserCheck className={`w-4 h-4 ${stageFilter === 'stage_4_teacher' ? 'text-indigo-200' : 'text-indigo-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.stage4}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'بانتظار التوقيع بالعلم' : 'Awaiting teacher sign'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStageFilter('completed')}
          className={`p-4 rounded-2xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
            stageFilter === 'completed'
              ? 'bg-[#0b5e32] text-white border-[#0b5e32] shadow-lg scale-[1.01]'
              : 'bg-white hover:bg-emerald-50/50 text-slate-800 border-emerald-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-black opacity-85">
              {language === 'ar' ? 'مكتملة ومؤرشفة' : 'Completed'}
            </span>
            <CheckCircle2 className={`w-4 h-4 ${stageFilter === 'completed' ? 'text-emerald-200' : 'text-emerald-600'}`} />
          </div>
          <div className="text-2xl font-black font-mono">{stats.completed}</div>
          <div className="text-[10px] opacity-75 mt-1 font-bold">
            {language === 'ar' ? 'معتمدة من جميع الأطراف' : 'Fully certified (4/4)'}
          </div>
        </button>
      </div>

      {/* View Mode Toolbar & Date Selection Bar ("في ذلك اليوم") */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Toggle View Mode Buttons */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('folders')}
            className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'folders'
                ? 'bg-[#0b5e32] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-amber-300" />
            <span>
              {language === 'ar' ? 'مجلدات المدارس والمواد (تتبع اليوم)' : 'School & Subject Folders'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-4 h-4 text-amber-300" />
            <span>{language === 'ar' ? 'القائمة المباشرة الشاملة' : 'Full Pipeline List'}</span>
          </button>
        </div>

        {/* Date Selector Bar for "في ذلك اليوم" */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
          <Calendar className="w-4 h-4 text-[#0b5e32] shrink-0" />
          <span className="text-xs font-black text-slate-700 shrink-0">
            {language === 'ar' ? 'تاريخ الاستمارات (في ذلك اليوم):' : 'Date Filter:'}
          </span>
          <select
            value={selectedDateFilter}
            onChange={(e) => {
              setSelectedDateFilter(e.target.value);
              setOpenedSchoolFolder(null);
              setOpenedSubjectFolder(null);
            }}
            className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer"
          >
            <option value="all">{language === 'ar' ? 'جميع الأيام' : 'All Dates'}</option>
            {availableDates.map((dateStr) => (
              <option key={dateStr} value={dateStr}>
                {dateStr === todayIso ? `اليوم (${dateStr})` : dateStr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'folders' ? (
        <div className="space-y-6">
          {/* LEVEL 1: School Folders Grid */}
          {!openedSchoolFolder ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                    <Folder className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {language === 'ar'
                        ? 'مجلدات المدارس التي لديها استمارات'
                        : 'School Field Folders'}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold">
                      {language === 'ar'
                        ? `تاريخ اليوم المختار: (${selectedDateFilter === 'all' ? 'جميع الأيام' : selectedDateFilter})`
                        : `Selected Date: ${selectedDateFilter}`}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  {schoolFoldersData.length}{' '}
                  {language === 'ar' ? 'مدرسة نشطة اليوم' : 'Active Schools Today'}
                </span>
              </div>

              {schoolFoldersData.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/80 shadow-xs space-y-3">
                  <FolderOpen className="w-12 h-12 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-black text-slate-700">
                    {language === 'ar'
                      ? 'لا توجد مدارس تحتوي على استمارات في هذا اليوم المحدد'
                      : 'No schools found with forms for this selected date'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'ar'
                      ? 'اختر تاريخاً آخر من القائمة أو اختر "جميع الأيام" لعرض مجلدات المدارس.'
                      : 'Select another date or "All Dates" to view school folders.'}
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
                      className="bg-white hover:bg-amber-50/30 border-2 border-amber-200/80 hover:border-amber-400 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all text-right rtl:text-right ltr:text-left cursor-pointer group relative overflow-hidden flex flex-col justify-between"
                    >
                      <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-emerald-600" />

                      <div>
                        <div className="flex items-center justify-between mb-3 pt-1">
                          <div className="w-12 h-12 rounded-2xl bg-amber-100/80 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                            <Folder className="w-6 h-6 fill-amber-400 text-amber-700" />
                          </div>
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full border border-emerald-300">
                            {sch.totalForms} {language === 'ar' ? 'استمارة' : 'Forms'}
                          </span>
                        </div>

                        <h4 className="text-base font-black text-slate-900 mb-1 group-hover:text-[#0b5e32] transition-colors">
                          {sch.schoolName}
                        </h4>

                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mt-2">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                          <span>
                            {language === 'ar'
                              ? `تضم (${sch.subjectsCount}) مواد بها استمارات`
                              : `Contains (${sch.subjectsCount}) subjects`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-[#0b5e32]">
                        <span>{language === 'ar' ? 'فتح مجلد المدرسة' : 'Open School Folder'}</span>
                        <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !openedSubjectFolder ? (
            /* LEVEL 2: Subject Cards inside Opened School Folder with Corner Floating Badge */
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
                    <span>{language === 'ar' ? 'جميع مجلدات المدارس' : 'All Schools'}</span>
                  </button>
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
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
              <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 text-white rounded-3xl p-5 shadow-md flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">{openedSchoolFolder}</h3>
                  <p className="text-xs text-amber-100/90 mt-1">
                    {language === 'ar'
                      ? 'اختر المادة لمعاينة الاستمارات. المادة التي تحتوي على استمارات يظهر في ركنها دائرة صغيرة بها عدد الاستمارات.'
                      : 'Select a subject to view forms. Subjects with forms display a floating circle badge on the corner.'}
                  </p>
                </div>
                <div className="text-left rtl:text-left ltr:text-right">
                  <span className="text-2xl font-black font-mono">{selectedSchoolData?.totalForms || 0}</span>
                  <div className="text-[11px] font-bold text-amber-200">
                    {language === 'ar' ? 'إجمالي الاستمارات' : 'Total Forms'}
                  </div>
                </div>
              </div>

              {/* Subject Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                {selectedSchoolData?.subjectCards.map((subj) => {
                  const hasForms = subj.formsCount > 0;

                  return (
                    <button
                      key={subj.subjectName}
                      type="button"
                      disabled={!hasForms}
                      onClick={() => setOpenedSubjectFolder(subj.subjectName)}
                      className={`relative p-5 rounded-3xl border-2 text-right rtl:text-right ltr:text-left transition-all flex flex-col justify-between ${
                        hasForms
                          ? 'bg-white hover:bg-indigo-50/40 border-indigo-300 hover:border-indigo-500 shadow-md hover:shadow-lg cursor-pointer scale-[1.01]'
                          : 'bg-slate-50/70 border-slate-200/80 text-slate-400 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {/* CORNER FLOATING CIRCULAR BADGE SHOWING FORM COUNT */}
                      {hasForms && (
                        <div className="absolute -top-3 -right-3 rtl:-right-3 ltr:-left-3 z-20 w-8 h-8 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-lg ring-4 ring-white border border-rose-700 animate-bounce">
                          {subj.formsCount}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                              hasForms ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-400'
                            }`}
                          >
                            <BookOpen className="w-5 h-5" />
                          </div>
                          {hasForms && (
                            <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                              {language === 'ar' ? 'نشطة' : 'Active'}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-black text-slate-900 mb-1">
                          {subj.subjectName}
                        </h4>
                        <p className="text-[11px] font-bold text-slate-500">
                          {translateSubject(subj.subjectName, 'en')}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black">
                        {hasForms ? (
                          <>
                            <span className="text-indigo-800">
                              {language === 'ar' ? `استعراض (${subj.formsCount}) استمارة` : `View (${subj.formsCount}) forms`}
                            </span>
                            <ChevronLeft className="w-4 h-4 text-indigo-600 rtl:rotate-0 ltr:rotate-180" />
                          </>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            {language === 'ar' ? 'لا توجد استمارات اليوم' : 'No forms today'}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* LEVEL 3: Forms List for Opened School + Opened Subject */
            <div className="space-y-5">
              {/* Breadcrumbs Navigation */}
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
                    <span>{language === 'ar' ? 'جميع المدارس' : 'All Schools'}</span>
                  </button>
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  <button
                    type="button"
                    onClick={() => setOpenedSubjectFolder(null)}
                    className="inline-flex items-center gap-1.5 text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl cursor-pointer transition-all border border-amber-200"
                  >
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span>{openedSchoolFolder}</span>
                  </button>
                  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0 ltr:rotate-180" />
                  <span className="inline-flex items-center gap-1.5 text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>{openedSubjectFolder}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenedSubjectFolder(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  <span>{language === 'ar' ? 'العودة للمواد' : 'Back to Subjects'}</span>
                </button>
              </div>

              {/* Render Form Cards for this school + subject */}
              {(() => {
                const targetForms = dateFilteredForms.filter(
                  (f) =>
                    (f.schoolName || 'مدرسة غير محددة') === openedSchoolFolder &&
                    (f.subjectName || f.subject || 'عام') === openedSubjectFolder
                );

                if (targetForms.length === 0) {
                  return (
                    <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-xs">
                      <p className="text-sm font-black text-slate-700">
                        {language === 'ar' ? 'لا توجد استمارات لهذه المادة حالياً' : 'No forms for this subject'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-5">
                    {targetForms.map((form) => {
                      const computed = getFormComputedStage(form);

                      const step1Done =
                        Boolean(form.isExaminerSigned) ||
                        form.workflowStage === 'examiner_submitted_to_admin' ||
                        form.workflowStage === 'admin_transferred_to_principal' ||
                        form.workflowStage === 'principal_signed_transferred_to_teacher' ||
                        form.workflowStage === 'completed' ||
                        Boolean(form.isSigned) ||
                        Boolean(form.isTeacherSigned);

                      const step2Done =
                        form.workflowStage === 'admin_transferred_to_principal' ||
                        form.workflowStage === 'principal_signed_transferred_to_teacher' ||
                        form.workflowStage === 'completed' ||
                        Boolean(form.adminReviewedBy) ||
                        Boolean(form.adminReviewedAt) ||
                        Boolean(form.isSigned) ||
                        Boolean(form.isTeacherSigned);

                      const step3Done =
                        form.workflowStage === 'principal_signed_transferred_to_teacher' ||
                        form.workflowStage === 'completed' ||
                        Boolean(form.isSigned) ||
                        Boolean(form.isTeacherSigned);

                      const step4Done =
                        form.workflowStage === 'completed' ||
                        (Boolean(form.isSigned) && Boolean(form.isTeacherSigned)) ||
                        Boolean(form.isTeacherSigned);

                      const canAdminTransfer = userProfile?.role === 'admin' && !step2Done;
                      const canPrincipalSign =
                        userProfile?.role === 'school' &&
                        userProfile?.roleType === 'administrative' &&
                        step2Done &&
                        !step3Done;
                      const canTeacherSign =
                        userProfile?.role === 'school' &&
                        userProfile?.roleType === 'teacher' &&
                        step3Done &&
                        !step4Done;
                      const canExaminerSign = userProfile?.role === 'moderator' && !form.isExaminerSigned;

                      return (
                        <div
                          key={form.id}
                          className="bg-white rounded-3xl border border-slate-200/90 shadow-md hover:shadow-lg transition-all overflow-hidden"
                        >
                          {/* Top Card Header */}
                          <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-[#821315] text-white font-black flex items-center justify-center text-base shadow-xs shrink-0">
                                {(form.teacherName || 'أ')[0]}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                                    {language === 'ar'
                                      ? `استمارة الفحص والتدقيق — ${form.teacherName || 'أ. معلم المادة'}`
                                      : `Audit Form — ${form.teacherName || 'Teacher'}`}
                                  </h3>
                                  <span className={`px-3 py-0.5 rounded-full text-[11px] font-black border ${computed.badgeColor}`}>
                                    {language === 'ar' ? computed.labelAr : computed.labelEn}
                                  </span>
                                  {form.conformanceStatus && (
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black border ${
                                        form.conformanceStatus === 'conforming'
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : 'bg-rose-50 text-rose-800 border-rose-200'
                                      }`}
                                    >
                                      {form.conformanceStatus === 'conforming'
                                        ? language === 'ar'
                                          ? '✓ استمارة مطابقة'
                                          : '✓ Conforming'
                                        : language === 'ar'
                                        ? '⚠ استمارة غير مطابقة'
                                        : '⚠ Non-Conforming'}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-bold mt-1">
                                  <span className="inline-flex items-center gap-1 text-slate-700">
                                    <School className="w-3.5 h-3.5 text-[#0b5e32]" />
                                    {form.schoolName}
                                  </span>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1 text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md">
                                    <BookOpen className="w-3.5 h-3.5" />
                                    {translateSubject(form.subjectName || form.subject, language)}
                                  </span>
                                  {form.grade && (
                                    <>
                                      <span>•</span>
                                      <span className="bg-slate-200/70 text-slate-800 px-2 py-0.5 rounded-md">
                                        {translateGrade(form.grade, language)}
                                      </span>
                                    </>
                                  )}
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {form.visitDate || formatSafeDate(form.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Quick Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
                              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                                <span className="text-[11px] font-bold text-slate-500">
                                  {language === 'ar' ? 'نسبة الإنجاز:' : 'Progress:'}
                                </span>
                                <span className="text-sm font-black font-mono text-[#0b5e32]">
                                  {computed.progressPercent}%
                                </span>
                              </div>

                              {canAdminTransfer && (
                                <button
                                  type="button"
                                  disabled={processingFormId === form.id}
                                  onClick={() => handleQuickAdminTransfer(form)}
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>
                                    {processingFormId === form.id
                                      ? language === 'ar'
                                        ? 'جاري التحويل...'
                                        : 'Transferring...'
                                      : language === 'ar'
                                      ? 'تحويل لمدير المدرسة الآن'
                                      : 'Transfer to Principal Now'}
                                  </span>
                                </button>
                              )}

                              {canPrincipalSign && (
                                <button
                                  type="button"
                                  disabled={processingFormId === form.id}
                                  onClick={() => handleQuickPrincipalSign(form)}
                                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <Stamp className="w-3.5 h-3.5" />
                                  <span>
                                    {processingFormId === form.id
                                      ? language === 'ar'
                                        ? 'جاري الاعتماد والختم...'
                                        : 'Signing & Stamping...'
                                      : language === 'ar'
                                      ? 'توقيع وختم وتحويل للمعلم'
                                      : 'Sign, Stamp & Forward'}
                                  </span>
                                </button>
                              )}

                              {canTeacherSign && (
                                <button
                                  type="button"
                                  disabled={processingFormId === form.id}
                                  onClick={() => handleQuickTeacherSign(form)}
                                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>
                                    {processingFormId === form.id
                                      ? language === 'ar'
                                        ? 'جاري التوقيع...'
                                        : 'Signing...'
                                      : language === 'ar'
                                      ? 'توقيع المعلم بالعلم الآن'
                                      : 'Sign as Teacher'}
                                  </span>
                                </button>
                              )}

                              {canExaminerSign && (
                                <button
                                  type="button"
                                  disabled={processingFormId === form.id}
                                  onClick={() => handleQuickExaminerSign(form)}
                                  className="px-4 py-2 bg-[#0b5e32] hover:bg-[#094b28] disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>
                                    {processingFormId === form.id
                                      ? language === 'ar'
                                        ? 'جاري التوقيع...'
                                        : 'Signing...'
                                      : language === 'ar'
                                      ? 'توقيع الفاحص وإرسال للنظام'
                                      : 'Sign as Examiner'}
                                  </span>
                                </button>
                              )}

                              {onOpenInArchive && (
                                <button
                                  type="button"
                                  onClick={() => onOpenInArchive(form)}
                                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <Eye className="w-3.5 h-3.5 text-amber-300" />
                                  <span>{language === 'ar' ? 'معاينة الاستمارة الرسمية' : 'View Official Form'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 4-Stage Visual Pipeline Grid */}
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Stage 1 */}
                            <div className={`p-4 rounded-2xl border-2 transition-all relative ${step1Done ? 'bg-emerald-50/40 border-emerald-400/80' : 'bg-slate-50/60 border-slate-200'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">المرحلة 1</span>
                                {step1Done ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full"><Check className="w-3.5 h-3.5" />مكتملة</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full animate-pulse"><Clock className="w-3 h-3" />جاري العمل</span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-slate-900 mb-1">1. توقيع الفاحص</h4>
                              <p className="text-[11px] font-bold text-slate-700 truncate">{form.examinerSignedName || form.examinerName || 'الفاحص'}</p>
                            </div>

                            {/* Stage 2 */}
                            <div className={`p-4 rounded-2xl border-2 transition-all relative ${step2Done ? 'bg-emerald-50/40 border-emerald-400/80' : 'bg-slate-50/60 border-slate-200'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">المرحلة 2</span>
                                {step2Done ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full"><Check className="w-3.5 h-3.5" />تم التحويل</span>
                                ) : (
                                  <span className="text-[10.5px] font-bold text-slate-400">بالانتظار</span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-slate-900 mb-1">2. تحويل مدير النظام</h4>
                              <p className="text-[11px] font-bold text-slate-700 truncate">{step2Done ? form.adminReviewedBy || 'مدير النظام' : 'بانتظار تحويل المدير'}</p>
                            </div>

                            {/* Stage 3 */}
                            <div className={`p-4 rounded-2xl border-2 transition-all relative ${step3Done ? 'bg-emerald-50/40 border-emerald-400/80' : 'bg-slate-50/60 border-slate-200'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">المرحلة 3</span>
                                {step3Done ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full"><Check className="w-3.5 h-3.5" />مختومة وموقعة</span>
                                ) : (
                                  <span className="text-[10.5px] font-bold text-slate-400">بالانتظار</span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-slate-900 mb-1">3. توقيع وختم المدير</h4>
                              <p className="text-[11px] font-bold text-slate-700 truncate">{step3Done ? form.signedByPrincipalName || form.principalName || 'مدير المدرسة' : 'مدير المدرسة'}</p>
                            </div>

                            {/* Stage 4 */}
                            <div className={`p-4 rounded-2xl border-2 transition-all relative ${step4Done ? 'bg-emerald-50/40 border-emerald-400/80' : 'bg-slate-50/60 border-slate-200'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">المرحلة 4</span>
                                {step4Done ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full"><Check className="w-3.5 h-3.5" />توقيع المعلم بالعلم</span>
                                ) : (
                                  <span className="text-[10.5px] font-bold text-slate-400">بالانتظار</span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-slate-900 mb-1">4. توقيع المعلم بالعلم</h4>
                              <p className="text-[11px] font-bold text-slate-700 truncate">{form.teacherSignedName || form.teacherName || 'معلم المادة'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      ) : (
        /* FLAT LIST MODE */
        <div className="space-y-4">
          {/* Search & Filters Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 rtl:right-3.5 ltr:left-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'ابحث باسم المعلم، المدرسة، المادة، الرقم الوظيفي، أو رمز الاستمارة...'
                    : 'Search by teacher name, school, subject, file number, or form ID...'
                }
                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5e32] focus:bg-white transition-all"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <School className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">{language === 'ar' ? 'جميع المدارس' : 'All Schools'}</option>
                  {uniqueSchools.map((sch) => (
                    <option key={sch} value={sch}>
                      {sch}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">{language === 'ar' ? 'جميع المواد' : 'All Subjects'}</option>
                  {uniqueSubjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {translateSubject(subj, language)}
                    </option>
                  ))}
                </select>
              </div>

              {(stageFilter !== 'all' || schoolFilter !== 'all' || subjectFilter !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setStageFilter('all');
                    setSchoolFilter('all');
                    setSubjectFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black cursor-pointer transition-colors shrink-0"
                >
                  {language === 'ar' ? 'إعادة ضبط' : 'Reset'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Tracked Forms List */}
      {filteredForms.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Activity className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-800">
            {language === 'ar' ? 'لا توجد استمارات مطابقة لخيارات البحث الحالية' : 'No forms match your current filters'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {language === 'ar'
              ? 'جرب تغيير الفلتر أو البحث بكلمة أخرى لعرض مسار تتبع الاستمارات المتزامنة.'
              : 'Try adjusting your filters or search query to view synchronized forms.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredForms.map((form) => {
            const computed = getFormComputedStage(form);

            const step1Done =
              Boolean(form.isExaminerSigned) ||
              form.workflowStage === 'examiner_submitted_to_admin' ||
              form.workflowStage === 'admin_transferred_to_principal' ||
              form.workflowStage === 'principal_signed_transferred_to_teacher' ||
              form.workflowStage === 'completed' ||
              Boolean(form.isSigned) ||
              Boolean(form.isTeacherSigned);

            const step2Done =
              form.workflowStage === 'admin_transferred_to_principal' ||
              form.workflowStage === 'principal_signed_transferred_to_teacher' ||
              form.workflowStage === 'completed' ||
              Boolean(form.adminReviewedBy) ||
              Boolean(form.adminReviewedAt) ||
              Boolean(form.isSigned) ||
              Boolean(form.isTeacherSigned);

            const step3Done =
              form.workflowStage === 'principal_signed_transferred_to_teacher' ||
              form.workflowStage === 'completed' ||
              Boolean(form.isSigned) ||
              Boolean(form.isTeacherSigned);

            const step4Done =
              form.workflowStage === 'completed' ||
              (Boolean(form.isSigned) && Boolean(form.isTeacherSigned)) ||
              Boolean(form.isTeacherSigned);

            // Role-based quick action eligibility
            const canAdminTransfer =
              userProfile?.role === 'admin' && !step2Done;
            const canPrincipalSign =
              userProfile?.role === 'school' &&
              userProfile?.roleType === 'administrative' &&
              step2Done &&
              !step3Done;
            const canTeacherSign =
              userProfile?.role === 'school' &&
              userProfile?.roleType === 'teacher' &&
              step3Done &&
              !step4Done;
            const canExaminerSign =
              userProfile?.role === 'moderator' && !form.isExaminerSigned;

            return (
              <div
                key={form.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-md hover:shadow-lg transition-all overflow-hidden"
              >
                {/* Top Card Header Bar */}
                <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#821315] text-white font-black flex items-center justify-center text-base shadow-xs shrink-0">
                      {(form.teacherName || 'أ')[0]}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-black text-slate-900">
                          {language === 'ar'
                            ? `استمارة الفحص والتدقيق — ${form.teacherName || 'أ. معلم المادة'}`
                            : `Audit Form — ${form.teacherName || 'Teacher'}`}
                        </h3>
                        <span className={`px-3 py-0.5 rounded-full text-[11px] font-black border ${computed.badgeColor}`}>
                          {language === 'ar' ? computed.labelAr : computed.labelEn}
                        </span>
                        {form.conformanceStatus && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black border ${
                              form.conformanceStatus === 'conforming'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {form.conformanceStatus === 'conforming'
                              ? language === 'ar'
                                ? '✓ استمارة مطابقة'
                                : '✓ Conforming'
                              : language === 'ar'
                              ? '⚠ استمارة غير مطابقة'
                              : '⚠ Non-Conforming'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-bold mt-1">
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <School className="w-3.5 h-3.5 text-[#0b5e32]" />
                          {form.schoolName}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md">
                          <BookOpen className="w-3.5 h-3.5" />
                          {translateSubject(form.subjectName || form.subject, language)}
                        </span>
                        {form.grade && (
                          <>
                            <span>•</span>
                            <span className="bg-slate-200/70 text-slate-800 px-2 py-0.5 rounded-md">
                              {translateGrade(form.grade, language)}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                          <Calendar className="w-3.5 h-3.5" />
                          {form.visitDate || formatSafeDate(form.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Progress Percentage & Quick Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[11px] font-bold text-slate-500">
                        {language === 'ar' ? 'نسبة الإنجاز:' : 'Progress:'}
                      </span>
                      <span className="text-sm font-black font-mono text-[#0b5e32]">
                        {computed.progressPercent}%
                      </span>
                    </div>

                    {/* Direct Role Action Buttons */}
                    {canAdminTransfer && (
                      <button
                        type="button"
                        disabled={processingFormId === form.id}
                        onClick={() => handleQuickAdminTransfer(form)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {processingFormId === form.id
                            ? language === 'ar'
                              ? 'جاري التحويل...'
                              : 'Transferring...'
                            : language === 'ar'
                            ? 'تحويل لمدير المدرسة الآن'
                            : 'Transfer to Principal Now'}
                        </span>
                      </button>
                    )}

                    {canPrincipalSign && (
                      <button
                        type="button"
                        disabled={processingFormId === form.id}
                        onClick={() => handleQuickPrincipalSign(form)}
                        className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <Stamp className="w-3.5 h-3.5" />
                        <span>
                          {processingFormId === form.id
                            ? language === 'ar'
                              ? 'جاري الاعتماد والختم...'
                              : 'Signing & Stamping...'
                            : language === 'ar'
                            ? 'توقيع وختم وتحويل للمعلم'
                            : 'Sign, Stamp & Forward to Teacher'}
                        </span>
                      </button>
                    )}

                    {canTeacherSign && (
                      <button
                        type="button"
                        disabled={processingFormId === form.id}
                        onClick={() => handleQuickTeacherSign(form)}
                        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>
                          {processingFormId === form.id
                            ? language === 'ar'
                              ? 'جاري التوقيع...'
                              : 'Signing...'
                            : language === 'ar'
                            ? 'توقيع المعلم بالعلم الآن'
                            : 'Sign as Teacher Now'}
                        </span>
                      </button>
                    )}

                    {canExaminerSign && (
                      <button
                        type="button"
                        disabled={processingFormId === form.id}
                        onClick={() => handleQuickExaminerSign(form)}
                        className="px-4 py-2 bg-[#0b5e32] hover:bg-[#094b28] disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          {processingFormId === form.id
                            ? language === 'ar'
                              ? 'جاري التوقيع...'
                              : 'Signing...'
                            : language === 'ar'
                            ? 'توقيع الفاحص وإرسال للنظام'
                            : 'Sign as Examiner'}
                        </span>
                      </button>
                    )}

                    {onOpenInArchive && (
                      <button
                        type="button"
                        onClick={() => onOpenInArchive(form)}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-300" />
                        <span>{language === 'ar' ? 'معاينة الاستمارة الرسمية' : 'View Official Form'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Current Active Turn Banner */}
                <div
                  className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${
                    computed.stageKey === 'completed'
                      ? 'bg-emerald-50/80 border-emerald-200/70 text-emerald-900'
                      : 'bg-amber-50/70 border-amber-200/70 text-amber-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {computed.stageKey === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                    )}
                    <span className="font-black">
                      {language === 'ar' ? 'الإجراء الحالي المطلوب:' : 'Current Action Required:'}
                    </span>
                    <span>{language === 'ar' ? computed.nextActorAr : computed.nextActorEn}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    {language === 'ar' ? 'آخر تحديث:' : 'Updated:'} {formatSafeDate(form.updatedAt || form.createdAt)}
                  </div>
                </div>

                {/* 4-Stage Visual Pipeline Grid */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* STAGE 1: Examiner */}
                  <div
                    className={`p-4 rounded-2xl border-2 transition-all relative ${
                      step1Done
                        ? 'bg-emerald-50/40 border-emerald-400/80'
                        : computed.stageNumber === 1
                        ? 'bg-rose-50/50 border-rose-400 ring-2 ring-rose-400/20'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">
                        {language === 'ar' ? 'المرحلة 1' : 'Stage 1'}
                      </span>
                      {step1Done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <Check className="w-3.5 h-3.5" />
                          {language === 'ar' ? 'مكتملة' : 'Done'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full animate-pulse">
                          <Clock className="w-3 h-3" />
                          {language === 'ar' ? 'جاري العمل' : 'Pending'}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-black text-slate-900 mb-1">
                      {language === 'ar'
                        ? '1. ملء وتوقيع الفاحص / المدقق'
                        : '1. Examiner Audit & Signature'}
                    </h4>
                    <p className="text-[11px] font-bold text-slate-700 truncate">
                      {form.examinerSignedName || form.examinerName || 'مشرف فحص وتدقيق المادة'}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                      {form.examinerSignatureQrData && (
                        <div className="flex items-center justify-between text-slate-600 font-mono">
                          <span>{language === 'ar' ? 'رمز التوقيع:' : 'Code:'}</span>
                          <span className="font-black text-emerald-800">{form.examinerSignatureQrData}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{language === 'ar' ? 'التاريخ:' : 'Date:'}</span>
                        <span className="font-mono">
                          {formatSafeDate(form.examinerSignedAt || form.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* STAGE 2: System Admin Transfer */}
                  <div
                    className={`p-4 rounded-2xl border-2 transition-all relative ${
                      step2Done
                        ? 'bg-emerald-50/40 border-emerald-400/80'
                        : computed.stageNumber === 2
                        ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-400/20'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">
                        {language === 'ar' ? 'المرحلة 2' : 'Stage 2'}
                      </span>
                      {step2Done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <Check className="w-3.5 h-3.5" />
                          {language === 'ar' ? 'تم التحويل' : 'Transferred'}
                        </span>
                      ) : computed.stageNumber === 2 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full animate-pulse">
                          <Clock className="w-3 h-3" />
                          {language === 'ar' ? 'بانتظار التحويل' : 'Awaiting Admin'}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold text-slate-400">
                          {language === 'ar' ? 'بالانتظار' : 'Waiting'}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-black text-slate-900 mb-1">
                      {language === 'ar'
                        ? '2. تحويل مدير النظام لمدير المدرسة'
                        : '2. System Admin Transfer to Principal'}
                    </h4>
                    <p className="text-[11px] font-bold text-slate-700 truncate">
                      {step2Done
                        ? form.adminReviewedBy || (language === 'ar' ? 'مدير النظام (تم التحويل)' : 'System Admin')
                        : language === 'ar'
                        ? 'بانتظار تحويل مدير النظام'
                        : 'Pending System Admin transfer'}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{language === 'ar' ? 'الجهة المستلمة:' : 'Target:'}</span>
                        <span className="font-bold text-slate-800 truncate max-w-[130px]">{form.schoolName}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{language === 'ar' ? 'وقت التحويل:' : 'Transferred:'}</span>
                        <span className="font-mono">
                          {step2Done ? formatSafeDate(form.adminReviewedAt || form.updatedAt) : '---'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* STAGE 3: School Principal Sign & Stamp */}
                  <div
                    className={`p-4 rounded-2xl border-2 transition-all relative ${
                      step3Done
                        ? 'bg-emerald-50/40 border-emerald-400/80'
                        : computed.stageNumber === 3
                        ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-400/20'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">
                        {language === 'ar' ? 'المرحلة 3' : 'Stage 3'}
                      </span>
                      {step3Done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <Check className="w-3.5 h-3.5" />
                          {language === 'ar' ? 'تم التوقيع والختم' : 'Signed & Stamped'}
                        </span>
                      ) : computed.stageNumber === 3 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full animate-pulse">
                          <Clock className="w-3 h-3" />
                          {language === 'ar' ? 'بانتظار المدير' : 'Awaiting Principal'}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold text-slate-400">
                          {language === 'ar' ? 'بالانتظار' : 'Waiting'}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-black text-slate-900 mb-1">
                      {language === 'ar'
                        ? '3. توقيع وختم مدير المدرسة والتحويل للمعلم'
                        : '3. Principal Sign, Stamp & Forward'}
                    </h4>
                    <p className="text-[11px] font-bold text-slate-700 truncate">
                      {step3Done
                        ? form.signedByPrincipalName || form.principalName || 'مدير المدرسة'
                        : form.principalName || (language === 'ar' ? 'مدير المدرسة' : 'School Principal')}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                      <div className="flex items-center justify-between text-slate-600 font-mono">
                        <span>{language === 'ar' ? 'الختم والتوقيع:' : 'Stamp & Code:'}</span>
                        <span className="font-black text-blue-900">
                          {step3Done ? form.signatureQrData || '✓ مختوم رسمياً' : '---'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{language === 'ar' ? 'تاريخ الاعتماد:' : 'Signed At:'}</span>
                        <span className="font-mono">{step3Done ? formatSafeDate(form.signedAt) : '---'}</span>
                      </div>
                    </div>
                  </div>

                  {/* STAGE 4: Teacher Acknowledgement Signature & Final Completion */}
                  <div
                    className={`p-4 rounded-2xl border-2 transition-all relative ${
                      step4Done
                        ? 'bg-emerald-50/40 border-emerald-400/80'
                        : computed.stageNumber === 4
                        ? 'bg-indigo-50/60 border-indigo-400 ring-2 ring-indigo-400/20'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-black bg-white border border-slate-200 text-slate-700">
                        {language === 'ar' ? 'المرحلة 4' : 'Stage 4'}
                      </span>
                      {step4Done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <Check className="w-3.5 h-3.5" />
                          {language === 'ar' ? 'تم التوقيع بالعلم' : 'Teacher Signed'}
                        </span>
                      ) : computed.stageNumber === 4 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full animate-pulse">
                          <Clock className="w-3 h-3" />
                          {language === 'ar' ? 'بانتظار المعلم' : 'Awaiting Teacher'}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold text-slate-400">
                          {language === 'ar' ? 'بالانتظار' : 'Waiting'}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-black text-slate-900 mb-1">
                      {language === 'ar'
                        ? '4. توقيع المعلم بالعلم والأرشفة النهائية'
                        : '4. Teacher Signature & Final Archive'}
                    </h4>
                    <p className="text-[11px] font-bold text-slate-700 truncate">
                      {form.teacherSignedName || form.teacherName || 'معلم المادة'}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1 text-[10.5px]">
                      <div className="flex items-center justify-between text-slate-600 font-mono">
                        <span>{language === 'ar' ? 'رمز التوقيع:' : 'Code:'}</span>
                        <span className="font-black text-indigo-900">
                          {step4Done ? form.teacherSignatureQrData || '✓ موقع بالعلم' : '---'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{language === 'ar' ? 'تاريخ التوقيع:' : 'Signed At:'}</span>
                        <span className="font-mono">
                          {step4Done ? formatSafeDate(form.teacherSignedAt) : '---'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default FormTrackerView;
