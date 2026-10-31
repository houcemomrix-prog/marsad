import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  GraduationCap, 
  FileText, 
  CheckCircle2, 
  HelpCircle, 
  AlertCircle, 
  Clock, 
  Sparkles, 
  Eye, 
  ChevronDown, 
  ChevronUp,
  Bell,
  MailCheck,
  Send,
  Check,
  BookOpen,
  ArrowRight,
  ClipboardCheck,
  CheckSquare,
  FileCheck2,
  ListFilter,
  Folder,
  FolderOpen
} from 'lucide-react';
import { UserProfile, Assessment } from '../types';
import { Language, translateGrade, translateSubject, translateStatus } from '../lib/translations';
import { 
  getAllUserProfiles, 
  createTeacherNotification, 
  getSchoolUploadPermissionStatus, 
  togglePrincipalUploadPermission, 
  approveAssessmentByPrincipal 
} from '../services/db';
import { Badge } from './Badge';
import { OMAN_WUSTA_SCHOOLS } from '../data/schoolsData';

// School name normalizer to pair variations perfectly
export const normalizeSchoolName = (name: string): string => {
  if (!name) return "";
  return name.toLowerCase()
    .replace(/(basic\s+education\s+school|school|مدرسة|للتعليم|الأساسي|الأساسية|التعليم|الخاصة|الخاص)/gi, '')
    .replace(/[\s\-_]/g, '')
    .trim();
};

export const isSameSchool = (school1?: string, school2?: string): boolean => {
  if (!school1 || !school2) return false;
  const raw1 = school1.trim().toLowerCase();
  const raw2 = school2.trim().toLowerCase();
  if (raw1 === raw2) return true;

  for (const wilaya of OMAN_WUSTA_SCHOOLS) {
    for (const sch of wilaya.schools) {
      const match1 = (raw1 === sch.nameAr.toLowerCase() || raw1 === sch.nameEn.toLowerCase() || raw1.includes(sch.nameAr.toLowerCase()) || sch.nameAr.toLowerCase().includes(raw1) || raw1.includes(sch.nameEn.toLowerCase()) || sch.nameEn.toLowerCase().includes(raw1));
      const match2 = (raw2 === sch.nameAr.toLowerCase() || raw2 === sch.nameEn.toLowerCase() || raw2.includes(sch.nameAr.toLowerCase()) || sch.nameAr.toLowerCase().includes(raw2) || raw2.includes(sch.nameEn.toLowerCase()) || sch.nameEn.toLowerCase().includes(raw2));
      if (match1 && match2) return true;
    }
  }

  const s1 = normalizeSchoolName(school1);
  const s2 = normalizeSchoolName(school2);
  return s1.includes(s2) || s2.includes(s1);
};

interface SchoolPrincipalObserverProps {
  userProfile: UserProfile;
  assessments: Assessment[];
  language: Language;
  onInspect: (assessment: Assessment) => void;
  onSuccess: (msg: string) => void;
  onError?: (msg: string) => void;
}

interface TeacherStatus {
  profile: UserProfile;
  uploads: Assessment[];
  complianceStatus: 'completed' | 'partial' | 'none';
  hasNudgeSent: boolean;
}

