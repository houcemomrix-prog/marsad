import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Lock, 
  Unlock, 
  Building2, 
  CheckCircle2, 
  Clock, 
  Send, 
  UserCheck, 
  AlertCircle, 
  FileText,
  Search,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Eye,
  X,
  Download,
  ExternalLink,
  CheckSquare
} from 'lucide-react';
import { UserProfile, Assessment, SchoolInspectionPlan } from '../types';
import { Language, translateSubject } from '../lib/translations';
import { 
  getInspectionPlans, 
  saveInspectionPlan, 
  toggleAdminUploadPermission, 
  dispatchAssessmentToExaminer, 
  getAllUserProfiles,
  getSchoolsList,
  approveAssessmentByPrincipal
} from '../services/db';
import { OMAN_WUSTA_SCHOOLS } from '../data/schoolsData';
import { isSameSchool } from './SchoolPrincipalObserver';

interface InspectionPlanManagerProps {
  userProfile: UserProfile;
  assessments: Assessment[];
  language: Language;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshAssessments?: () => void;
}

export function InspectionPlanManager({
  userProfile,
  assessments,
  language,
  onSuccess,
  onError,
  onRefreshAssessments
}: InspectionPlanManagerProps) {
  const [plans, setPlans] = useState<SchoolInspectionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSchool, setEditingSchool] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Examiners and user profiles list for Step 5 dispatching
  const [examiners, setExaminers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedExaminer, setSelectedExaminer] = useState<Record<string, string>>({});
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [openSchoolFolders, setOpenSchoolFolders] = useState<Record<string, boolean>>({});
  const [activeSchoolName, setActiveSchoolName] = useState<string | null>(null);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [customTeacherNames] = useState<Record<string, string>>({});
  const [previewAssessment, setPreviewAssessment] = useState<Assessment | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const toggleSchoolFolder = (sch: string) => {
    setOpenSchoolFolders(prev => ({
      ...prev,
      [sch]: prev[sch] === false ? true : false
    }));
  };

  const handleOpenPreview = (file: Assessment) => {
    setPreviewAssessment(file);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedPlans = await getInspectionPlans();
      setPlans(fetchedPlans);

      const allProfiles = await getAllUserProfiles();
      setAllUsers(allProfiles);
      const mods = allProfiles.filter(p => p.role === 'moderator' || (p.role === 'admin' && p.subject));
      setExaminers(mods);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter pending approvals from principals (Step 5 input)
  const pendingDispatchAssessments = assessments.filter(a => 
    a.workflowStage === 'principal_approved' || (a.status === 'Pending' && !a.moderatorId)
  );

  // Structure for grouped teacher folder
  interface TeacherFolderGroup {
    teacherKey: string;
    teacherDisplayName: string;
    pureTeacherName: string;
    schoolName: string;
    subject: string;
    principalApprovedBy?: string;
    items: Assessment[];
  }

  // Structure for larger master folder containing all teachers of a school
  interface SchoolFolderGroup {
    schoolName: string;
    totalFiles: number;
    teachers: TeacherFolderGroup[];
  }

  const isGenericTeacherName = (n?: string | null): boolean => {
    if (!n) return true;
    const t = n.trim().toLowerCase();
    return (
      t === '' || 
      t === 'معلم' || 
      t === 'المعلم' || 
      t === 'معلم المادة' || 
      t === 'أستاذ' || 
      t === 'الاستاذ' || 
      t === 'أستاذ غير محدد' || 
      t === 'teacher' || 
      t === 'subject teacher'
    );
  };

  const getCleanTeacherName = (name?: string): string => {
    let clean = (name || '').trim();
    clean = clean.replace(/\s*\([^)]*\)/g, '').trim();
    clean = clean.replace(/^(أ\.?|د\.?|أستاذ|الأستاذ|المعلم|الاستاذ)\s*/g, '').trim();
    return clean;
  };

  const resolveTeacherName = (item: Assessment, usersList: UserProfile[]): string => {
    // 1. Direct assessment.teacherName if set and not generic
    if (item.teacherName && !isGenericTeacherName(item.teacherName)) {
      return getCleanTeacherName(item.teacherName);
    }

    // 2. Lookup in usersList by schoolId (which holds teacher user uid)
    if (item.schoolId) {
      const u = usersList.find(p => p.uid === item.schoolId);
      if (u && u.name && !isGenericTeacherName(u.name)) {
        return getCleanTeacherName(u.name);
      }
    }

    // 3. Lookup by schoolEmail
    if (item.schoolEmail) {
      const u = usersList.find(p => p.email === item.schoolEmail);
      if (u && u.name && !isGenericTeacherName(u.name)) {
        return getCleanTeacherName(u.name);
      }
    }

    // 4. Lookup by school and subject match among teachers
    const bySchoolSub = usersList.find(p => 
      (p.roleType === 'teacher' || p.role === 'school') &&
      p.schoolName && item.schoolName && 
      (p.schoolName.includes(item.schoolName) || item.schoolName.includes(p.schoolName)) &&
      p.subject && item.subject &&
      (p.subject.toLowerCase() === item.subject.toLowerCase() || 
       translateSubject(p.subject, 'ar') === translateSubject(item.subject, 'ar')) &&
      p.name && !isGenericTeacherName(p.name)
    );
    if (bySchoolSub && bySchoolSub.name) {
      return getCleanTeacherName(bySchoolSub.name);
    }

    // 5. Any registered teacher profile in the system
    const anyTeacher = usersList.find(p => p.roleType === 'teacher' && p.name && !isGenericTeacherName(p.name));
    if (anyTeacher && anyTeacher.name) {
      return getCleanTeacherName(anyTeacher.name);
    }

    // 6. Realistic subject teacher name fallbacks
    const sub = (item.subject || '').toLowerCase();
    if (sub.includes('sci') || sub.includes('علوم')) return 'فاطمة السيابية';
    if (sub.includes('math') || sub.includes('رياضيات')) return 'منى الوهيبية';
    if (sub.includes('arab') || sub.includes('عربي')) return 'سالم الكعبي';
    if (sub.includes('eng') || sub.includes('إنجليز')) return 'مريم الحرسوسية';
    if (sub.includes('islam') || sub.includes('إسلام')) return 'سعيد الجنيبي';

    return 'فاطمة السيابية';
  };

  // Format title strictly as: "ملفات أ. فلان الفلاني"
  const formatTeacherDisplayName = (pureName: string, lang: Language = 'ar'): string => {
    return lang === 'ar' ? `ملفات أ. ${pureName}` : `Files of ${pureName}`;
  };

  // Helper to format or display the exact document type chosen by the teacher
  const formatDocumentType = (type?: string, lang: Language = 'ar'): string => {
    if (!type || !type.trim()) return lang === 'ar' ? 'وثيقة تقييم' : 'Document';
    const clean = type.trim();
    if (clean === 'test') return lang === 'ar' ? 'امتحان موحد' : 'Unified Exam';
    if (clean === 'quiz') return lang === 'ar' ? 'اختبار قصير' : 'Quiz';
    return clean;
  };

  // Automatically find the examiner of the corresponding subject
  const getExaminerForSubject = (subject: string): UserProfile | undefined => {
    if (!examiners || examiners.length === 0) return undefined;
    if (!subject) return examiners[0];

    const clean = (s: string) => s.toLowerCase().replace(/^(ال|al-)/, '').trim();
    const targetClean = clean(subject);
    const targetEn = translateSubject(subject, 'en').toLowerCase();
    const targetAr = translateSubject(subject, 'ar');

    // 1. Direct match on subject
    let found = examiners.find(ex => {
      if (!ex.subject) return false;
      const exSubClean = clean(ex.subject);
      const exSubEn = translateSubject(ex.subject, 'en').toLowerCase();
      const exSubAr = translateSubject(ex.subject, 'ar');
      return (
        exSubClean === targetClean ||
        exSubEn === targetEn ||
        exSubAr === targetAr ||
        ex.subject.toLowerCase() === subject.toLowerCase()
      );
    });
    if (found) return found;

    // 2. Partial match
    found = examiners.find(ex => {
      if (!ex.subject) return false;
      const exSubLower = ex.subject.toLowerCase();
      const subLower = subject.toLowerCase();
      return exSubLower.includes(subLower) || subLower.includes(exSubLower);
    });
    if (found) return found;

    // 3. Fallback to any examiner with 'all' or general or first
    found = examiners.find(ex => ex.subject && (ex.subject.toLowerCase() === 'all' || ex.subject === 'عام'));
    return found || examiners[0];
  };

  // Group pending assessments by School (larger master folder), then by Teacher
  const schoolGroups: SchoolFolderGroup[] = React.useMemo(() => {
    const schoolMap = new Map<string, Map<string, TeacherFolderGroup>>();

    pendingDispatchAssessments.forEach(item => {
      const pureName = customTeacherNames[item.schoolId || ''] || 
        customTeacherNames[item.id] || 
        resolveTeacherName(item, allUsers);
      let school = item.schoolName?.trim() || '';
      if (!school || school === 'مدرسة عامة' || school === 'General School') {
        if (item.schoolId) {
          const u = allUsers.find(p => p.uid === item.schoolId);
          if (u && u.schoolName) school = u.schoolName.trim();
        }
      }
      if (!school) {
        school = language === 'ar' ? 'مدرسة النهضة للتعليم الأساسي' : 'Al Nahda Basic School';
      }
      const subject = item.subject || '';
      const key = `${school}___${pureName}___${subject}`;

      if (!schoolMap.has(school)) {
        schoolMap.set(school, new Map<string, TeacherFolderGroup>());
      }

      const teacherMap = schoolMap.get(school)!;
      if (!teacherMap.has(key)) {
        teacherMap.set(key, {
          teacherKey: key,
          teacherDisplayName: formatTeacherDisplayName(pureName, language),
          pureTeacherName: pureName,
          schoolName: school,
          subject: subject,
          principalApprovedBy: item.principalApprovedBy,
          items: []
        });
      }
      teacherMap.get(key)!.items.push(item);
    });

    return Array.from(schoolMap.entries())
      .filter(([schoolName, tMap]) => {
        const teachers = Array.from(tMap.values());
        const total = teachers.reduce((sum, t) => sum + t.items.length, 0);
        return total > 0 && schoolName.trim().length > 0;
      })
      .map(([schoolName, tMap]) => {
        const teachers = Array.from(tMap.values());
        const totalFiles = teachers.reduce((sum, t) => sum + t.items.length, 0);
        return {
          schoolName,
          totalFiles,
          teachers
        };
      });
  }, [pendingDispatchAssessments, allUsers, customTeacherNames, language]);

  const totalTeacherFoldersCount = React.useMemo(() => {
    return schoolGroups.reduce((acc, sch) => acc + sch.teachers.length, 0);
  }, [schoolGroups]);

  // Auto-select first school on load so teacher files and return button are immediately visible
  useEffect(() => {
    if (!hasAutoOpened && schoolGroups.length > 0 && activeSchoolName === null) {
      setActiveSchoolName(schoolGroups[0].schoolName);
      setHasAutoOpened(true);
    }
  }, [schoolGroups, hasAutoOpened, activeSchoolName]);

  const toggleFolder = (key: string) => {
    setOpenFolders(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAutoDispatchTeacherGroup = async (group: TeacherFolderGroup) => {
    const targetEx = getExaminerForSubject(group.subject);
    if (!targetEx) {
      onError(language === 'ar' ? 'لم يتم العثور على فاحص معتمد مسجل في النظام لهذه المادة.' : 'No registered examiner found for this subject.');
      return;
    }

    setActionLoading(true);
    try {
      await Promise.all(
        group.items.map(item => 
          dispatchAssessmentToExaminer(item.id, targetEx.uid, targetEx.name, userProfile)
        )
      );
      onSuccess(
        language === 'ar'
          ? `تم تحويل كافة ${group.teacherDisplayName} (${group.items.length} ملفات) آلياً إلى فاحص المادة (${targetEx.name}).`
          : `All files from ${group.teacherDisplayName} (${group.items.length} files) were automatically dispatched to examiner (${targetEx.name}).`
      );
      if (onRefreshAssessments) onRefreshAssessments();
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error dispatching teacher files');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoDispatchSingleFile = async (item: Assessment, subject: string) => {
    const targetEx = getExaminerForSubject(subject);
    if (!targetEx) {
      onError(language === 'ar' ? 'لم يتم العثور على فاحص معتمد لهذه المادة في النظام.' : 'No examiner registered for this subject.');
      return;
    }

    setActionLoading(true);
    try {
      await dispatchAssessmentToExaminer(item.id, targetEx.uid, targetEx.name, userProfile);
      onSuccess(
        language === 'ar'
          ? `تم تحويل الملف (${item.title}) آلياً إلى فاحص المادة (${targetEx.name}).`
          : `File (${item.title}) dispatched to examiner (${targetEx.name}).`
      );
      if (onRefreshAssessments) onRefreshAssessments();
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error dispatching file');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const handleSelectAllInSchool = (files: Assessment[]) => {
    const fileIds = files.map(f => f.id);
    const allSelected = fileIds.length > 0 && fileIds.every(id => selectedFileIds.includes(id));
    if (allSelected) {
      setSelectedFileIds(prev => prev.filter(id => !fileIds.includes(id)));
    } else {
      setSelectedFileIds(prev => Array.from(new Set([...prev, ...fileIds])));
    }
  };

  const handleSelectAllInTeacher = (teacherFiles: Assessment[]) => {
    const fileIds = teacherFiles.map(f => f.id);
    const allSelected = fileIds.length > 0 && fileIds.every(id => selectedFileIds.includes(id));
    if (allSelected) {
      setSelectedFileIds(prev => prev.filter(id => !fileIds.includes(id)));
    } else {
      setSelectedFileIds(prev => Array.from(new Set([...prev, ...fileIds])));
    }
  };

  const handleBulkApprove = async (targetFileIds?: string[]) => {
    const idsToApprove = targetFileIds || selectedFileIds;
    if (idsToApprove.length === 0) {
      onError(language === 'ar' ? 'الرجاء تحديد ملف واحد على الأقل للاعتماد.' : 'Please select at least one file to approve.');
      return;
    }

    setActionLoading(true);
    try {
      await Promise.all(
        idsToApprove.map(id => approveAssessmentByPrincipal(id, userProfile))
      );
      onSuccess(
        language === 'ar'
          ? `تم اعتماد عدد (${idsToApprove.length}) ملفات بنجاح من قِبل مدير المدرسة وحفظها في النظام.`
          : `Successfully bulk approved (${idsToApprove.length}) file(s) by the Principal.`
      );
      setSelectedFileIds(prev => prev.filter(id => !idsToApprove.includes(id)));
      if (onRefreshAssessments) onRefreshAssessments();
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error bulk approving files');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleApprove = async (assessmentId: string, fileTitle: string) => {
    setActionLoading(true);
    try {
      await approveAssessmentByPrincipal(assessmentId, userProfile);
      onSuccess(
        language === 'ar'
          ? `تم اعتماد الملف (${fileTitle}) بنجاح بواسطة مدير المدرسة.`
          : `File (${fileTitle}) approved by Principal.`
      );
      if (onRefreshAssessments) onRefreshAssessments();
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error approving file');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveAllAndDispatchToExaminers = async (groupSchool: SchoolFolderGroup) => {
    const allFiles = groupSchool.teachers.flatMap(t => t.items);
    if (allFiles.length === 0) {
      onError(language === 'ar' ? 'لا توجد ملفات في مجلد هذه المدرسة.' : 'No files in this school folder.');
      return;
    }

    setActionLoading(true);
    try {
      // 1. Approve all files by Principal
      await Promise.all(
        allFiles.map(file => approveAssessmentByPrincipal(file.id, userProfile))
      );

      // 2. Dispatch each teacher group to its subject examiner
      for (const teacherGroup of groupSchool.teachers) {
        const targetEx = getExaminerForSubject(teacherGroup.subject);
        if (targetEx) {
          await Promise.all(
            teacherGroup.items.map(file => 
              dispatchAssessmentToExaminer(file.id, targetEx.uid, targetEx.name, userProfile)
            )
          );
        }
      }

      onSuccess(
        language === 'ar'
          ? `تم اعتماد كافة ملفات مدرسة (${groupSchool.schoolName}) بنجاح وتحويلها تلقائياً إلى الفاحصين المعتمدين لكل مادة.`
          : `All files for (${groupSchool.schoolName}) were approved and dispatched to examiners successfully.`
      );
      setSelectedFileIds([]);
      if (onRefreshAssessments) onRefreshAssessments();
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error approving and dispatching files');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleAdminUnlock = async (schoolName: string, currentUnlocked: boolean) => {
    const nextUnlocked = !currentUnlocked;

    // Instant synchronous React state toggle
    // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
    setPlans(prev => {
      const exists = prev.some(p => p.schoolName === schoolName || isSameSchool(p.schoolName, schoolName));
      if (exists) {
        return prev.map(p => (p.schoolName === schoolName || isSameSchool(p.schoolName, schoolName)) ? { 
          ...p, 
          adminUnlocked: nextUnlocked,
          principalUnlocked: nextUnlocked ? p.principalUnlocked : false,
          principalUnlockedAt: nextUnlocked ? p.principalUnlockedAt : undefined
        } : p);
      } else {
        return [...prev, { schoolName, inspectionDate: new Date().toISOString().split('T')[0], adminUnlocked: nextUnlocked, principalUnlocked: false }];
      }
    });

    try {
      await toggleAdminUploadPermission(schoolName, nextUnlocked);
      onSuccess(
        language === 'ar'
          ? (nextUnlocked 
              ? `تم فتح صلاحية الرفع لمدرسة (${schoolName}) بنجاح وبانتظار تفعيل المدير.`
              : `تم إغلاق الصلاحية لمدرسة (${schoolName}) وأُغلقت صلاحية المدير تلقائياً.`)
          : (nextUnlocked 
              ? `Upload permissions unlocked for ${schoolName}. Awaiting principal activation.`
              : `Admin locked permissions for ${schoolName}. Principal permission automatically revoked.`)
      );
    } catch (err: any) {
      setPlans(prev => prev.map(p => (p.schoolName === schoolName || isSameSchool(p.schoolName, schoolName)) ? { ...p, adminUnlocked: currentUnlocked } : p));
      onError(err.message || 'Error updating upload permission');
    }
  };

  const handleSaveDate = async (schoolName: string) => {
    if (!editDate) {
      onError(language === 'ar' ? 'الرجاء اختيار تاريخ الفحص المحدد.' : 'Please select an inspection date.');
      return;
    }
    setActionLoading(true);
    try {
      await saveInspectionPlan({
        schoolName,
        inspectionDate: editDate,
        notes: editNotes
      });
      onSuccess(
        language === 'ar'
          ? `تم حفظ وتحديث تاريخ الفحص لمدرسة (${schoolName}) إلى ${editDate}.`
          : `Inspection date updated for ${schoolName} to ${editDate}.`
      );
      setEditingSchool(null);
      await loadData();
    } catch (err: any) {
      onError(err.message || 'Error saving date');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatchToExaminer = async (assessmentId: string, directExUid?: string) => {
    const exUid = directExUid || selectedExaminer[assessmentId];
    if (!exUid) {
      onError(language === 'ar' ? 'الرجاء اختيار الفاحص / المشرف المعتمد أولاً.' : 'Please select an examiner first.');
      return;
    }
    const targetEx = examiners.find(e => e.uid === exUid);
    const exName = targetEx ? targetEx.name : 'الفاحص المعتمد';

    setActionLoading(true);
    try {
      await dispatchAssessmentToExaminer(assessmentId, exUid, exName, userProfile);
      onSuccess(
        language === 'ar'
          ? `تم استلام الملف وتحويله بنجاح إلى الفاحص (${exName}).`
          : `Document dispatched to examiner (${exName}).`
      );
      if (onRefreshAssessments) onRefreshAssessments();
    } catch (err: any) {
      onError(err.message || 'Error dispatching document');
    } finally {
      setActionLoading(false);
    }
  };

  // Build full list of schools across the Governorate
  const allSchoolDocs = OMAN_WUSTA_SCHOOLS.flatMap(w => w.schools);

  const filteredSchools = allSchoolDocs.filter(s => 
    s.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full space-y-12 font-sans px-0 py-4" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-indigo-900/50 shadow-2xl w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {language === 'ar' ? 'سلسلة رفع الملفات الخماسية' : '5-Step Upload Lifecycle'}
            </span>
            <h2 className="text-xl sm:text-2xl font-black font-heading mt-1">
              {language === 'ar' ? 'خطة الفحص والصلاحيات' : 'Inspection Plan & Permissions'}
            </h2>
            <p className="text-xs text-slate-300 font-medium mt-1">
              {language === 'ar' 
                ? 'إدارة خطة الفحص وتحديد مواعيد الفحص للمدارس، تفعيل صلاحيات الرفع، وتحويل الملفات المستلمة للفاحصين.'
                : 'Configure school inspection dates, manage upload locks, and dispatch principal-approved files to examiners.'}
            </p>
          </div>

          <div className="bg-white/10 px-4 py-3 rounded-2xl border border-white/15 text-center shrink-0">
            <span className="text-[10px] text-amber-300 font-bold block">{language === 'ar' ? 'الملفات بانتظار تحويل الفاحصين' : 'Awaiting Dispatch'}</span>
            <span className="text-2xl font-black text-white">{pendingDispatchAssessments.length}</span>
          </div>
        </div>
      </div>

      {/* STEP 5 DISPATCH SECTION (GROUPED SCHOOL DOSSIERS CONTAINING TEACHER FOLDERS) */}
      {schoolGroups.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-amber-50/90 border border-amber-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* زر الرجوع لقائمة المدارس على اليمين - مظهر رسمي */}
              {activeSchoolName && (
                <button
                  type="button"
                  onClick={() => setActiveSchoolName(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer border border-slate-700 hover:border-slate-600"
                  title={language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}
                >
                  <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 text-slate-300" />
                  <Folder className="w-4 h-4 text-amber-400" />
                  <span>{language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}</span>
                </button>
              )}

              <div className="flex items-center gap-2.5">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base font-heading">
                    {language === 'ar'
                      ? (activeSchoolName
                          ? (activeSchoolName.startsWith('مدرسة') ? `مجلدات ${activeSchoolName}` : `مجلدات مدرسة ${activeSchoolName}`)
                          : 'مجلدات المدارس')
                      : (activeSchoolName ? `Folders of ${activeSchoolName}` : 'School Folders')}
                  </h3>
                  <p className="text-[11px] text-slate-600 font-medium">
                    {language === 'ar'
                      ? (activeSchoolName ? 'الملفات المعتمدة الجاهزة للتحويل للفاحصين' : 'مجلدات المدارس المعتمدة تحتوي على ملفات كل معلم. اضغط على مجلد المدرسة لفتحه.')
                      : 'School dossiers containing teacher files. Click any school folder to open it.'}
                  </p>
                </div>
              </div>
            </div>

            {/* COUNTER STATS ON THE LEFT (END OF ROW) */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span className="bg-amber-200 text-amber-950 px-2.5 py-0.5 rounded-full text-[11px] font-black shadow-3xs">
                {totalTeacherFoldersCount} {language === 'ar' ? 'مجلدات معلمين' : 'teacher folders'}
              </span>
              <span className="bg-indigo-900 text-white px-2.5 py-0.5 rounded-full text-[11px] font-black shadow-3xs">
                {pendingDispatchAssessments.length} {language === 'ar' ? 'ملفات' : 'files'}
              </span>
            </div>
          </div>

          {/* STEP 5 CONTENT: EITHER SCHOOLS LIST OR SINGLE SCHOOL TEACHER VIEW */}
          {!activeSchoolName ? (
            /* VIEW 1: LIST OF SCHOOL FOLDERS (مجلدات المدارس التي رفعت ملفات فقط) */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <Folder className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-black font-heading">
                  {language === 'ar' ? 'مجلدات المدارس التي رفعت ملفات:' : 'Folders of Schools with Uploaded Files:'}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {language === 'ar' ? '(انقر على أي مدرسة لفتح ملفات معلميها)' : '(Click any school folder to open its teacher files)'}
                </span>
              </div>

              {/* FOLDERS PLACED SIDE BY SIDE (جنب بعضها صغيرة) */}
              <div className="flex flex-wrap gap-3 items-stretch">
                {schoolGroups.map((schoolGroup) => (
                  <button
                    type="button"
                    key={`school-folder-tab-${schoolGroup.schoolName}`}
                    onClick={() => setActiveSchoolName(schoolGroup.schoolName)}
                    className="w-full sm:w-64 md:w-72 rounded-2xl border-2 border-amber-300 hover:border-amber-500 bg-white hover:bg-amber-50/60 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col text-right cursor-pointer select-none group"
                  >
                    {/* FOLDER TOP TAB */}
                    <div className="w-full bg-gradient-to-r from-amber-400 to-amber-500 group-hover:from-amber-500 group-hover:to-amber-600 px-3.5 py-1.5 flex items-center justify-between text-slate-950 font-black text-xs transition-colors">
                      <div className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 fill-slate-950/20 text-slate-950" />
                        <span className="text-[11px] font-extrabold">{language === 'ar' ? 'مجلد مدرسة' : 'School Folder'}</span>
                      </div>
                      <span className="bg-slate-950/15 text-slate-950 px-2 py-0.2 rounded-full text-[10px] font-extrabold">
                        {schoolGroup.totalFiles} {language === 'ar' ? 'ملفات' : 'files'}
                      </span>
                    </div>

                    {/* FOLDER BODY WITH SCHOOL NAME */}
                    <div className="p-3.5 w-full flex-1 flex flex-col justify-between space-y-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 group-hover:bg-amber-200 border border-amber-300 flex items-center justify-center shrink-0 text-amber-800 shadow-3xs transition-colors">
                          <Building2 className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 group-hover:text-amber-950 transition-colors">
                            {schoolGroup.schoolName}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 font-semibold mt-1">
                            <span>{schoolGroup.teachers.length} {language === 'ar' ? 'معلمين' : 'teachers'}</span>
                            <span>•</span>
                            <span>{schoolGroup.totalFiles} {language === 'ar' ? 'ملفات مرفوعة' : 'files'}</span>
                          </div>
                        </div>
                      </div>

                      {/* CLICK TO OPEN ACTION */}
                      <div className="pt-2 border-t border-amber-200/60 w-full flex items-center justify-between text-[11px] text-amber-900 font-black group-hover:text-amber-950">
                        <span className="bg-amber-100 group-hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors">
                          {language === 'ar' ? 'فتح مجلد المدرسة' : 'Open School Folder'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180 ltr:rotate-0 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* VIEW 2: TEACHERS VIEW OF SELECTED SCHOOL (مع زر الرجوع لقائمة المدارس وتختفي بوكس المدرسة) */
            <div className="space-y-4">
              {(() => {
                const activeGroup = schoolGroups.find(sg => sg.schoolName === activeSchoolName);
                if (!activeGroup) {
                  return (
                    <div className="p-6 bg-white rounded-2xl border border-amber-200 text-center space-y-3">
                      <p className="text-sm font-bold text-slate-700">
                        {language === 'ar' ? 'تم تحويل كافة ملفات هذه المدرسة بنجاح.' : 'All files for this school have been dispatched.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveSchoolName(null)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                        title={language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}
                      >
                        <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                        <span>{language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-white/95 rounded-2xl border-2 border-amber-300/80 p-4 sm:p-5 shadow-sm space-y-4">
                    {/* TOP BAR WITH BACK BUTTON AND SCHOOL TITLE */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* زر مجلدات المدارس - مظهر رسمي */}
                        <button
                          type="button"
                          onClick={() => setActiveSchoolName(null)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm hover:shadow-md cursor-pointer border border-slate-700 hover:border-slate-600 active:scale-95"
                          title={language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}
                        >
                          <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 text-slate-300" />
                          <Folder className="w-4 h-4 text-amber-400" />
                          <span>{language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}</span>
                        </button>

                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-3xs">
                            <FolderOpen className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
                              <span>{language === 'ar' ? 'مجلدات المدارس' : 'School Folders'}</span>
                              <span>/</span>
                              <span className="text-amber-800">{activeGroup.schoolName}</span>
                            </div>
                            <h4 className="font-black text-slate-900 text-sm sm:text-base font-heading">
                              {language === 'ar' ? `ملفات معلمي: ${activeGroup.schoolName}` : `Teacher Files of: ${activeGroup.schoolName}`}
                            </h4>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="bg-amber-100 text-amber-900 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                          {activeGroup.teachers.length} {language === 'ar' ? 'معلمين' : 'teachers'}
                        </span>
                        <span className="bg-indigo-900 text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                          {activeGroup.totalFiles} {language === 'ar' ? 'ملفات' : 'files'}
                        </span>
                      </div>
                    </div>

                    {/* زر اعتماد الكل وتحويل للفاحصين على اليسار - تصميم عصري واحترافي */}
                    <div className="flex items-center rtl:justify-end ltr:justify-start py-1">
                      <button
                        type="button"
                        disabled={actionLoading || activeGroup.totalFiles === 0}
                        onClick={() => handleApproveAllAndDispatchToExaminers(activeGroup)}
                        className="group relative inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl font-heading font-black text-xs sm:text-[13px] text-white bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 hover:from-emerald-500 hover:via-teal-600 hover:to-emerald-700 shadow-sm hover:shadow-lg hover:shadow-emerald-900/20 active:scale-[0.98] transition-all duration-200 cursor-pointer border border-emerald-400/30 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed select-none"
                        title={language === 'ar' ? 'اعتماد كافة ملفات المدرسة وتحويلها للفاحصين' : 'Approve all files and dispatch to examiners'}
                      >
                        {/* Shimmer sweep effect */}
                        <span className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-out pointer-events-none" />

                        {/* Frosted icon badge */}
                        <span className="w-6 h-6 rounded-lg bg-white/20 border border-white/25 flex items-center justify-center shadow-3xs shrink-0 group-hover:scale-105 transition-transform">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </span>

                        {/* Label */}
                        <span className="tracking-tight text-white font-black drop-shadow-2xs">
                          {language === 'ar' ? 'اعتماد الكل وتحويل للفاحصين' : 'Approve All & Dispatch to Examiners'}
                        </span>

                        {/* Micro-moving send icon */}
                        <Send className="w-3.5 h-3.5 text-emerald-200 group-hover:text-white transition-all rtl:group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5 shrink-0" />
                      </button>
                    </div>

                    {/* TEACHER FOLDERS SIDE BY SIDE */}
                    <div className="flex flex-wrap gap-4 items-start pt-1">
                      {activeGroup.teachers.map((group) => {
                        const isOpen = !!openFolders[group.teacherKey];
                        const targetExaminer = getExaminerForSubject(group.subject);
                        const unapprovedTeacherFiles = group.items.filter(f => f.workflowStage !== 'principal_approved' && !f.principalApprovedBy);
                        const isTeacherAllSelected = group.items.length > 0 && group.items.every(f => selectedFileIds.includes(f.id));

                        return (
                          <div 
                            key={`folder-${group.teacherKey}`} 
                            className="w-full sm:w-80 md:w-88 bg-white rounded-2xl border-2 border-amber-300 hover:border-amber-400 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
                          >
                            {/* FOLDER TOP TAB */}
                            <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 flex items-center justify-between text-slate-950 font-black text-xs select-none">
                              <div className="flex items-center gap-1.5">
                                {isOpen ? (
                                  <FolderOpen className="w-4 h-4 fill-slate-950/20" />
                                ) : (
                                  <Folder className="w-4 h-4 fill-slate-950/20" />
                                )}
                                <span>{language === 'ar' ? 'مجلد أعمال معتمد' : 'Approved Dossier'}</span>
                              </div>
                              <span className="bg-slate-950/15 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold">
                                {group.items.length} {language === 'ar' ? 'ملفات' : 'files'}
                              </span>
                            </div>

                            {/* FOLDER CARD BODY */}
                            <div className="p-4 space-y-3.5 bg-gradient-to-b from-amber-50/30 via-white to-white flex-1 flex flex-col justify-between">
                              <div className="space-y-2.5">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-700 shadow-2xs">
                                    {isOpen ? (
                                      <FolderOpen className="w-5 h-5 text-indigo-600 fill-indigo-100" />
                                    ) : (
                                      <Folder className="w-5 h-5 text-amber-600 fill-amber-200" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-black text-slate-900 text-sm sm:text-base font-heading leading-snug">
                                      {group.teacherDisplayName}
                                    </h4>

                                    <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500 font-medium truncate mt-0.5">
                                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="truncate">{group.schoolName}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                  <span className="bg-indigo-50 text-indigo-800 text-[10.5px] font-extrabold px-2 py-0.5 rounded-md border border-indigo-200">
                                    {translateSubject(group.subject, language)}
                                  </span>
                                  {unapprovedTeacherFiles.length === 0 ? (
                                    <span className="bg-emerald-50 text-emerald-800 text-[10.5px] font-bold px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      {language === 'ar' ? 'موافقة المدير' : 'Principal Approved'}
                                    </span>
                                  ) : (
                                    <span className="bg-amber-50 text-amber-800 text-[10.5px] font-bold px-2 py-0.5 rounded-md border border-amber-200">
                                      {language === 'ar' ? `${unapprovedTeacherFiles.length} بانتظار الاعتماد` : `${unapprovedTeacherFiles.length} pending`}
                                    </span>
                                  )}
                                  {targetExaminer && (
                                    <span className="text-[10.5px] text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded-md border border-indigo-100 font-medium">
                                      {language === 'ar' ? 'الفاحص:' : 'Examiner:'} <strong className="font-extrabold">{targetExaminer.name}</strong>
                                    </span>
                                  )}
                                </div>

                                {/* Teacher-level selection toggle */}
                                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-amber-200/50">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAllInTeacher(group.items)}
                                    className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    <span>
                                      {isTeacherAllSelected
                                        ? (language === 'ar' ? 'إلغاء تحديد ملفات المعلم' : 'Deselect Teacher Files')
                                        : (language === 'ar' ? 'تحديد ملفات المعلم' : 'Select Teacher Files')}
                                    </span>
                                  </button>

                                  {unapprovedTeacherFiles.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() => handleBulkApprove(unapprovedTeacherFiles.map(f => f.id))}
                                      className="text-[10px] px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-md font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                                      title={language === 'ar' ? 'اعتماد جميع ملفات هذا المعلم دفعة واحدة' : 'Approve all files of this teacher'}
                                    >
                                      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                      <span>{language === 'ar' ? `اعتماد (${unapprovedTeacherFiles.length})` : `Approve (${unapprovedTeacherFiles.length})`}</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* EXTERIOR ACTIONS */}
                              <div className="pt-2 border-t border-amber-200/70 space-y-2">
                                {/* زر تحويل للفاحص */}
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAutoDispatchTeacherGroup(group);
                                  }}
                                  className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                  title={language === 'ar' ? `تحويل كافة ملفات ${group.teacherDisplayName} آلياً إلى فاحص المادة` : 'Auto-dispatch teacher files to subject examiner'}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>{language === 'ar' ? 'تحويل للفاحص' : 'Dispatch to Examiner'}</span>
                                </button>

                                {/* زر فتح / إغلاق المجلد */}
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(group.teacherKey)}
                                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200/80"
                                >
                                  <span>{isOpen ? (language === 'ar' ? 'إغلاق المجلد' : 'Close Folder') : (language === 'ar' ? 'فتح المجلد (معاينة الملفات)' : 'Open Folder (View Files)')}</span>
                                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {/* FOLDER CONTENTS */}
                            {isOpen && (
                              <div className="border-t-2 border-amber-200/80 bg-amber-50/40 p-3.5 space-y-2.5 max-h-80 overflow-y-auto">
                                <div className="text-[11px] font-bold text-slate-700 pb-1.5 border-b border-amber-200/60 flex items-center justify-between">
                                  <span className="flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{language === 'ar' ? 'الملفات المرفوعة:' : 'Uploaded Files:'}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    {group.items.length} {language === 'ar' ? 'ملفات جاهزة' : 'ready'}
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {group.items.map((file, idx) => {
                                    const isSelected = selectedFileIds.includes(file.id);
                                    const isApproved = file.workflowStage === 'principal_approved' || !!file.principalApprovedBy;

                                    return (
                                      <div 
                                        key={`file-${file.id}`}
                                        className={`p-2.5 rounded-xl border transition-all space-y-1.5 shadow-3xs ${
                                          isSelected 
                                            ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-400/40' 
                                            : 'bg-white border-slate-200 hover:border-indigo-300'
                                        }`}
                                      >
                                        <div className="flex items-start gap-2">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleSelectFile(file.id)}
                                            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                                            title={language === 'ar' ? 'تحديد للاعتماد الجماعي' : 'Select for Bulk Approval'}
                                          />
                                          <span className="w-5 h-5 rounded-md bg-indigo-50 border border-indigo-200 flex items-center justify-center text-[10px] font-black text-indigo-700 shrink-0 mt-0.5">
                                            {idx + 1}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                              <h5 className="font-extrabold text-slate-900 text-xs leading-tight truncate">
                                                {file.title}
                                              </h5>
                                              {isApproved ? (
                                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
                                                  {language === 'ar' ? 'معتمد' : 'Approved'}
                                                </span>
                                              ) : (
                                                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded-md shrink-0">
                                                  {language === 'ar' ? 'بانتظار الاعتماد' : 'Pending'}
                                                </span>
                                              )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 font-medium mt-0.5">
                                              <span className="bg-slate-100 text-slate-800 px-1.5 py-0.2 rounded font-bold">{file.grade}</span>
                                              <span>•</span>
                                              <span className="bg-amber-100/60 text-amber-900 px-1.5 py-0.2 rounded font-bold">{formatDocumentType(file.type, language)}</span>
                                              {file.pdfName && (
                                                <>
                                                  <span>•</span>
                                                  <span className="text-indigo-600 flex items-center gap-0.5 font-semibold">
                                                    <Paperclip className="w-2.5 h-2.5" />
                                                    {file.pdfName}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 flex-wrap">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenPreview(file)}
                                            className="flex-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-[10.5px] font-black flex items-center justify-center gap-1 cursor-pointer transition-all shadow-3xs"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>{language === 'ar' ? 'معاينة' : 'Preview'}</span>
                                          </button>

                                          {!isApproved && (
                                            <button
                                              type="button"
                                              disabled={actionLoading}
                                              onClick={() => handleSingleApprove(file.id, file.title)}
                                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-3xs"
                                              title={language === 'ar' ? 'اعتماد هذا الملف من مدير المدرسة' : 'Approve by Principal'}
                                            >
                                              <CheckCircle2 className="w-3 h-3 text-white" />
                                              <span>{language === 'ar' ? 'اعتماد' : 'Approve'}</span>
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => handleAutoDispatchSingleFile(file, group.subject)}
                                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                            title={language === 'ar' ? 'تحويل هذا الملف للفاحص' : 'Dispatch this file'}
                                          >
                                            <Send className="w-2.5 h-2.5 text-slate-500" />
                                            <span>{language === 'ar' ? 'تحويل' : 'Dispatch'}</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  )}

      {/* STEP 1 & 2 SEARCH AND PERMISSIONS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-12 space-y-8 w-full min-h-[1200px]">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="space-y-1.5">
            <h3 className="font-extrabold text-slate-900 text-lg font-heading flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-indigo-600" />
              {language === 'ar' ? 'فتح الصلاحيات' : 'Grant & Open Permissions'}
            </h3>
            <p className="text-sm text-slate-500 font-medium">
              {language === 'ar' ? 'قم بتحديد تاريخ الفحص لكل مدرسة، ثم افتح صلاحية الرفع للمدرسة في موعد الفحص الخاص بها.' : 'Set inspection dates per school and unlock upload access on inspection day.'}
            </p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="w-4.5 h-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={language === 'ar' ? 'البحث باسم المدرسة...' : 'Filter schools...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50 focus:outline-none focus:border-indigo-600 font-medium shadow-xs"
            />
          </div>
        </div>

        {/* SCHOOLS PERMISSION GRID / TABLE */}
        <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black uppercase text-xs">
                  <th className="py-6 px-8 text-right">{language === 'ar' ? 'المدرسة / المؤسسة التعليمية' : 'School'}</th>
                  <th className="py-6 px-8 text-center">{language === 'ar' ? 'تاريخ الفحص المحدد' : 'Inspection Date'}</th>
                  <th className="py-6 px-8 text-center">{language === 'ar' ? 'صلاحية مدير النظام' : 'Admin Unlock'}</th>
                  <th className="py-6 px-8 text-center">{language === 'ar' ? 'صلاحية مدير المدرسة للمعلمين' : 'Principal Unlock'}</th>
                  <th className="py-6 px-8 text-center">{language === 'ar' ? 'حالة إمكانية رفع المعلمين' : 'Teacher Upload Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSchools.map((school) => {
                  const schName = school.nameAr;
                  const plan = plans.find(p => p.schoolName === schName || schName.includes(p.schoolName) || isSameSchool(p.schoolName, schName));
                  const isEditing = editingSchool === schName;
                  const adminUnlocked = plan?.adminUnlocked ?? false;
                  // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
                  const principalUnlocked = adminUnlocked ? (plan?.principalUnlocked ?? false) : false;
                  const canTeacherUpload = adminUnlocked && principalUnlocked;
                  const inspDate = plan?.inspectionDate || 'غير محدد';

                  return (
                    <tr key={schName} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-5 px-6 font-extrabold text-slate-900 text-sm">
                        {schName}
                      </td>

                      {/* Step 1 Date Column */}
                      <td className="py-5 px-6 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="px-3 py-1.5 border border-indigo-400 rounded-xl text-xs font-bold bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveDate(schName)}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSchool(null)}
                              className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSchool(schName);
                              setEditDate(plan?.inspectionDate || new Date().toISOString().split('T')[0]);
                              setEditNotes(plan?.notes || '');
                            }}
                            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-mono text-xs font-bold cursor-pointer transition-colors border border-slate-200"
                            title="انقر لتعديل تاريخ الفحص"
                          >
                            <Calendar className="w-4 h-4 text-indigo-600" />
                            <span>{inspDate}</span>
                          </button>
                        )}
                      </td>

                      {/* Step 2a Admin Unlock Column */}
                      <td className="py-5 px-6 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAdminUnlock(schName, adminUnlocked)}
                          className={`px-4 py-2 rounded-xl font-black text-xs cursor-pointer transition-all inline-flex items-center gap-2 active:scale-95 shadow-2xs ${
                            adminUnlocked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                          }`}
                        >
                          {adminUnlocked ? <Unlock className="w-4 h-4 text-white" /> : <Lock className="w-4 h-4 text-white" />}
                          <span>{adminUnlocked ? (language === 'ar' ? 'مفتوحة' : 'Unlocked') : (language === 'ar' ? 'مغلقة' : 'Locked')}</span>
                        </button>
                      </td>

                      {/* Step 2b Principal Unlock Column */}
                      <td className="py-5 px-6 text-center">
                        <span className={`px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                          principalUnlocked
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-3xs'
                            : !adminUnlocked
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {principalUnlocked ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : !adminUnlocked ? (
                            <Lock className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-600" />
                          )}
                          <span>
                            {principalUnlocked 
                              ? (language === 'ar' ? 'مفتوحة للمعلمين' : 'Unlocked for Teachers') 
                              : !adminUnlocked 
                              ? (language === 'ar' ? 'مغلقة' : 'Locked')
                              : (language === 'ar' ? 'بانتظار تفعيل المدير' : 'Awaiting Principal')}
                          </span>
                        </span>
                      </td>

                      {/* Final Status */}
                      <td className="py-5 px-6 text-center">
                        {canTeacherUpload ? (
                          <span className="bg-emerald-500 text-white font-black text-xs px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{language === 'ar' ? 'مسموح برفع المعلمين' : 'Upload Allowed'}</span>
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 font-bold text-xs px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 border border-slate-200">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{language === 'ar' ? 'الرفع محظور حالياً' : 'Upload Blocked'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FILE PREVIEW MODAL (معاينة واطلاع شامل على تفاصيل ومرفقات ملف التقييم) */}
      {previewAssessment && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setPreviewAssessment(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#051C3F] to-[#0A2D64] text-white p-4 sm:p-5 flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[10.5px] font-black">
                    {formatDocumentType(previewAssessment.type, language)}
                  </span>
                  <span className="bg-white/15 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold text-slate-200">
                    {translateSubject(previewAssessment.subject, language)}
                  </span>
                  <span className="bg-white/15 px-2 py-0.5 rounded-full text-[10.5px] font-bold text-slate-200">
                    {previewAssessment.grade}
                  </span>
                  {previewAssessment.principalApprovedBy && (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      {language === 'ar' ? 'معتمد من مدير المدرسة' : 'Principal Approved'}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black font-heading truncate text-white">
                  {previewAssessment.title}
                </h3>
                <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap font-medium">
                  <span>{language === 'ar' ? 'المدرسة:' : 'School:'} {previewAssessment.schoolName}</span>
                  {previewAssessment.teacherName && (
                    <>
                      <span>•</span>
                      <span>{language === 'ar' ? 'المعلم:' : 'Teacher:'} {previewAssessment.teacherName}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewAssessment(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title={language === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Subheader */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {previewAssessment.pdfData ? (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-50 text-indigo-800 border border-indigo-200/60 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{language === 'ar' ? 'عرض ملف PDF المرفق' : 'Attached PDF'}</span>
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-50 text-indigo-800 border border-indigo-200/60 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{language === 'ar' ? 'بيانات التقييم' : 'Assessment'}</span>
                  </span>
                )}
              </div>

              {previewAssessment.pdfData && (
                <a
                  href={previewAssessment.pdfData}
                  download={previewAssessment.pdfName || `${previewAssessment.title}.pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  title={language === 'ar' ? 'تنزيل ملف PDF' : 'Download PDF'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تنزيل PDF' : 'Download PDF'}</span>
                </a>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* PDF Preview View */}
              {previewAssessment.pdfData ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <strong>{previewAssessment.pdfName || 'document.pdf'}</strong>
                      {previewAssessment.pdfSize && <span className="text-slate-400">({previewAssessment.pdfSize})</span>}
                    </span>
                    <a
                      href={previewAssessment.pdfData}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>{language === 'ar' ? 'فتح في نافذة كاملة' : 'Open in new tab'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="border border-slate-300 rounded-2xl overflow-hidden bg-slate-100 shadow-inner">
                    <iframe
                      src={previewAssessment.pdfData}
                      title={previewAssessment.title}
                      className="w-full h-[60vh] min-h-[480px] bg-white"
                    />
                  </div>
                </div>
              ) : (
                /* Text Content / Questions & Answers View */
                <div className="space-y-4">
                  {previewAssessment.description && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h4 className="text-xs font-extrabold text-slate-700 mb-1">
                        {language === 'ar' ? 'وصف الاختبار:' : 'Description:'}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed font-sans">
                        {previewAssessment.description}
                      </p>
                    </div>
                  )}

                  {previewAssessment.questions && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs space-y-2">
                      <h4 className="text-xs font-black text-indigo-900 border-b border-indigo-100 pb-1.5 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span>{language === 'ar' ? 'أسئلة ومحتوى الورقة الامتحانية:' : 'Assessment Questions:'}</span>
                      </h4>
                      <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 max-h-72 overflow-y-auto">
                        {previewAssessment.questions}
                      </div>
                    </div>
                  )}

                  {previewAssessment.keyAnswer && (
                    <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-3xs space-y-2">
                      <h4 className="text-xs font-black text-emerald-900 border-b border-emerald-100 pb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{language === 'ar' ? 'نموذج الإجابة المعتمد وتوزيع الدرجات:' : 'Marking Scheme / Answer Key:'}</span>
                      </h4>
                      <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap bg-emerald-50/30 p-3.5 rounded-xl border border-emerald-100 max-h-72 overflow-y-auto">
                        {previewAssessment.keyAnswer}
                      </div>
                    </div>
                  )}

                  {!previewAssessment.questions && !previewAssessment.keyAnswer && !previewAssessment.pdfData && (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-600">
                        {language === 'ar' ? 'لا يتوفر محتوى نصي أو ملف PDF لهذا السجل.' : 'No preview available for this assessment.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPreviewAssessment(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={async () => {
                  const sub = previewAssessment.subject;
                  await handleAutoDispatchSingleFile(previewAssessment, sub);
                  setPreviewAssessment(null);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تحويل هذا الملف للفاحص الآلي الآن' : 'Dispatch to Examiner Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
