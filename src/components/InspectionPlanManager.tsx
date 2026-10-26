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
  ShieldCheck
} from 'lucide-react';
import { UserProfile, Assessment, SchoolInspectionPlan } from '../types';
import { Language, translateSubject } from '../lib/translations';
import { 
  getInspectionPlans, 
  saveInspectionPlan, 
  toggleAdminUploadPermission, 
  dispatchAssessmentToExaminer, 
  getAllUserProfiles,
  getSchoolsList
} from '../services/db';
import { OMAN_WUSTA_SCHOOLS } from '../data/schoolsData';

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

  // Examiners list for Step 5 dispatching
  const [examiners, setExaminers] = useState<UserProfile[]>([]);
  const [selectedExaminer, setSelectedExaminer] = useState<Record<string, string>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedPlans = await getInspectionPlans();
      setPlans(fetchedPlans);

      const allProfiles = await getAllUserProfiles();
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

  const handleToggleAdminUnlock = async (schoolName: string, currentUnlocked: boolean) => {
    const nextUnlocked = !currentUnlocked;

    // Instant synchronous React state toggle
    setPlans(prev => {
      const exists = prev.some(p => p.schoolName === schoolName);
      if (exists) {
        return prev.map(p => p.schoolName === schoolName ? { ...p, adminUnlocked: nextUnlocked } : p);
      } else {
        return [...prev, { schoolName, inspectionDate: new Date().toISOString().split('T')[0], adminUnlocked: nextUnlocked, principalUnlocked: false }];
      }
    });

    try {
      await toggleAdminUploadPermission(schoolName, nextUnlocked);
      onSuccess(
        language === 'ar'
          ? `تم ${nextUnlocked ? 'فتح' : 'إغلاق'} صلاحية رفع الملفات لمدرسة (${schoolName}) بنجاح.`
          : `Upload permissions ${nextUnlocked ? 'unlocked' : 'locked'} for ${schoolName}.`
      );
    } catch (err: any) {
      setPlans(prev => prev.map(p => p.schoolName === schoolName ? { ...p, adminUnlocked: currentUnlocked } : p));
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

  const handleDispatchToExaminer = async (assessmentId: string) => {
    const exUid = selectedExaminer[assessmentId];
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
    <div className="space-y-8 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* 5-STEP LIFECYCLE HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl border border-indigo-900/50 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-indigo-800/40 pb-4">
          <div>
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {language === 'ar' ? 'سلسلة رفع الملفات الخماسية' : '5-Step Upload Lifecycle'}
            </span>
            <h2 className="text-xl sm:text-2xl font-black font-heading mt-1">
              {language === 'ar' ? '1 & 2. خطة الفحص الوزارية وصلاحيات الرفع للمدارس' : 'Inspection Schedule & Upload Permissions Hub'}
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

        {/* Visual 5-Step Progress Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-[10.5px] pt-1">
          <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-500/30 text-center space-y-1">
            <span className="bg-indigo-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black block w-fit mx-auto">الخطوة 1</span>
            <p className="font-bold text-white">تحديد تاريخ الفحص</p>
            <p className="text-[9px] text-indigo-200">مدير النظام</p>
          </div>
          <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-500/30 text-center space-y-1">
            <span className="bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded text-[9px] font-black block w-fit mx-auto">الخطوة 2</span>
            <p className="font-bold text-white">فتح صلاحية الرفع</p>
            <p className="text-[9px] text-amber-200">الوزارة ثم المدرسة</p>
          </div>
          <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-500/30 text-center space-y-1">
            <span className="bg-sky-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black block w-fit mx-auto">الخطوة 3</span>
            <p className="font-bold text-white">رفع المستندات</p>
            <p className="text-[9px] text-sky-200">المعلمون</p>
          </div>
          <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-500/30 text-center space-y-1">
            <span className="bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black block w-fit mx-auto">الخطوة 4</span>
            <p className="font-bold text-white">موافقة الإرسال</p>
            <p className="text-[9px] text-emerald-200">مدير المدرسة</p>
          </div>
          <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-500/30 text-center space-y-1">
            <span className="bg-purple-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black block w-fit mx-auto">الخطوة 5</span>
            <p className="font-bold text-white">التحويل للفاحصين</p>
            <p className="text-[9px] text-purple-200">مدير النظام</p>
          </div>
        </div>
      </div>

      {/* STEP 5 DISPATCH SECTION (IF PENDING FILES EXIST) */}
      {pendingDispatchAssessments.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs">5</span>
              <h3 className="font-extrabold text-slate-900 text-sm font-heading">
                {language === 'ar' ? 'الخطوة 5: ملفات مستلمة بموافقة مدير المدرسة - بانتظار التحويل للفاحصين' : 'Step 5: Dispatch Received Files to Examiners'}
              </h3>
            </div>
            <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
              {pendingDispatchAssessments.length} {language === 'ar' ? 'ملفات جاهزة للتحويل' : 'files ready'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingDispatchAssessments.map((item) => (
              <div key={`dispatch-${item.id}`} className="bg-white p-4 rounded-2xl border border-amber-200 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                      ✓ {language === 'ar' ? `موافقة مدير المدرسة: ${item.principalApprovedBy || 'مدير المدرسة'}` : 'Principal Approved'}
                    </span>
                    <h4 className="font-bold text-slate-900 text-xs mt-1">{item.title}</h4>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {item.schoolName} • {translateSubject(item.subject, language)} • {item.grade}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <select
                    value={selectedExaminer[item.id] || ''}
                    onChange={(e) => setSelectedExaminer({ ...selectedExaminer, [item.id]: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">{language === 'ar' ? '-- اختر الفاحص / المشرف المعتمد --' : '-- Select Examiner --'}</option>
                    {examiners.map(ex => (
                      <option key={ex.uid} value={ex.uid}>
                        {ex.name} ({translateSubject(ex.subject || 'All', language)})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleDispatchToExaminer(item.id)}
                    className="px-3.5 py-1.5 bg-[#051C3F] hover:bg-indigo-900 text-white text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'تحويل للفاحص' : 'Dispatch'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 1 & 2 SEARCH AND PERMISSIONS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-extrabold text-slate-900 text-sm font-heading flex items-center gap-2">
              <Building2 className="w-4.5 h-4.5 text-indigo-600" />
              {language === 'ar' ? 'فتح الصلاحيات' : 'Grant & Open Permissions'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {language === 'ar' ? 'قم بتحديد تاريخ الفحص لكل مدرسة، ثم افتح صلاحية الرفع للمدرسة في موعد الفحص الخاص بها.' : 'Set inspection dates per school and unlock upload access on inspection day.'}
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={language === 'ar' ? 'البحث باسم المدرسة...' : 'Filter schools...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:border-indigo-600"
            />
          </div>
        </div>

        {/* SCHOOLS PERMISSION GRID / TABLE */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-4 text-right">{language === 'ar' ? 'المدرسة / المؤسسة التعليمية' : 'School'}</th>
                  <th className="py-3 px-4 text-center">{language === 'ar' ? 'تاريخ الفحص المحدد (الخطوة 1)' : 'Inspection Date (Step 1)'}</th>
                  <th className="py-3 px-4 text-center">{language === 'ar' ? 'صلاحية مدير النظام (الخطوة 2a)' : 'Admin Unlock (Step 2a)'}</th>
                  <th className="py-3 px-4 text-center">{language === 'ar' ? 'صلاحية مدير المدرسة للمعلمين (الخطوة 2b)' : 'Principal Unlock (Step 2b)'}</th>
                  <th className="py-3 px-4 text-center">{language === 'ar' ? 'حالة إمكانية رفع المعلمين' : 'Teacher Upload Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSchools.map((school) => {
                  const schName = school.nameAr;
                  const plan = plans.find(p => p.schoolName === schName || schName.includes(p.schoolName));
                  const isEditing = editingSchool === schName;
                  const adminUnlocked = plan?.adminUnlocked ?? false;
                  const principalUnlocked = plan?.principalUnlocked ?? false;
                  const canTeacherUpload = adminUnlocked && principalUnlocked;
                  const inspDate = plan?.inspectionDate || 'غير محدد';

                  return (
                    <tr key={schName} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {schName}
                      </td>

                      {/* Step 1 Date Column */}
                      <td className="py-3.5 px-4 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="px-2 py-1 border border-indigo-400 rounded-lg text-xs font-bold bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveDate(schName)}
                              className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSchool(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-mono font-bold cursor-pointer transition-colors"
                            title="انقر لتعديل تاريخ الفحص"
                          >
                            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{inspDate}</span>
                          </button>
                        )}
                      </td>

                      {/* Step 2a Admin Unlock Column */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAdminUnlock(schName, adminUnlocked)}
                          className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] cursor-pointer transition-all inline-flex items-center gap-1.5 active:scale-95 shadow-2xs ${
                            adminUnlocked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                          }`}
                        >
                          {adminUnlocked ? <Unlock className="w-3.5 h-3.5 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
                          <span>{adminUnlocked ? (language === 'ar' ? 'مفتوحة' : 'Unlocked') : (language === 'ar' ? 'مغلقة' : 'Locked')}</span>
                        </button>
                      </td>

                      {/* Step 2b Principal Unlock Column */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold inline-flex items-center gap-1 ${
                          principalUnlocked
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {principalUnlocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          <span>{principalUnlocked ? (language === 'ar' ? 'مفتوحة للمعلمين' : 'Unlocked') : (language === 'ar' ? 'بانتظار تفعيل المدير' : 'Awaiting Principal')}</span>
                        </span>
                      </td>

                      {/* Final Status */}
                      <td className="py-3.5 px-4 text-center">
                        {canTeacherUpload ? (
                          <span className="bg-emerald-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'مسموح برفع المعلمين' : 'Upload Allowed'}</span>
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 font-bold text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1 border border-slate-200">
                            <Lock className="w-3 h-3 text-slate-400" />
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

    </div>
  );
}