export function SchoolPrincipalObserver({
  userProfile,
  assessments,
  language,
  onInspect,
  onSuccess,
  onError
}: SchoolPrincipalObserverProps) {
  const [teachers, setTeachers] = useState<TeacherStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [nudgedTeacherIds, setNudgedTeacherIds] = useState<Record<string, boolean>>({});
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [approveLoading, setApproveLoading] = useState<boolean>(false);
  const [openTeacherFolderKey, setOpenTeacherFolderKey] = useState<string | null>(null);

  const principalSchool = userProfile.schoolName || 'مدرسة الدقم للتعليم الأساسي';

  useEffect(() => {
    async function loadTeachers() {
      setLoading(true);
      try {
        // Fetch all profiles from the database
        const allProfiles = await getAllUserProfiles();
        
        // Filter those who are role school & type teacher, and belong to the same school
        const sameSchoolTeachers = allProfiles.filter(p => 
          p.role === 'school' && 
          p.roleType === 'teacher' && 
          isSameSchool(p.schoolName, principalSchool)
        );

        // Core simulated teachers for a robust and satisfying visual experience in sandbox
        const DEFAULT_SIMULATED_TEACHERS: UserProfile[] = [
          {
            uid: 'sim-teacher-math',
            name: language === 'ar' ? 'أ. وليد الريامي' : 'Mr. Waleed Al-Riyami',
            email: 'riyami.math@moe.om',
            role: 'school',
            roleType: 'teacher',
            schoolName: principalSchool,
            subject: 'Mathematics',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString()
          },
          {
            uid: 'sim-teacher-arabic',
            name: language === 'ar' ? 'أ. عائشة الرواحية' : 'Mrs. Aisha Al-Rawahi',
            email: 'rawahi.arabic@moe.om',
            role: 'school',
            roleType: 'teacher',
            schoolName: principalSchool,
            subject: 'Arabic Language',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString()
          },
          {
            uid: 'sim-teacher-it',
            name: language === 'ar' ? 'أ. أمينة البلوشية' : 'Mrs. Amina Al-Balushi',
            email: 'balushi.it@moe.om',
            role: 'school',
            roleType: 'teacher',
            schoolName: principalSchool,
            subject: 'Information Technology',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString()
          },
          {
            uid: 'sim-teacher-islamic',
            name: language === 'ar' ? 'الشيخ أحمد الحوسني' : 'Sheikh Ahmed Al-Hosni',
            email: 'hosni.islamic@moe.om',
            role: 'school',
            roleType: 'teacher',
            schoolName: principalSchool,
            subject: 'Islamic Studies',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35).toISOString()
          }
        ];

        // Combine database teachers and sandbox simulated teachers avoiding duplicates
        const combinedTeachersList = [...sameSchoolTeachers];
        DEFAULT_SIMULATED_TEACHERS.forEach(st => {
          const alreadyExists = combinedTeachersList.some(t => 
            t.email.toLowerCase() === st.email.toLowerCase() || 
            t.subject === st.subject
          );
          if (!alreadyExists) {
            combinedTeachersList.push(st);
          }
        });

        // Now map each teacher with their uploads in the assessments list
        const processed: TeacherStatus[] = combinedTeachersList.map(teacher => {
          // Identify matching assessments uploaded by this teacher
          // A document belongs to this teacher if matching user id or email or name
          const teacherUploads = assessments.filter(ass => 
            ass.schoolId === teacher.uid || 
            (ass.schoolEmail && ass.schoolEmail.toLowerCase() === teacher.email.toLowerCase())
          );

          // Calculate compliance: teachers are expected to have at least one complete syllabus exam/quiz
          let statusResult: 'completed' | 'partial' | 'none' = 'none';
          if (teacherUploads.length >= 2) {
            statusResult = 'completed';
          } else if (teacherUploads.length === 1) {
            statusResult = 'partial';
          }

          return {
            profile: teacher,
            uploads: teacherUploads,
            complianceStatus: statusResult,
            hasNudgeSent: false
          };
        });

        setTeachers(processed);
      } catch (err) {
        console.error("Error matching school teachers: ", err);
      } finally {
        setLoading(false);
      }
    }
    loadTeachers();
  }, [assessments, principalSchool, language]);

    // Track total supportive reminders sent to keep layout active
    const nudgeCount = Object.keys(nudgedTeacherIds).length;

    // Helper to send reminder nudge
    const handleSendNudge = async (teacherId: string, teacherName: string, subject: string) => {
      setNudgedTeacherIds(prev => ({ ...prev, [teacherId]: true }));
      try {
        await createTeacherNotification({
          teacherId,
          teacherName,
          titleAr: 'تنبيه متابعة وتقييم',
          titleEn: 'Curriculum Upload Nudge',
          messageAr: `تم إرسال تنبيه لك لمتابعة مرفوعات أدوات التقويم لمادة ${translateSubject(subject, 'ar')}. يُرجى سرعة الرفع.`,
          messageEn: `A reminder was sent regarding your ${translateSubject(subject, 'en')} curriculum uploads. Please submit them soon.`,
          subject,
          read: false,
          type: 'nudge'
        });
      } catch (e) {
        console.error("Failed to send nudge notification", e);
      }
      const msg = language === 'ar'
        ? `تم إرسال تنبيه متابعة وتدقيق تربوي بنجاح إلى ${teacherName} لمتابعة مرفوعات مادة ${translateSubject(subject, 'ar')}.`
        : `Supportive syllabus upload reminder successfully dispatched to ${teacherName} regarding ${translateSubject(subject, 'en')} curriculum schedule.`;
      onSuccess(msg);
    };

    const handleToggleSelectDoc = (docId: string) => {
      setSelectedDocIds(prev => 
        prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
      );
    };

    const handleSelectAllDocs = (docs: Assessment[]) => {
      const docIds = docs.map(d => d.id);
      const allSelected = docIds.length > 0 && docIds.every(id => selectedDocIds.includes(id));
      if (allSelected) {
        setSelectedDocIds(prev => prev.filter(id => !docIds.includes(id)));
      } else {
        setSelectedDocIds(prev => Array.from(new Set([...prev, ...docIds])));
      }
    };

    const handleBulkApproveDocs = async (targetDocIds?: string[]) => {
      const ids = targetDocIds || selectedDocIds;
      if (ids.length === 0) {
        if (onError) onError(language === 'ar' ? 'الرجاء اختيار ملف واحد على الأقل للاعتماد.' : 'Please select at least one document to approve.');
        return;
      }

      setApproveLoading(true);
      try {
        await Promise.all(
          ids.map(id => approveAssessmentByPrincipal(id, userProfile))
        );
        onSuccess(
          language === 'ar'
            ? `تم اعتماد عدد (${ids.length}) ملفات بنجاح من قِبل مدير المدرسة وتأكيدها في البوابة.`
            : `Successfully bulk approved (${ids.length}) file(s) by Principal.`
        );
        setSelectedDocIds(prev => prev.filter(id => !ids.includes(id)));
      } catch (err: any) {
        if (onError) onError(err.message || 'Error bulk approving documents');
      } finally {
        setApproveLoading(false);
      }
    };

    const handleSingleApproveDoc = async (docId: string, title: string) => {
      setApproveLoading(true);
      try {
        await approveAssessmentByPrincipal(docId, userProfile);
        onSuccess(
          language === 'ar'
            ? `تم اعتماد الملف (${title}) بنجاح من قِبل مدير المدرسة.`
            : `Document (${title}) approved by Principal.`
        );
      } catch (err: any) {
        if (onError) onError(err.message || 'Error approving document');
      } finally {
        setApproveLoading(false);
      }
    };

    // Calculate aggregated school stats
    const totalTeachers = teachers.length;
    const completedUploadsCount = teachers.filter(t => t.complianceStatus === 'completed').length;
    const partialUploadsCount = teachers.filter(t => t.complianceStatus === 'partial').length;
    const noneUploadsCount = teachers.filter(t => t.complianceStatus === 'none').length;
    const overallComplianceMultiplier = totalTeachers > 0 
      ? Math.round(((completedUploadsCount * 1 + partialUploadsCount * 0.5) / totalTeachers) * 100) 
      : 0;

    const totalPaperCount = teachers.reduce((acc, current) => acc + current.uploads.length, 0);
    const approvedPaperCount = assessments.filter(a => a.status === 'Approved').length;
    const pendingPaperCount = assessments.filter(a => a.status === 'Pending').length;
    const revisionPaperCount = assessments.filter(a => a.status === 'Revision Request').length;

    // Filtration
    const filteredTeachers = teachers.filter(t => {
      const matchSearch = t.profile.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.profile.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.profile.subject?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchSubject = !subjectFilter || t.profile.subject === subjectFilter;
      const matchStatus = !statusFilter || t.complianceStatus === statusFilter;
      
      return matchSearch && matchSubject && matchStatus;
    });

  const [permissionStatus, setPermissionStatus] = useState<{
    adminUnlocked: boolean;
    principalUnlocked: boolean;
    canTeacherUpload: boolean;
    inspectionDate: string;
  }>({
    adminUnlocked: false,
    principalUnlocked: false,
    canTeacherUpload: false,
    inspectionDate: ''
  });
  const [permissionLoading, setPermissionLoading] = useState(false);

  const fetchPermissions = async () => {
    try {
      const perm = await getSchoolUploadPermissionStatus(principalSchool);
      setPermissionStatus(perm);
    } catch (e) {
      console.error("Error loading permissions", e);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [principalSchool]);

  const handleTogglePrincipalUnlock = async () => {
    setPermissionLoading(true);
    try {
      const nextVal = !permissionStatus.principalUnlocked;
      const res = await togglePrincipalUploadPermission(principalSchool, nextVal);
      if (res && res.success === false) {
        if (onError) onError(res.message);
        return;
      }
      onSuccess(
        language === 'ar'
          ? `تم ${nextVal ? 'فتح وتفعيل' : 'إغلاق'} صلاحية رفع الملفات لمعلمي المدرسة بنجاح.`
          : `Teacher upload permission ${nextVal ? 'unlocked' : 'locked'} successfully.`
      );
      await fetchPermissions();
    } catch (err: any) {
      console.error(err);
      if (onError) onError(err.message || 'Error updating permission');
    } finally {
      setPermissionLoading(false);
    }
  };

  const handleApproveTeacherUpload = async (assessmentId: string, title: string) => {
    try {
      await approveAssessmentByPrincipal(assessmentId, userProfile);
      onSuccess(
        language === 'ar'
          ? `تمت موافقة مدير المدرسة على إرسال ملف (${title}) إلى مدير النظام بالوزارة بنجاح.`
          : `File (${title}) approved and forwarded to Ministry Admin successfully.`
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Step 4 Queue: Files uploaded by teachers awaiting Principal's approval
  const pendingPrincipalApprovalFiles = assessments.filter(a => 
    !a.workflowStage || a.workflowStage === 'teacher_submitted'
  );

  // Group pending files into Teacher Folders
  const pendingByTeacherMap = new Map<string, {
    teacherKey: string;
    teacherName: string;
    teacherEmail?: string;
    subject?: string;
    files: Assessment[];
  }>();

  pendingPrincipalApprovalFiles.forEach(file => {
    let tName = '';
    let tSubject = file.subject || '';
    let tEmail = file.schoolEmail || '';

    if (file.teacherName && file.teacherName.trim() && !file.teacherName.includes('@')) {
      tName = file.teacherName.trim();
    } else {
      const matchProfile = teachers.find(t => 
        (file.schoolId && t.profile.uid === file.schoolId) || 
        (t.profile.email && file.schoolEmail && t.profile.email.toLowerCase() === file.schoolEmail.toLowerCase()) ||
        (t.profile.name && file.schoolName && t.profile.name.toLowerCase() === file.schoolName.toLowerCase())
      );
      if (matchProfile) {
        tName = matchProfile.profile.name;
        if (!tSubject && matchProfile.profile.subject) tSubject = matchProfile.profile.subject;
      } else if (file.schoolEmail) {
        if (file.schoolEmail === 'teacher@moe.om') tName = 'د. فاطمة السيابية';
        else if (file.schoolEmail === 'school@moe.om') tName = 'أ. وليد الخروصي';
        else if (file.schoolEmail === 'moderator@moe.om') tName = 'أ. سالم الحارثي';
        else if (file.schoolEmail === 'riyami.math@moe.om') tName = 'أ. وليد الريامي';
        else if (file.schoolEmail === 'rawahi.arabic@moe.om') tName = 'أ. عائشة الرواحية';
        else if (file.schoolEmail === 'balushi.it@moe.om') tName = 'أ. أمينة البلوشية';
        else if (file.schoolEmail === 'hosni.islamic@moe.om') tName = 'الشيخ أحمد الحوسني';
        else {
          const handle = file.schoolEmail.split('@')[0].replace(/[._-]/g, ' ');
          tName = `أ. ${handle.charAt(0).toUpperCase() + handle.slice(1)}`;
        }
      } else if (file.schoolName && !file.schoolName.includes('مدرسة')) {
        tName = file.schoolName;
      } else {
        tName = language === 'ar' ? 'أ. معلم المادة' : 'Subject Teacher';
      }
    }

    const key = tName;
    if (!pendingByTeacherMap.has(key)) {
      pendingByTeacherMap.set(key, {
        teacherKey: key,
        teacherName: tName,
        teacherEmail: tEmail,
        subject: tSubject,
        files: [file]
      });
    } else {
      pendingByTeacherMap.get(key)!.files.push(file);
    }
  });

  const teacherFolders = Array.from(pendingByTeacherMap.values());
  const activeTeacherFolder = teacherFolders.find(tf => tf.teacherKey === openTeacherFolderKey) || null;

  return (
      <div className="space-y-7 animate-in fade-in duration-200">
        
        {/* TOP COMPACT BRANDING BAR */}
        <div className="bg-[#051C3F] text-white p-6 sm:p-7 rounded-3xl border border-indigo-900/30 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-radial-at-tr from-amber-500/10 via-transparent to-transparent opacity-60 pointer-events-none"></div>
          <div className="space-y-2 text-center md:text-left">
            <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest block w-fit mx-auto md:mx-0 shadow-xs">
              {language === 'ar' ? 'منصة متابعة الإدارة المدرسية' : 'School Administration Tracker'}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold font-heading tracking-tight leading-normal">
              {language === 'ar' ? `لوحة متابعة ومراقبة المعلمين - ${principalSchool}` : `Academic Staff Submission Observer — ${principalSchool}`}
            </h2>
            <p className="text-slate-350 text-xs font-sans max-w-xl font-medium leading-relaxed">
              {language === 'ar' 
                ? 'متابعة وإشراف على التقييمات الدراسية وأوراق الامتحانات المرفوعة من قبل كوادر المدرسة للتأكد من مطابقة معايير وزارة التعليم.' 
                : 'Observe, coordinate and audit syllabus assessments and blueprints uploaded by your school faculty before national Ministry moderation review.'}
            </p>
          </div>
          <div className="bg-white/10 px-5 py-4.5 rounded-2xl border border-white/15 text-center shrink-0 min-w-[200px] shadow-inner">
            <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest">{language === 'ar' ? 'معدل التزام المدرسة الموحد' : 'Unified School Compliance'}</p>
            <div className="flex items-baseline justify-center gap-1.5 mt-0.5">
              <span className="text-3xl font-black text-white">{overallComplianceMultiplier}%</span>
            </div>
            {/* Minimal Progress Bar */}
            <div className="w-full bg-indigo-950/40 h-1.5 rounded-full mt-2.5 border border-indigo-900/40">
              <div 
                className="bg-amber-400 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${overallComplianceMultiplier}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* STEP 2b: PRINCIPAL UPLOAD PERMISSION CONTROL BANNER */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-extrabold text-slate-900 text-sm font-heading">
              {language === 'ar' ? 'صلاحية رفع الملفات للمعلمين بالمدرسة' : 'Teacher Upload Access Control'}
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? `تاريخ الفحص المجدول لمدرستك: ${permissionStatus.inspectionDate || 'اليوم'}. يفتح مدير النظام الصلاحية للمدرسة، ثم يقم مدير المدرسة بتفعيلها للمعلمين.`
                : `Scheduled inspection date: ${permissionStatus.inspectionDate}. Admin unlocks school access, then Principal unlocks teachers.`}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!permissionStatus.adminUnlocked ? (
              <div className="px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{language === 'ar' ? 'بانتظار فتح الصلاحية للمدرسة من قِبل مدير النظام' : 'Awaiting Admin Unlock'}</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={permissionLoading}
                onClick={handleTogglePrincipalUnlock}
                className={`px-4 py-2.5 rounded-2xl font-black text-xs cursor-pointer transition-all flex items-center gap-2 shadow-sm ${
                  permissionStatus.principalUnlocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {permissionStatus.principalUnlocked
                    ? (language === 'ar' ? 'صلاحية الرفع مفعّلة للمعلمين الآن (انقر للإغلاق)' : 'Upload Unlocked for Teachers')
                    : (language === 'ar' ? 'تفعيل صلاحية رفع الملفات للمعلمين الآن' : 'Unlock Upload for Teachers Now')}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 4: PRINCIPAL APPROVAL QUEUE (DIVIDED INTO TEACHER FOLDERS) */}
        {pendingPrincipalApprovalFiles.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-50/70 via-white to-amber-50/40 border border-indigo-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-150 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-black flex items-center justify-center text-sm shadow-2xs shrink-0">
                  <Folder className="w-5 h-5 text-amber-200" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base font-heading">
                    {language === 'ar' ? 'ملفات بانتظار الموافقة (مقسمة بمجلدات المعلمين)' : 'Pending Approval Files (Teacher Folders)'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {language === 'ar'
                      ? 'مجلدات بأسماء المعلمين الذين أرسلوا ملفاتهم. افتح مجلد أي معلم للاطلاع على ملفاته والموافقة عليها وإرسالها لمدير النظام.'
                      : 'Teacher folders with submitted files awaiting principal approval.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="bg-amber-100 text-amber-900 border border-amber-300/80 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                  <span>📁</span>
                  <span>{teacherFolders.length} {language === 'ar' ? 'مجلدات معلمين' : 'Teacher Folders'}</span>
                </span>
              </div>
            </div>

            {/* If a teacher folder is opened -> Show that teacher's files */}
            {activeTeacherFolder ? (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Folder Top Bar */}
                <div className="bg-amber-50/90 border-2 border-amber-300/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenTeacherFolderKey(null)}
                      className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 hover:text-slate-950 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                      title={language === 'ar' ? 'رجوع لقائمة مجلدات المعلمين' : 'Back to folders'}
                    >
                      <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                      <span>{language === 'ar' ? 'الرجوع لكافة المجلدات' : 'Back to Folders'}</span>
                    </button>

                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/30 text-amber-900 border border-amber-400/50 flex items-center justify-center shrink-0">
                        <FolderOpen className="w-6 h-6 text-amber-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm sm:text-base text-slate-900 font-heading">
                            مجلد: {activeTeacherFolder.teacherName}
                          </h4>
                          {activeTeacherFolder.subject && (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-md font-bold bg-white text-indigo-700 border border-indigo-200">
                              {translateSubject(activeTeacherFolder.subject, language)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-amber-900 font-medium">
                          {language === 'ar' 
                            ? `يحتوي هذا المجلد على (${activeTeacherFolder.files.length}) ملفات بانتظار الموافقة والإرسال لمدير النظام`
                            : `Contains (${activeTeacherFolder.files.length}) files awaiting approval`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bulk Approve All For This Teacher */}
                  {activeTeacherFolder.files.length > 1 && (
                    <button
                      type="button"
                      onClick={async () => {
                        for (const f of activeTeacherFolder.files) {
                          await handleApproveTeacherUpload(f.id, f.title);
                        }
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:brightness-110 text-white text-xs font-black rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{language === 'ar' ? 'موافقة وإرسال كافة ملفات هذا المعلم' : 'Approve All Files'}</span>
                    </button>
                  )}
                </div>

                {/* Files in this opened teacher folder */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {activeTeacherFolder.files.map((file) => (
                    <div 
                      key={`approval-file-${file.id}`}
                      className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200/90 hover:border-emerald-500/70 transition-all shadow-xs space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9.5px] font-extrabold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 rounded-md">
                            {language === 'ar' ? 'مرفوع حديثاً بواسطة المعلم' : 'Teacher Uploaded'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(file.createdAt).toLocaleDateString(language === 'ar' ? 'ar-OM' : 'en-US', {month: 'short', day: 'numeric'})}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm mt-2 leading-snug">
                          {file.title}
                        </h4>
                        
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10.5px] text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                            {translateSubject(file.subject, language)}
                          </span>
                          <span className="text-[10.5px] text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                            {translateGrade(file.grade, language)}
                          </span>
                          {file.isPdf && (
                            <span className="text-[9.5px] font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                              PDF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onInspect(file)}
                          className="px-3 py-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'فحص المعاينة' : 'Inspect'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApproveTeacherUpload(file.id, file.title)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'موافقة وارسال لمدير النظام' : 'Approve & Send to System Admin'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* All Teacher Folders Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teacherFolders.map((tf) => (
                  <div
                    key={`teacher-folder-${tf.teacherKey}`}
                    onClick={() => setOpenTeacherFolderKey(tf.teacherKey)}
                    className="group bg-gradient-to-br from-amber-50/90 via-amber-50/30 to-white hover:from-amber-100/90 hover:via-amber-50 hover:to-white border-2 border-amber-200/90 hover:border-amber-400 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[175px]"
                  >
                    {/* Top corner circle count badge */}
                    <div className="absolute top-3.5 left-3.5 rtl:left-auto rtl:right-auto rtl:left-3.5 ltr:right-3.5">
                      <span className="w-7 h-7 rounded-full bg-rose-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-md animate-pulse">
                        {tf.files.length}
                      </span>
                    </div>

                    <div>
                      {/* Folder Icon & Teacher Info */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-400/25 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                          <Folder className="w-7 h-7 text-amber-600 fill-amber-300/50" />
                        </div>
                        <div className="min-w-0 pr-8 rtl:pr-0 rtl:pl-8">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800/80 block">
                            {language === 'ar' ? 'مجلد معلم' : 'Teacher Folder'}
                          </span>
                          <h4 className="font-extrabold text-slate-900 text-sm sm:text-base truncate group-hover:text-amber-900 transition-colors font-heading">
                            {tf.teacherName}
                          </h4>
                        </div>
                      </div>

                      {/* Subject and files pill */}
                      <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
                        {tf.subject && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-white/95 border border-slate-200/90 text-slate-700 shadow-2xs">
                            📚 {translateSubject(tf.subject, language)}
                          </span>
                        )}
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-950 border border-amber-300/60">
                          {tf.files.length} {language === 'ar' ? 'ملفات بالانتظار' : 'pending files'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Open action button */}
                    <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs font-bold text-amber-900 group-hover:text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-amber-600" />
                        <span>{language === 'ar' ? 'انقر لفتح ملفات المعلم' : 'Click to open files'}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}



        {/* CONTROLS FILTRATION HEADER CARD */}
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <h3 className="font-bold text-slate-800 text-sm sm:text-base font-heading flex items-center gap-2">
              <GraduationCap className="text-indigo-650 w-5 h-5" />
              {language === 'ar' ? 'دليل تقدم الكادر التعليمي ومستنداتهم' : 'Academic Faculty Progress & Upload Log Directory'}
            </h3>
            
            {/* Dropdown Filters */}
            <div className="flex items-center gap-2 self-end md:self-auto">
              <div className="flex items-center gap-1.5">
                <ListFilter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select 
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-650 bg-slate-50 cursor-pointer font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option key="filter-subj-all" value="">{language === 'ar' ? 'جميع المواد' : 'All Subjects'}</option>
                  {((Array.from(new Set(teachers.map(t => t.profile.subject).filter(Boolean))) as string[])).map((subj, index) => (
                    <option key={`filter-subj-${subj}-${index}`} value={subj}>{translateSubject(subj, language)}</option>
                  ))}
                </select>

                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-650 bg-slate-50 cursor-pointer font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option key="filter-status-all" value="">{language === 'ar' ? 'جميع الحالات' : 'All Status'}</option>
                  <option key="filter-status-completed" value="completed">{language === 'ar' ? 'تم الرفع' : 'Uploaded'}</option>
                  <option key="filter-status-partial" value="partial">{language === 'ar' ? 'تم الرفع (جزئي)' : 'Partially Uploaded'}</option>
                  <option key="filter-status-none" value="none">{language === 'ar' ? 'لم يتم الرفع' : 'Not Uploaded'}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Keyword Search input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={language === 'ar' ? 'البحث بالاسم بريد المعلم أو المادة الدراسية...' : 'Search teacher by name, email academic details or subject...'}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-705 focus:outline-none focus:border-indigo-500 bg-slate-50/30 font-medium font-sans"
            />
          </div>
        </div>

        {/* STAFF LIST TABLE CARD WITH ACCORDIONS */}
        <div className="bg-white rounded-3xl border border-slate-200/50 shadow-sm overflow-hidden">
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] font-extrabold uppercase tracking-widest font-sans">
                  <th className="py-4.5 px-6">{language === 'ar' ? 'المعلم والبريد الإلكتروني' : 'Teacher & Email'}</th>
                  <th className="py-4.5 px-4">{language === 'ar' ? 'التخصص والمادة' : 'Subject Field'}</th>
                  <th className="py-4.5 px-4">{language === 'ar' ? 'الملفات المرفوعة' : 'Blueprints Uploaded'}</th>
                  <th className="py-4.5 px-4">{language === 'ar' ? 'حالة الرفع' : 'Upload Status'}</th>
                  <th className="py-4.5 px-6 text-right">{language === 'ar' ? 'الإجراء الإداري والمتابعة' : 'Observation Management'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-slate-800 text-xs">
                {filteredTeachers.length === 0 ? (
                  <tr key="observer-no-teachers">
                    <td colSpan={5} className="py-16 text-center text-slate-400">
                      <div className="space-y-2">
                        <AlertCircle className="w-9 h-9 text-slate-350 mx-auto opacity-70" />
                        <p className="font-medium text-slate-500">{language === 'ar' ? 'لا توجد فلاتر متطابقة مع المعلمين.' : 'No teachers mathcing these search filters.'}</p>
                        <p className="text-[11px] text-slate-400">
                          {language === 'ar' 
                            ? `جرب تغيير معايير البحث أو تصفية الحالات لبيان معلمي ${principalSchool}.`
                            : `Try adjusting filters to view the ${principalSchool} roster.`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTeachers.map(({ profile, uploads, complianceStatus }, idx) => {
                    const isExpanded = expandedTeacherId === profile.uid;
                    const hasNudge = nudgedTeacherIds[profile.uid];

                    // Visual badge style for compliance status
                    let statusLabel = '';
                    let statusColor = '';
                    if (complianceStatus === 'completed' || uploads.length > 0) {
                      statusLabel = language === 'ar' ? 'تم الرفع' : 'Uploaded';
                      statusColor = 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold';
                    } else {
                      statusLabel = language === 'ar' ? 'لم يتم الرفع' : 'Not Uploaded';
                      statusColor = 'bg-rose-50 text-rose-700 border border-rose-200 font-bold';
                    }

                    return (
                      <React.Fragment key={`teacher-frag-${profile.uid || idx}-${idx}`}>
                        
                        {/* Core Teacher Row */}
                        <tr 
                          onClick={() => setExpandedTeacherId(isExpanded ? null : profile.uid)}
                          className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-indigo-50/10' : ''
                          }`}
                        >
                          {/* Name Email */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-700 font-heading font-black flex items-center justify-center border border-indigo-100 uppercase text-xs shrink-0">
                                {profile.name.substring(0, 2)}
                              </div>
                              <div className="space-y-0.5">
                                <h5 className="font-bold text-slate-900 text-xs sm:text-sm font-heading flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                                  {profile.name}
                                </h5>
                                <code className="text-[10px] text-slate-400 font-mono tracking-normal pr-0.5">{profile.email}</code>
                              </div>
                            </div>
                          </td>

                          {/* Subject Specialty */}
                          <td className="py-4 px-4 font-semibold text-slate-700">
                            {translateSubject(profile.subject || 'Syllabus Core', language)}
                          </td>

                          {/* Upload Count Grid */}
                          <td className="py-4 px-4 font-mono font-bold">
                            <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded-lg text-xs border border-slate-200 shadow-3xs">
                              {uploads.length} {uploads.length === 1 ? (language === 'ar' ? 'مستند' : 'file') : (language === 'ar' ? 'مستندات' : 'files')}
                            </span>
                          </td>

                          {/* Syllabus compliance tracker tag */}
                          <td className="py-4 px-4 text-xs font-semibold">
                            <span className={`px-2.5 py-1 rounded-full text-[10.5px] font-sans ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </td>

                          {/* Observation controller triggers */}
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2.5" onClick={e => e.stopPropagation()}>
                              
                              {/* Detailed Dropdown toggle */}
                              <button
                                type="button"
                                onClick={() => setExpandedTeacherId(isExpanded ? null : profile.uid)}
                                className="p-1.5 text-slate-400 hover:text-slate-650 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                                title={language === 'ar' ? 'عرض المستندات المرفوعة' : 'View Uploaded Documents'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>

                              {/* Supportive Nudge Button */}
                              {complianceStatus !== 'completed' ? (
                                <button
                                  type="button"
                                  onClick={() => handleSendNudge(profile.uid, profile.name, profile.subject || 'Syllabus Science')}
                                  disabled={hasNudge}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-3xs cursor-pointer transition-all ${
                                    hasNudge 
                                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                      : 'bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-300 hover:scale-[1.01]'
                                  }`}
                                >
                                  {hasNudge ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>{language === 'ar' ? 'أرسل التنبيه' : 'Nudge Sent'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-3 h-3 text-slate-900" />
                                      <span>{language === 'ar' ? 'تذكير متابعة' : 'Support Nudge'}</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-[10px] font-black border border-emerald-100 uppercase flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" />
                                  {language === 'ar' ? 'ملتزم كامل' : 'Compliant'}
                                </span>
                              )}

                            </div>
                          </td>

                        </tr>

                        {/* Interactive Accordion Subtable: File details */}
                        {isExpanded && (
                          <tr key={`teacher-expanded-row-${profile.uid || idx}-${idx}`} className="bg-indigo-50/5/25">
                            <td colSpan={5} className="py-4 px-6 border-b border-indigo-100/30">
                              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/50 space-y-4 animate-in slide-in-from-top-1 duration-150">
                                
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                                  <div className="flex items-center gap-2">
                                    <h6 className="font-heading font-black text-[#051C3F] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                      <BookOpen className="w-4 h-4 text-indigo-600" />
                                      {language === 'ar' ? `المرفوعات والامتحانات التعليمية لـ ${profile.name}` : `Assessment Blueprints Uploaded by ${profile.name}`}
                                    </h6>
                                    <span className="text-[10px] font-semibold text-slate-400">
                                      {uploads.length} {language === 'ar' ? 'أوراق تقييم مسجلة' : 'papers registered'}
                                    </span>
                                  </div>

                                  {/* Bulk actions for this teacher */}
                                  {uploads.length > 0 && (
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleSelectAllDocs(uploads)}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                      >
                                        {uploads.every(d => selectedDocIds.includes(d.id))
                                          ? (language === 'ar' ? 'إلغاء التحديد' : 'Deselect All')
                                          : (language === 'ar' ? 'تحديد الكل' : 'Select All')}
                                      </button>

                                      {uploads.some(d => d.workflowStage !== 'principal_approved') && (
                                        <button
                                          type="button"
                                          disabled={approveLoading}
                                          onClick={() => {
                                            const unapproved = uploads.filter(d => d.workflowStage !== 'principal_approved').map(d => d.id);
                                            const targetIds = selectedDocIds.filter(id => uploads.some(u => u.id === id)).length > 0
                                              ? selectedDocIds.filter(id => uploads.some(u => u.id === id))
                                              : unapproved;
                                            handleBulkApproveDocs(targetIds);
                                          }}
                                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all shadow-3xs disabled:opacity-50"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                          <span>{language === 'ar' ? 'اعتماد جماعي للملفات' : 'Bulk Approve Files'}</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {uploads.length === 0 ? (
                                  <div className="text-center py-6 text-slate-400 text-xs font-sans">
                                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                                    <p>{language === 'ar' ? 'لم يقم هذا المعلم برفع أي تقييمات إلى البوابة بعد.' : 'This academic has not uploaded any specifications yet.'}</p>
                                    <p className="text-[10.5px] text-slate-350 mt-0.5">{language === 'ar' ? 'انقر على "تذكير متابعة" لإرسال تذكير الدعم الإداري.' : 'Click "Support Nudge" to politely prompt them.'}</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {uploads.map((docItem, index) => (
                                      <div 
                                        key={`doc-item-${docItem.id || index}-${index}`}
                                        className={`p-3 border rounded-xl shadow-3xs flex flex-col justify-between gap-3 group transition-colors ${
                                          selectedDocIds.includes(docItem.id) 
                                            ? 'bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-400/30' 
                                            : 'bg-white border-slate-200 hover:border-indigo-400/50'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1.5">
                                          <div className="flex items-start gap-2">
                                            <input
                                              type="checkbox"
                                              checked={selectedDocIds.includes(docItem.id)}
                                              onChange={() => handleToggleSelectDoc(docItem.id)}
                                              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                                              title={language === 'ar' ? 'تحديد للاعتماد الجماعي' : 'Select for Bulk Approval'}
                                            />
                                            <div className="space-y-0.5">
                                              <span className="bg-slate-100 text-slate-500 font-extrabold text-[8.5px] px-1.5 py-0.5 rounded uppercase tracking-wider block w-fit">
                                                {docItem.type === 'test' ? (language === 'ar' ? 'امتحان موحد' : 'Unified Exam') : (language === 'ar' ? 'اختبار قصير' : 'Unit Quiz')}
                                              </span>
                                              <h4 className="font-bold text-slate-900 group-hover:text-indigo-650 transition-colors text-xs line-clamp-1 pr-1 font-heading">
                                                {docItem.title}
                                              </h4>
                                              <div className="flex items-center text-[10px] text-slate-400 gap-2 font-semibold">
                                                <span>{translateGrade(docItem.grade, language)}</span>
                                                <span>•</span>
                                                <span>
                                                  {new Date(docItem.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex flex-col items-end gap-1">
                                            <Badge status={docItem.status} language={language} />
                                            {docItem.workflowStage === 'principal_approved' || docItem.principalApprovedBy ? (
                                              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[8.5px] font-black px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
                                                {language === 'ar' ? 'معتمد' : 'Approved'}
                                              </span>
                                            ) : (
                                              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[8.5px] font-bold px-1.5 py-0.2 rounded-md">
                                                {language === 'ar' ? 'بانتظار الاعتماد' : 'Pending'}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Row footer: feedback snapshot and Inspector button */}
                                        <div className="flex items-center justify-between border-t border-slate-50 pt-2 text-[10.5px] gap-2 flex-wrap">
                                          <div className="truncate max-w-[140px] text-slate-450 italic font-medium font-sans">
                                            {docItem.feedback ? (
                                              <span>💬 {docItem.feedback}</span>
                                            ) : (
                                              <span className="text-slate-350">{language === 'ar' ? 'لا توجد ملاحظات مراجعة بعد' : 'No pedagogical feedback yet'}</span>
                                            )}
                                          </div>
                                          
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {docItem.workflowStage !== 'principal_approved' && !docItem.principalApprovedBy && (
                                              <button
                                                type="button"
                                                disabled={approveLoading}
                                                onClick={() => handleSingleApproveDoc(docItem.id, docItem.title)}
                                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-3xs"
                                                title={language === 'ar' ? 'اعتماد هذا الملف من مدير المدرسة' : 'Approve by Principal'}
                                              >
                                                <CheckCircle2 className="w-3 h-3 text-white" />
                                                <span>{language === 'ar' ? 'اعتماد' : 'Approve'}</span>
                                              </button>
                                            )}

                                            {/* Inspect Action */}
                                            <button
                                              type="button"
                                              onClick={() => onInspect(docItem)}
                                              className="px-2.5 py-1 text-indigo-750 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 rounded-lg text-[10px] font-black tracking-normal flex items-center gap-1 cursor-pointer transition-all shrink-0"
                                            >
                                              <Eye className="w-3.5 h-3.5 text-indigo-650" />
                                              <span>{language === 'ar' ? 'تفاصيل المطابقة' : 'Inspect Details'}</span>
                                            </button>
                                          </div>
                                        </div>

                                      </div>
                                    ))}
                                  </div>
                                )}

                              </div>
                            </td>
                          </tr>
                        )}

                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    );
  }
