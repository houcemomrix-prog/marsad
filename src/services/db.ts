import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query, 
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { OMAN_WUSTA_SCHOOLS } from '../data/schoolsData';
import { db, auth, OperationType, handleFirestoreError, storage } from './firebase';
import { UserProfile, Assessment, ActivityLog, AssessmentStatus, ArchivedForm, FormDesignSettings, SchoolDoc, SchoolReport, TeacherNotification, StudentMark } from '../types';
import { isSubjectMatch, isUniversalSubject } from '../lib/translations';

const PDF_MEMORY_CACHE = new Map<string, string>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string = 'Operation timeout'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

let sandboxListeners: Array<(uid: string, profile: UserProfile | null) => void> = [];

export function subscribeToUserProfile(uid: string, onUpdate: (profile: UserProfile | null) => void): () => void {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    onUpdate(users[uid] || null);

    const listener = (eventUid: string, updatedProfile: UserProfile | null) => {
      if (eventUid === uid) {
        onUpdate(updatedProfile);
      }
    };
    sandboxListeners.push(listener);

    return () => {
      sandboxListeners = sandboxListeners.filter(l => l !== listener);
    };
  }

  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(null);
        return;
      }
      const data = snapshot.data();
      let createdAt = new Date().toISOString();
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAt = data.createdAt.toDate().toISOString();
      } else if (data.createdAt) {
        createdAt = new Date(data.createdAt).toISOString();
      }

      onUpdate({
        uid: data.uid,
        name: data.name,
        email: data.email,
        role: data.role,
        schoolName: data.schoolName,
        subject: data.subject,
        phoneNumber: data.phoneNumber,
        roleType: data.roleType,
        gradesTaught: data.gradesTaught,
        appointmentYear: data.appointmentYear,
        wilaya: data.wilaya,
        directorate: data.directorate,
        jobTitle: data.jobTitle,
        createdAt
      });
    },
    (error) => {
      console.error("Firestore real-time profile subscription error:", error);
    }
  );
}

// Check if running in Sandbox Mode
export function isSandboxActive(): boolean {
  const stored = localStorage.getItem('oman_moe_sandbox_active');
  return stored === 'true'; // Default to live Firestore for multi-user synchronization
}

export function setSandboxActive(active: boolean) {
  localStorage.setItem('oman_moe_sandbox_active', String(active));
}

// --- SANDBOX DATABASE (Local Storage Backed) ---
const SANDBOX_USERS_KEY = 'oman_moe_sandbox_users';
const SANDBOX_ASSESSMENTS_KEY = 'oman_moe_sandbox_assessments';
const SANDBOX_LOGS_KEY = 'oman_moe_sandbox_logs';

export const LINKED_EXPERIMENT_SCHOOL_AR = 'مدرسة الدقم للتعليم الأساسي';
export const LINKED_EXPERIMENT_SCHOOL_EN = 'Duqm Basic Education School';
export const LINKED_EXPERIMENT_GOVERNORATE_AR = 'المديرية العامة للتربية والتعليم بمحافظة الوسطى';
export const LINKED_EXPERIMENT_GOVERNORATE_EN = 'General Directorate of Education in Al Wusta Governorate';

const INITIAL_SANDBOX_USERS: Record<string, UserProfile> = {
  'demo-school-1': {
    uid: 'demo-school-1',
    name: 'أ. وليد الخروصي (مدير مدرسة الدقم)',
    email: 'school@moe.om',
    role: 'school',
    roleType: 'administrative',
    schoolName: LINKED_EXPERIMENT_SCHOOL_AR,
    wilaya: 'duqm',
    directorate: LINKED_EXPERIMENT_GOVERNORATE_AR,
    jobTitle: 'مدير مدرسة',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString()
  },
  'demo-teacher-1': {
    uid: 'demo-teacher-1',
    name: 'د. فاطمة السيابية (معلمة العلوم بمدرسة الدقم)',
    email: 'teacher@moe.om',
    role: 'school',
    roleType: 'teacher',
    schoolName: LINKED_EXPERIMENT_SCHOOL_AR,
    wilaya: 'duqm',
    subject: 'Science',
    directorate: LINKED_EXPERIMENT_GOVERNORATE_AR,
    jobTitle: 'معلم مادة',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
  },
  'demo-mod-1': {
    uid: 'demo-mod-1',
    name: 'أ. سالم الحارثي',
    email: 'moderator@moe.om',
    role: 'moderator',
    jobTitle: 'فاحص ومدقق مادة العلوم العامة',
    subject: 'Science',
    directorate: LINKED_EXPERIMENT_GOVERNORATE_AR,
    wilaya: 'duqm',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString()
  },
  'demo-admin-1': {
    uid: 'demo-admin-1',
    name: 'أ. حسام عمري',
    email: 'hossam9866@moe.om',
    role: 'admin',
    jobTitle: 'مدير النظام',
    subject: 'English Language',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  }
};

const INITIAL_SANDBOX_ASSESSMENTS: Assessment[] = [];

const INITIAL_SANDBOX_LOGS: ActivityLog[] = [];

export function purgeRecentExperimentPapers(): void {
  try {
    localStorage.setItem(SANDBOX_ASSESSMENTS_KEY, JSON.stringify([]));
    localStorage.setItem(SANDBOX_ARCHIVED_FORMS_KEY, JSON.stringify([]));
    localStorage.setItem(SANDBOX_LOGS_KEY, JSON.stringify([]));
    localStorage.setItem(SANDBOX_REPORTS_KEY, JSON.stringify([]));
    localStorage.setItem(SANDBOX_USERS_KEY, JSON.stringify(INITIAL_SANDBOX_USERS));
  } catch (err) {
    console.warn("Could not purge localStorage experiment papers:", err);
  }
}

function getSandboxData<T>(key: string, initial: T): T {
  const dataStr = localStorage.getItem(key);
  if (!dataStr) {
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
  try {
    const parsed = JSON.parse(dataStr);
    if (key === SANDBOX_ARCHIVED_FORMS_KEY && Array.isArray(parsed)) {
      // Ensure initial seed forms exist if localStorage was previously emptied, while preserving any updates
      const map = new Map<string, any>();
      if (Array.isArray(initial)) {
        for (const item of initial) {
          if (item && item.id) map.set(item.id, item);
        }
      }
      for (const item of parsed) {
        if (item && item.id) {
          map.set(item.id, item);
        }
      }
      const merged = Array.from(map.values());
      if (merged.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(merged));
      }
      return merged as unknown as T;
    }
    if (key === SANDBOX_USERS_KEY && parsed) {
      // Always enforce the linked experiment accounts
      parsed['demo-school-1'] = {
        ...parsed['demo-school-1'],
        ...INITIAL_SANDBOX_USERS['demo-school-1']
      };
      parsed['demo-teacher-1'] = {
        ...parsed['demo-teacher-1'],
        ...INITIAL_SANDBOX_USERS['demo-teacher-1']
      };
      parsed['demo-mod-1'] = {
        ...parsed['demo-mod-1'],
        ...INITIAL_SANDBOX_USERS['demo-mod-1']
      };
      localStorage.setItem(key, JSON.stringify(parsed));
    }
    return parsed as T;
  } catch (e) {
    return initial;
  }
}

function notifyArchivedFormsSync() {
  try {
    window.dispatchEvent(new CustomEvent('oman_moe_archived_forms_updated'));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('oman_moe_sync_channel');
      bc.postMessage({ type: 'ARCHIVED_FORMS_UPDATED', timestamp: Date.now() });
      bc.close();
    }
  } catch (err) {
    // Ignore broadcast errors
  }
}

function setSandboxData<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === SANDBOX_ARCHIVED_FORMS_KEY) {
      notifyArchivedFormsSync();
    }
  } catch (err) {
    console.warn(`Failed to write ${key} to localStorage:`, err);
  }
}

// --- DATABASE OPERATIONS DISPATCHER ---

export async function createUserProfile(profile: UserProfile): Promise<void> {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    users[profile.uid] = profile;
    setSandboxData(SANDBOX_USERS_KEY, users);
    sandboxListeners.forEach(listener => listener(profile.uid, profile));
    return;
  }

  const path = `users/${profile.uid}`;
  try {
    const docData: any = {
      uid: profile.uid,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      schoolName: profile.schoolName || '',
      createdAt: profile.createdAt ? profile.createdAt : serverTimestamp()
    };
    if (profile.subject) docData.subject = profile.subject;
    if (profile.phoneNumber) docData.phoneNumber = profile.phoneNumber;
    if (profile.roleType) docData.roleType = profile.roleType;
    if (profile.gradesTaught) docData.gradesTaught = profile.gradesTaught;
    if (profile.appointmentYear) docData.appointmentYear = profile.appointmentYear;
    if (profile.wilaya) docData.wilaya = profile.wilaya;
    if (profile.directorate) docData.directorate = profile.directorate;
    if (profile.jobTitle) docData.jobTitle = profile.jobTitle;

    await setDoc(doc(db, 'users', profile.uid), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    return users[uid] || null;
  }

  const path = `users/${uid}`;
  try {
    const s = await getDoc(doc(db, 'users', uid));
    if (!s.exists()) return null;
    const data = s.data();
    
    // Parse timestamp
    let createdAt = new Date().toISOString();
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAt = data.createdAt.toDate().toISOString();
    } else if (data.createdAt) {
      createdAt = new Date(data.createdAt).toISOString();
    }

    return {
      uid: data.uid,
      name: data.name,
      email: data.email,
      role: data.role,
      schoolName: data.schoolName,
      subject: data.subject,
      phoneNumber: data.phoneNumber,
      roleType: data.roleType,
      gradesTaught: data.gradesTaught,
      appointmentYear: data.appointmentYear,
      wilaya: data.wilaya,
      directorate: data.directorate,
      jobTitle: data.jobTitle,
      createdAt
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function updateUserProfileSubject(uid: string, subject: string): Promise<void> {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    if (users[uid]) {
      users[uid].subject = subject;
      setSandboxData(SANDBOX_USERS_KEY, users);
      sandboxListeners.forEach(listener => listener(uid, users[uid]));
    }
    return;
  }

  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      subject: subject
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    return Object.values(users).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const path = 'users';
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    const results: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      let createdAtStr = new Date().toISOString();
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAtStr = data.createdAt.toDate().toISOString();
      } else if (data.createdAt) {
        createdAtStr = new Date(data.createdAt).toISOString();
      }
      results.push({
        uid: doc.id,
        name: data.name || '',
        email: data.email || '',
        role: data.role || 'school',
        schoolName: data.schoolName || '',
        subject: data.subject || '',
        phoneNumber: data.phoneNumber || '',
        roleType: data.roleType || 'administrative',
        gradesTaught: data.gradesTaught || [],
        appointmentYear: data.appointmentYear || '',
        wilaya: data.wilaya || '',
        directorate: data.directorate || '',
        jobTitle: data.jobTitle,
        createdAt: createdAtStr
      });
    });
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function deleteUserProfileAdmin(uid: string): Promise<void> {
  if (isSandboxActive()) {
    const users = getSandboxData<Record<string, UserProfile>>(SANDBOX_USERS_KEY, INITIAL_SANDBOX_USERS);
    delete users[uid];
    setSandboxData(SANDBOX_USERS_KEY, users);
    sandboxListeners.forEach(listener => listener(uid, null));
    return;
  }

  const path = `users/${uid}`;
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function uploadAssessment(assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const rawPdfData = (assessment as any).pdfData;
  const isPdf = (assessment as any).isPdf || false;
  const pdfName = (assessment as any).pdfName || null;
  const pdfSize = (assessment as any).pdfSize || null;

  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const newId = 'assessment_' + Math.random().toString(36).substr(2, 9);
    
    let pdfDataRef: string | null = null;
    if (rawPdfData) {
      const cacheKey = `oman_pdf_cache_${newId}`;
      PDF_MEMORY_CACHE.set(cacheKey, rawPdfData);
      try { localStorage.setItem(cacheKey, rawPdfData); } catch (e) {}
      pdfDataRef = `local_cache:${cacheKey}`;
    }

    const newAss: Assessment = {
      ...assessment,
      pdfData: pdfDataRef,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    assessments.push(newAss);
    setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);

    // Create log
    createActivityLog({
      id: 'log_' + Math.random().toString(36).substr(2, 9),
      assessmentId: newId,
      action: 'Created',
      userId: assessment.schoolId,
      userName: assessment.schoolName,
      userRole: 'school',
      comment: `Uploaded student ${assessment.type} paper: "${assessment.title}" for subject: ${assessment.subject}`,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    return newId;
  }

  try {
    // 1. Initial Firestore document write with strict 3.5s timeout
    const docRef = await withTimeout(
      addDoc(collection(db, 'assessments'), {
        title: assessment.title,
        type: assessment.type || 'test',
        grade: assessment.grade,
        subject: assessment.subject,
        description: assessment.description || '',
        questions: assessment.questions || '',
        keyAnswer: assessment.keyAnswer || '',
        status: 'Pending',
        schoolId: assessment.schoolId,
        schoolName: assessment.schoolName,
        schoolEmail: assessment.schoolEmail,
        teacherName: assessment.teacherName || '',
        workflowStage: assessment.workflowStage || 'teacher_submitted',
        moderatorId: null,
        moderatorName: null,
        feedback: '',
        isPdf: isPdf,
        pdfName: pdfName,
        pdfSize: pdfSize,
        pdfData: null, // Initialized as null to avoid document size limit errors
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }),
      3500,
      'Firestore addDoc'
    );

    let finalPdfUrl: string | null = null;

    if (rawPdfData && rawPdfData.startsWith('data:')) {
      const cacheKey = `oman_pdf_cache_${docRef.id}`;
      PDF_MEMORY_CACHE.set(cacheKey, rawPdfData);
      try { localStorage.setItem(cacheKey, rawPdfData); } catch (e) {}

      // Try Storage with 1.5s timeout max
      try {
        const fileNameSanitised = (pdfName || 'assessment.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileRef = ref(storage, `assessments/${docRef.id}/${fileNameSanitised}`);
        await withTimeout(uploadString(fileRef, rawPdfData, 'data_url'), 1500, 'Firebase Storage uploadString');
        finalPdfUrl = await withTimeout(getDownloadURL(fileRef), 1500, 'Firebase Storage getDownloadURL');
      } catch (storageErr) {
        console.warn("Storage upload skipped or timed out, using instant local cache pointer:", storageErr);
        if (rawPdfData.length < 750000) {
          finalPdfUrl = rawPdfData;
        } else {
          finalPdfUrl = `local_cache:${cacheKey}`;
        }
      }
    } else if (rawPdfData) {
      finalPdfUrl = rawPdfData;
    }

    // 3. Update document with the generated PDF URL/Data (2.5s max timeout)
    if (finalPdfUrl) {
      await withTimeout(
        updateDoc(docRef, { pdfData: finalPdfUrl }),
        2500,
        'Firestore updateDoc pdfData'
      ).catch(err => {
        console.warn("Could not update doc with pdfData:", err);
      });
    }

    // 4. Create log asynchronously
    createActivityLog({
      id: '',
      assessmentId: docRef.id,
      action: 'Created',
      userId: assessment.schoolId,
      userName: assessment.schoolName,
      userRole: 'school',
      comment: `Uploaded student ${assessment.type} paper: "${assessment.title}". Subject: ${assessment.subject}`,
      createdAt: new Date().toISOString()
    }).catch(() => {});

    return docRef.id;

  } catch (error) {
    console.warn("Firestore assessment upload timed out or failed, saving locally:", error);
    // Safe fallback to local sandbox database
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const newId = 'assessment_' + Math.random().toString(36).substr(2, 9);

    let pdfDataRef: string | null = null;
    if (rawPdfData) {
      const cacheKey = `oman_pdf_cache_${newId}`;
      PDF_MEMORY_CACHE.set(cacheKey, rawPdfData);
      try { localStorage.setItem(cacheKey, rawPdfData); } catch (e) {}
      pdfDataRef = `local_cache:${cacheKey}`;
    }

    const newAss: Assessment = {
      ...assessment,
      pdfData: pdfDataRef,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    assessments.push(newAss);
    setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);
    return newId;
  }
}

export async function getAssessments(userProfile: UserProfile): Promise<Assessment[]> {
  if (isSandboxActive()) {
    const rawAssessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const assessments = rawAssessments.map(a => {
      let pdfDataVal = a.pdfData || null;
      if (pdfDataVal && pdfDataVal.startsWith('local_cache:')) {
        const cacheKey = pdfDataVal.replace('local_cache:', '');
        pdfDataVal = PDF_MEMORY_CACHE.get(cacheKey) || localStorage.getItem(cacheKey) || null;
      }
      return { ...a, pdfData: pdfDataVal };
    });

    if (userProfile.role === 'school') {
      if (userProfile.roleType === 'administrative') {
        const mySchool = (userProfile.schoolName || '').toLowerCase().trim();
        return assessments.filter(a => 
          a.schoolId === userProfile.uid || 
          (a.schoolName && a.schoolName.toLowerCase().trim() === mySchool) ||
          (a.schoolName && mySchool.includes(a.schoolName.toLowerCase().trim())) ||
          (userProfile.schoolName && a.schoolName && userProfile.schoolName.toLowerCase().trim().includes(a.schoolName.toLowerCase().trim()))
        ).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      }
      return assessments.filter(a => a.schoolId === userProfile.uid)
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    }
    
    if (userProfile.role === 'moderator') {
      const modSubj = userProfile.subject || '';
      const matched = assessments.filter(a => {
        if (!a.subject || !modSubj) return false;
        if (isUniversalSubject(a.subject)) return false;
        return isSubjectMatch(modSubj, a.subject);
      });
      return matched.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    }
    
    return assessments.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }

  const path = 'assessments';
  try {
    let q;
    if (userProfile.role === 'school') {
      if (userProfile.roleType === 'administrative') {
        q = query(collection(db, 'assessments'));
      } else {
        q = query(collection(db, 'assessments'), where('schoolId', '==', userProfile.uid));
      }
    } else {
      q = query(collection(db, 'assessments'));
    }

    const querySnapshot = await getDocs(q);
    const results: Assessment[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;
      
      let createdAtStr = new Date().toISOString();
      let updatedAtStr = new Date().toISOString();

      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAtStr = data.createdAt.toDate().toISOString();
      } else if (data.createdAt) {
        createdAtStr = new Date(data.createdAt).toISOString();
      }

      if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        updatedAtStr = data.updatedAt.toDate().toISOString();
      } else if (data.updatedAt) {
        updatedAtStr = new Date(data.updatedAt).toISOString();
      }

      // Resolve local PDF cache if needed
      let pdfDataVal = data.pdfData || null;
      if (pdfDataVal && pdfDataVal.startsWith('local_cache:')) {
        const cacheKey = pdfDataVal.replace('local_cache:', '');
        pdfDataVal = PDF_MEMORY_CACHE.get(cacheKey) || localStorage.getItem(cacheKey) || null;
      }

      results.push({
        id: doc.id,
        title: data.title,
        type: data.type,
        grade: data.grade,
        subject: data.subject,
        description: data.description,
        questions: data.questions,
        keyAnswer: data.keyAnswer,
        status: data.status,
        schoolId: data.schoolId,
        schoolName: data.schoolName,
        schoolEmail: data.schoolEmail,
        moderatorId: data.moderatorId,
        moderatorName: data.moderatorName,
        feedback: data.feedback,
        isPdf: data.isPdf || false,
        pdfName: data.pdfName || null,
        pdfSize: data.pdfSize || null,
        pdfData: pdfDataVal,
        teacherName: data.teacherName || null,
        workflowStage: data.workflowStage || null,
        principalApprovedBy: data.principalApprovedBy || null,
        principalApprovedAt: data.principalApprovedAt || null,
        readByExaminer: data.readByExaminer || null,
        examinerReadReceiptLogged: data.examinerReadReceiptLogged || false,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr
      });
    });

    if (userProfile.role === 'school') {
      if (userProfile.roleType === 'administrative') {
        const mySchool = (userProfile.schoolName || '').toLowerCase().trim();
        return results.filter(a => 
          a.schoolId === userProfile.uid || 
          (a.schoolName && a.schoolName.toLowerCase().trim() === mySchool) ||
          (a.schoolName && mySchool.includes(a.schoolName.toLowerCase().trim())) ||
          (userProfile.schoolName && a.schoolName && userProfile.schoolName.toLowerCase().trim().includes(a.schoolName.toLowerCase().trim()))
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      } else {
        return results.filter(a => a.schoolId === userProfile.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    }

    if (userProfile.role === 'moderator') {
      const modSubj = userProfile.subject || '';
      const matched = results.filter(a => {
        if (!a.subject || !modSubj) return false;
        if (isUniversalSubject(a.subject)) return false;
        return isSubjectMatch(modSubj, a.subject);
      });
      return matched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // Sort client-side to avoid composite indexing errors in Firebase
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    console.warn("Firestore getDocs failed, returning local sandbox assessments:", error);
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    return assessments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function editAssessment(assessmentId: string, updates: Partial<Assessment>, userProfile: UserProfile): Promise<void> {
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1) {
      assessments[idx] = {
        ...assessments[idx],
        ...updates,
        status: 'Pending', // Force reset status to Pending upon school edit
        updatedAt: new Date().toISOString()
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);

      // Create log
      await createActivityLog({
        id: 'log_' + Math.random().toString(36).substr(2, 9),
        assessmentId,
        action: 'Updated',
        userId: userProfile.uid,
        userName: userProfile.name,
        userRole: userProfile.role,
        comment: 'Modified and resubmitted assessment draft for moderation review.',
        createdAt: new Date().toISOString()
      });
    }
    return;
  }

  const path = `assessments/${assessmentId}`;
  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      title: updates.title,
      type: updates.type,
      grade: updates.grade,
      subject: updates.subject,
      description: updates.description,
      questions: updates.questions,
      keyAnswer: updates.keyAnswer,
      status: 'Pending', // Force back to Pending upon revision by school
      updatedAt: serverTimestamp()
    });

    // Log the change
    await createActivityLog({
      id: '',
      assessmentId,
      action: 'Updated',
      userId: userProfile.uid,
      userName: userProfile.name,
      userRole: userProfile.role,
      comment: 'Modified and resubmitted assessment paper.',
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function claimAssessment(assessmentId: string, moderatorProfile: UserProfile): Promise<void> {
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1) {
      assessments[idx] = {
        ...assessments[idx],
        status: 'In Progress',
        moderatorId: moderatorProfile.uid,
        moderatorName: moderatorProfile.name,
        updatedAt: new Date().toISOString()
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);

      // Log action
      await createActivityLog({
        id: 'log_' + Math.random().toString(36).substr(2, 9),
        assessmentId,
        action: 'Claimed',
        userId: moderatorProfile.uid,
        userName: moderatorProfile.name,
        userRole: 'moderator',
        comment: 'Assigned test key to self for moderation check.',
        createdAt: new Date().toISOString()
      });
    }
    return;
  }

  const path = `assessments/${assessmentId}`;
  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      status: 'In Progress',
      moderatorId: moderatorProfile.uid,
      moderatorName: moderatorProfile.name,
      updatedAt: serverTimestamp()
    });

    await createActivityLog({
      id: '',
      assessmentId,
      action: 'Claimed',
      userId: moderatorProfile.uid,
      userName: moderatorProfile.name,
      userRole: 'moderator',
      comment: 'Claimed assessment paper for review.',
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitModerationReview(
  assessmentId: string, 
  status: 'Approved' | 'Revision Request' | 'Grade Revision', 
  feedback: string, 
  moderatorProfile: UserProfile
): Promise<void> {
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1) {
      assessments[idx] = {
        ...assessments[idx],
        status,
        feedback,
        updatedAt: new Date().toISOString()
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);

      // Log action
      await createActivityLog({
        id: 'log_' + Math.random().toString(36).substr(2, 9),
        assessmentId,
        action: status === 'Approved' ? 'Approved' : status === 'Grade Revision' ? 'Grade Revision' : 'Revision Requested',
        userId: moderatorProfile.uid,
        userName: moderatorProfile.name,
        userRole: 'moderator',
        comment: feedback,
        createdAt: new Date().toISOString()
      });
    }
    return;
  }

  const path = `assessments/${assessmentId}`;
  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      status,
      feedback,
      updatedAt: serverTimestamp()
    });

    await createActivityLog({
      id: '',
      assessmentId,
      action: status === 'Approved' ? 'Approved' : status === 'Grade Revision' ? 'Grade Revision' : 'Revision Requested',
      userId: moderatorProfile.uid,
      userName: moderatorProfile.name,
      userRole: 'moderator',
      comment: feedback,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createActivityLog(log: Omit<ActivityLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<void> {
  if (isSandboxActive()) {
    const logs = getSandboxData<ActivityLog[]>(SANDBOX_LOGS_KEY, INITIAL_SANDBOX_LOGS);
    logs.push({
      ...log,
      id: 'log_' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    });
    setSandboxData(SANDBOX_LOGS_KEY, logs);
    return;
  }

  const path = `assessments/${log.assessmentId}/logs`;
  try {
    await addDoc(collection(db, 'assessments', log.assessmentId, 'logs'), {
      assessmentId: log.assessmentId,
      action: log.action,
      userId: log.userId,
      userName: log.userName,
      userRole: log.userRole,
      comment: log.comment || '',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getActivityLogs(assessmentId: string): Promise<ActivityLog[]> {
  if (isSandboxActive()) {
    const logs = getSandboxData<ActivityLog[]>(SANDBOX_LOGS_KEY, INITIAL_SANDBOX_LOGS);
    return logs.filter(l => l.assessmentId === assessmentId)
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }

  const path = `assessments/${assessmentId}/logs`;
  try {
    const q = collection(db, 'assessments', assessmentId, 'logs');
    const querySnapshot = await getDocs(q);
    const results: ActivityLog[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      let createdAtStr = new Date().toISOString();
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAtStr = data.createdAt.toDate().toISOString();
      } else if (data.createdAt) {
        createdAtStr = new Date(data.createdAt).toISOString();
      }

      results.push({
        id: doc.id,
        assessmentId: data.assessmentId,
        action: data.action,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        comment: data.comment,
        createdAt: createdAtStr
      });
    });

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// --- ARCHIVED FORMS DB OPERATIONS ---
const SANDBOX_ARCHIVED_FORMS_KEY = 'oman_moe_sandbox_archived_forms';

const INITIAL_SANDBOX_ARCHIVED_FORMS: ArchivedForm[] = [
  {
    id: 'archive_demo_step2_pending_teacher',
    assessmentId: 'asmt_arab_g10_q1',
    assessmentTitle: 'استمارة الفحص والتدقيق المستمر - اختبار قصير 1 (اللغة العربية)',
    assessmentType: 'test',
    grade: 'الصف العاشر',
    subject: 'اللغة العربية',
    schoolName: 'مدرسة صوقرة للتعليم الأساسي (5-12)',
    schoolId: 'school_soqra',
    teacherName: 'أ. سالم بن سعيد الوهيبي',
    teacherFileNo: '96891234567',
    appointmentYear: '2018',
    directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
    visitDate: '2025-02-15',
    subjectName: 'اللغة العربية',
    academicYear: '2024/2025',
    semester: 'الفصل الدراسي الثاني',
    suggestedDevelopment: 'التركيز على مهارات التحليل البلاغي وتطوير الأنشطة التمايزية لمراعاة الفروق الفردية للطلبة.',
    examinerName: 'أ. سالم بن راشد الهنائي',
    principalName: 'أ. محمد بن راشد الجنيبي',
    students: [
      { name: 'محمد بن سالم الجنيبي', level: 'اختبار قصير 1', mark: '10', notes: 'مطابق للشروط فنيًا' },
      { name: 'عبدالله بن ناصر الحرسوسي', level: 'اختبار قصير 1', mark: '9.5', notes: 'مطابق للشروط فنيًا' },
      { name: 'سعيد بن مبارك الوهيبي', level: 'اختبار قصير 1', mark: '8.5', notes: 'مطابق للشروط فنيًا' },
      { name: 'أحمد بن علي الشكيلي', level: 'اختبار قصير 1', mark: '9', notes: 'مطابق للشروط فنيًا' },
      { name: 'عمر بن خالد المهرى', level: 'اختبار قصير 1', mark: '10', notes: 'مطابق للشروط فنيًا' }
    ],
    observations: [
      { element: 'بند مطابقة أدوات التقويم وتوزيع الدرجات', gradeClass: 'الصف العاشر', tool: 'اختبار قصير', status: 'مطابق للشروط فنيًا', notes: 'الدرجات مرصودة طبقاً للوثيقة التقويمية المعتمدة' },
      { element: 'بند معالجة الفروق الفردية ودقة التصحيح', gradeClass: 'الصف العاشر', tool: 'اختبار قصير', status: 'مطابق للشروط فنيًا', notes: 'تمت مراجعة عينة الطلاب وتطابق الدرجات' }
    ],
    // Step 1: Prepared & Signed by Auditor
    isExaminerSigned: true,
    examinerSignedAt: '2025-02-15T09:30:00.000Z',
    examinerSignedName: 'أ. سالم بن راشد الهنائي',
    examinerSignatureQrData: 'OM-AUD-9F42-7K11',
    examinerSignatureStampUrl: 'Examiner verified electronically',
    conformanceStatus: 'conforming',
    hasGradeRevisions: false,
    workflowStage: 'examiner_submitted_to_admin',
    isTeacherSigned: false,
    isSigned: false,
    createdAt: '2025-02-15T09:30:00.000Z',
    updatedAt: '2025-02-15T09:30:00.000Z'
  },
  {
    id: 'archive_demo_step3_pending_principal',
    assessmentId: 'asmt_math_g9_hw',
    assessmentTitle: 'استمارة الفحص والتدقيق المستمر - واجبات وتطبيقات (الرياضيات)',
    assessmentType: 'quiz',
    grade: 'الصف التاسع',
    subject: 'الرياضيات',
    schoolName: 'مدرسة الكحل للتعليم الأساسي (1-12)',
    schoolId: 'school_kuhl',
    teacherName: 'أ. منى بنت عبدالله الوهيبية',
    teacherFileNo: '96892345678',
    appointmentYear: '2019',
    directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
    visitDate: '2025-02-14',
    subjectName: 'الرياضيات',
    academicYear: '2024/2025',
    semester: 'الفصل الدراسي الثاني',
    suggestedDevelopment: 'تعزيز حل المشكلات الهندسية باستخدام البرمجيات التفاعلية وإشراك أولياء الأمور.',
    examinerName: 'أ. سالم بن راشد الهنائي',
    principalName: 'أ. سعيد بن مسلم الجنيبي',
    students: [
      { name: 'فاطمة بنت سالم الجنيبية', level: 'واجب 1', mark: '5', notes: 'مطابق للشروط فنيًا' },
      { name: 'مريم بنت راشد الحرسوسية', level: 'واجب 1', mark: '5', notes: 'مطابق للشروط فنيًا' },
      { name: 'شيخة بنت حمد الوهيبية', level: 'واجب 1', mark: '4.5', notes: 'مطابق للشروط فنيًا' },
      { name: 'هدى بنت علي العامرية', level: 'واجب 1', mark: '5', notes: 'مطابق للشروط فنيًا' }
    ],
    observations: [
      { element: 'سلامة احتساب درجات الواجبات والتطبيقات', gradeClass: 'الصف التاسع', tool: 'واجب', status: 'مطابق للشروط فنيًا', notes: 'مطابقة تامة لتعليمات التقويم المستمر' }
    ],
    // Step 1: Auditor signed
    isExaminerSigned: true,
    examinerSignedAt: '2025-02-14T10:15:00.000Z',
    examinerSignedName: 'أ. سالم بن راشد الهنائي',
    examinerSignatureQrData: 'OM-AUD-3C88-1M90',
    examinerSignatureStampUrl: 'Examiner verified electronically',
    conformanceStatus: 'conforming',
    hasGradeRevisions: false,
    workflowStage: 'admin_transferred_to_principal',
    adminReviewedBy: 'أ. حسام عمري (مدير النظام)',
    adminReviewedAt: '2025-02-14T11:00:00.000Z',
    isTeacherSigned: false,
    isSigned: false,
    createdAt: '2025-02-14T10:15:00.000Z',
    updatedAt: '2025-02-15T11:45:00.000Z'
  },
  {
    id: 'archive_demo_step4_certified',
    assessmentId: 'asmt_sci_g8_t1',
    assessmentTitle: 'استمارة الفحص والتدقيق المستمر - اختبار قصير 2 (العلوم العامة)',
    assessmentType: 'test',
    grade: 'الصف الثامن',
    subject: 'العلوم العامة',
    schoolName: 'مدرسة اللكبي للتعليم الأساسي (1-12)',
    schoolId: 'school_lakbi',
    teacherName: 'أ. فاطمة بنت حميد المهرية',
    teacherFileNo: '96893456789',
    appointmentYear: '2020',
    directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
    visitDate: '2025-02-10',
    subjectName: 'العلوم العامة',
    academicYear: '2024/2025',
    semester: 'الفصل الدراسي الثاني',
    suggestedDevelopment: 'تفعيل التجارب المخبرية الاستقصائية وتطبيق التعلم القائم على المشاريع العلمية.',
    examinerName: 'أ. سالم بن راشد الهنائي',
    principalName: 'أ. حمود بن عامر الحرسوسي',
    students: [
      { name: 'خالد بن حمود الحرسوسي', level: 'اختبار قصير 2', mark: '10', notes: 'مطابق للشروط فنيًا' },
      { name: 'سلطان بن مبارك الجنيبي', level: 'اختبار قصير 2', mark: '9', notes: 'مطابق للشروط فنيًا' },
      { name: 'سيف بن خلفان الحكماني', level: 'اختبار قصير 2', mark: '9.5', notes: 'مطابق للشروط فنيًا' }
    ],
    observations: [
      { element: 'مطابقة نماذج الإجابة وسلم التصحيح', gradeClass: 'الصف الثامن', tool: 'اختبار قصير', status: 'مطابق للشروط فنيًا', notes: 'استيفاء كافة المعايير الفنية والتربوية' }
    ],
    // Step 1: Auditor signed
    isExaminerSigned: true,
    examinerSignedAt: '2025-02-10T08:20:00.000Z',
    examinerSignedName: 'أ. سالم بن راشد الهنائي',
    examinerSignatureQrData: 'OM-AUD-5X12-9A34',
    examinerSignatureStampUrl: 'Examiner verified electronically',
    conformanceStatus: 'conforming',
    hasGradeRevisions: false,
    workflowStage: 'completed',
    isTeacherSigned: true,
    teacherSignedAt: '2025-02-11T12:10:00.000Z',
    teacherSignedName: 'أ. فاطمة بنت حميد المهرية',
    teacherSignatureQrData: 'OM-TCH-4D88-7Q29',
    teacherSignatureStampUrl: 'Teacher verified electronically',
    isSigned: true,
    signedAt: '2025-02-12T13:40:00.000Z',
    signedByPrincipalName: 'أ. حمود بن عامر الحرسوسي',
    signatureStampUrl: 'official_moe_stamp',
    signatureQrData: 'OM-DIR-7K99-2N55',
    createdAt: '2025-02-10T08:20:00.000Z',
    updatedAt: '2025-02-12T13:40:00.000Z'
  }
];

function normalizeTeacherKeyLocal(name?: string, fileNo?: string): string {
  const raw = (name || fileNo || 'unknown_teacher')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^أ\.\s*|^د\.\s*/g, '')
    .trim()
    .toLowerCase();
  return raw || 'unknown_teacher';
}

export async function archiveForm(archive: Omit<ArchivedForm, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const targetTeacherKey = normalizeTeacherKeyLocal(archive.teacherName, archive.teacherFileNo);

  // Enforce strict one-form-per-teacher rule
  const existingForm = archives.find((f) => {
    const fTeacherKey = normalizeTeacherKeyLocal(f.teacherName, f.teacherFileNo);
    if (targetTeacherKey !== 'unknown_teacher' && fTeacherKey === targetTeacherKey) {
      return true;
    }
    if (archive.assessmentId && f.assessmentId === archive.assessmentId) {
      return true;
    }
    return false;
  });

  if (existingForm) {
    notifyArchivedFormsSync();
    return existingForm.id;
  }

  const newId = 'archive_' + Math.random().toString(36).substr(2, 9);
  const newArchive: ArchivedForm = {
    ...archive,
    id: newId,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  archives.push(newArchive);
  setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);

  try {
    await setDoc(doc(db, 'archived_forms', newId), {
      ...newArchive,
      createdAt: nowIso,
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
    return newId;
  } catch (error) {
    console.warn("Firestore archiveForm write warning (persisted locally):", error);
    return newId;
  }
}

function normalizeSchoolNameLocal(name: string): string {
  if (!name) return "";
  return name.toLowerCase()
    .replace(/(basic\s+education\s+school|school|مدرسة|للتعليم|الأساسي|الأساسية|التعليم|الخاصة|الخاص)/gi, '')
    .replace(/[\s\-_]/g, '')
    .trim();
}

function isSameSchoolLocal(school1?: string, school2?: string): boolean {
  if (!school1 || !school2) return false;
  const raw1 = school1.trim().toLowerCase();
  const raw2 = school2.trim().toLowerCase();
  if (raw1 === raw2) return true;

  // Cross-lingual and list comparison for Al Wusta schools
  for (const wilaya of OMAN_WUSTA_SCHOOLS) {
    for (const sch of wilaya.schools) {
      const match1 = (raw1 === sch.nameAr.toLowerCase() || raw1 === sch.nameEn.toLowerCase() || raw1.includes(sch.nameAr.toLowerCase()) || sch.nameAr.toLowerCase().includes(raw1) || raw1.includes(sch.nameEn.toLowerCase()) || sch.nameEn.toLowerCase().includes(raw1));
      const match2 = (raw2 === sch.nameAr.toLowerCase() || raw2 === sch.nameEn.toLowerCase() || raw2.includes(sch.nameAr.toLowerCase()) || sch.nameAr.toLowerCase().includes(raw2) || raw2.includes(sch.nameEn.toLowerCase()) || sch.nameEn.toLowerCase().includes(raw2));
      if (match1 && match2) return true;
    }
  }

  const s1 = normalizeSchoolNameLocal(school1);
  const s2 = normalizeSchoolNameLocal(school2);
  return s1.includes(s2) || s2.includes(s1);
}

function getWorkflowStageRank(form: ArchivedForm): number {
  const normalized = normalizeWorkflowStage(form);
  if (normalized.workflowStage === 'completed' || (normalized.isSigned && normalized.isTeacherSigned)) return 4;
  if (normalized.workflowStage === 'principal_signed_transferred_to_teacher' || normalized.isSigned) return 3;
  if (normalized.workflowStage === 'admin_transferred_to_principal' || normalized.adminReviewedBy || normalized.adminReviewedAt) return 2;
  if (normalized.workflowStage === 'examiner_submitted_to_admin' || normalized.isExaminerSigned) return 1;
  return 0;
}

function normalizeWorkflowStage(form: ArchivedForm): ArchivedForm {
  let stage = form.workflowStage;
  if (form.isSigned && form.isTeacherSigned) {
    stage = 'completed';
  } else if (form.isSigned) {
    stage = 'principal_signed_transferred_to_teacher';
  } else if (stage === 'admin_transferred_to_principal' || form.adminReviewedBy || form.adminReviewedAt) {
    stage = 'admin_transferred_to_principal';
  } else if (!stage || stage === ('admin_transferred_to_teacher' as any)) {
    stage = 'examiner_submitted_to_admin';
  }
  return { ...form, workflowStage: stage };
}

function pickMoreAdvancedForm(a: ArchivedForm, b: ArchivedForm): ArchivedForm {
  const normA = normalizeWorkflowStage(a);
  const normB = normalizeWorkflowStage(b);
  const rankA = getWorkflowStageRank(normA);
  const rankB = getWorkflowStageRank(normB);
  if (rankB > rankA) return normB;
  if (rankA > rankB) return normA;
  const timeA = new Date(normA.updatedAt || normA.createdAt || 0).getTime();
  const timeB = new Date(normB.updatedAt || normB.createdAt || 0).getTime();
  return timeB >= timeA ? normB : normA;
}

function deduplicateFormsByTeacher(forms: ArchivedForm[]): ArchivedForm[] {
  const normalizedForms = forms.map(normalizeWorkflowStage);
  const map = new Map<string, ArchivedForm>();
  for (const form of normalizedForms) {
    const rawTeacher = (form.teacherName || form.teacherFileNo || 'unknown_teacher')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/^أ\.\s*|^د\.\s*/g, '')
      .trim()
      .toLowerCase();
    const teacherKey = rawTeacher || 'unknown_teacher';
    const schoolKey = (form.schoolName || 'unknown_school').trim().toLowerCase();
    const key = `${schoolKey}_${teacherKey}`;
    if (!map.has(key)) {
      map.set(key, form);
    } else {
      const existing = map.get(key)!;
      if (existing.id === form.id) {
        map.set(key, pickMoreAdvancedForm(existing, form));
      } else {
        const existingCreated = new Date(existing.createdAt || 0).getTime();
        const formCreated = new Date(form.createdAt || 0).getTime();
        map.set(key, formCreated >= existingCreated ? form : existing);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mapFirestoreDocToArchivedForm(docSnap: { id: string; data: () => any }): ArchivedForm {
  const data = docSnap.data() as any;
  let createdAtStr = new Date().toISOString();
  let updatedAtStr = new Date().toISOString();

  if (data.createdAt && typeof data.createdAt.toDate === 'function') {
    createdAtStr = data.createdAt.toDate().toISOString();
  } else if (data.createdAt) {
    createdAtStr = new Date(data.createdAt).toISOString();
  }

  if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
    updatedAtStr = data.updatedAt.toDate().toISOString();
  } else if (data.updatedAt) {
    updatedAtStr = new Date(data.updatedAt).toISOString();
  }

  let signedAtStr = data.signedAt;
  if (signedAtStr && typeof signedAtStr.toDate === 'function') {
    signedAtStr = signedAtStr.toDate().toISOString();
  }
  let teacherSignedAtStr = data.teacherSignedAt;
  if (teacherSignedAtStr && typeof teacherSignedAtStr.toDate === 'function') {
    teacherSignedAtStr = teacherSignedAtStr.toDate().toISOString();
  }
  let examinerSignedAtStr = data.examinerSignedAt;
  if (examinerSignedAtStr && typeof examinerSignedAtStr.toDate === 'function') {
    examinerSignedAtStr = examinerSignedAtStr.toDate().toISOString();
  }
  let adminReviewedAtStr = data.adminReviewedAt || null;
  if (adminReviewedAtStr && typeof adminReviewedAtStr.toDate === 'function') {
    adminReviewedAtStr = adminReviewedAtStr.toDate().toISOString();
  }

  return normalizeWorkflowStage({
    id: docSnap.id,
    assessmentId: data.assessmentId,
    assessmentTitle: data.assessmentTitle,
    assessmentType: data.assessmentType,
    grade: data.grade,
    subject: data.subject,
    schoolName: data.schoolName,
    schoolId: data.schoolId,
    teacherName: data.teacherName,
    teacherFileNo: data.teacherFileNo,
    appointmentYear: data.appointmentYear,
    directorate: data.directorate,
    visitDate: data.visitDate,
    subjectName: data.subjectName,
    academicYear: data.academicYear,
    semester: data.semester,
    suggestedDevelopment: data.suggestedDevelopment,
    examinerName: data.examinerName,
    principalName: data.principalName,
    students: data.students || [],
    observations: data.observations || [],
    isSigned: data.isSigned || false,
    signedAt: signedAtStr,
    signedByPrincipalName: data.signedByPrincipalName,
    signatureQrData: data.signatureQrData,
    signatureStampUrl: data.signatureStampUrl,
    isTeacherSigned: data.isTeacherSigned || false,
    teacherSignedAt: teacherSignedAtStr,
    teacherSignedName: data.teacherSignedName,
    teacherSignatureQrData: data.teacherSignatureQrData,
    teacherSignatureStampUrl: data.teacherSignatureStampUrl,
    isExaminerSigned: data.isExaminerSigned || false,
    examinerSignedAt: examinerSignedAtStr,
    examinerSignedName: data.examinerSignedName,
    examinerSignatureQrData: data.examinerSignatureQrData,
    examinerSignatureStampUrl: data.examinerSignatureStampUrl,
    conformanceStatus: data.conformanceStatus,
    hasGradeRevisions: data.hasGradeRevisions,
    workflowStage: data.workflowStage,
    adminReviewedAt: adminReviewedAtStr,
    adminReviewedBy: data.adminReviewedBy || null,
    createdAt: createdAtStr,
    updatedAt: updatedAtStr
  });
}

function mergeLocalAndRemoteForms(remoteForms: ArchivedForm[]): { merged: ArchivedForm[]; toSyncToFirestore: ArchivedForm[] } {
  const demoSeedIds = new Set(INITIAL_SANDBOX_ARCHIVED_FORMS.map(s => s.id));
  const localForms = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, []);
  const byId = new Map<string, ArchivedForm>();
  const remoteById = new Map<string, ArchivedForm>();

  for (const remote of remoteForms) {
    if (!remote || !remote.id || demoSeedIds.has(remote.id)) continue;
    const normRemote = normalizeWorkflowStage(remote);
    remoteById.set(remote.id, normRemote);
    byId.set(remote.id, normRemote);
  }

  for (const local of localForms) {
    if (!local || !local.id || demoSeedIds.has(local.id)) continue;
    const existing = byId.get(local.id);
    if (existing) {
      byId.set(local.id, pickMoreAdvancedForm(existing, local));
    } else {
      byId.set(local.id, normalizeWorkflowStage(local));
    }
  }

  if (byId.size === 0) {
    for (const seed of INITIAL_SANDBOX_ARCHIVED_FORMS) {
      byId.set(seed.id, normalizeWorkflowStage(seed));
    }
  }

  const merged = Array.from(byId.values());
  const toSyncToFirestore: ArchivedForm[] = [];

  for (const item of merged) {
    if (demoSeedIds.has(item.id)) continue;
    const remoteItem = remoteById.get(item.id);
    if (!remoteItem || getWorkflowStageRank(item) > getWorkflowStageRank(remoteItem)) {
      toSyncToFirestore.push(item);
    }
  }

  try {
    localStorage.setItem(SANDBOX_ARCHIVED_FORMS_KEY, JSON.stringify(merged));
  } catch (e) {
    // Ignore storage quota errors
  }

  return { merged, toSyncToFirestore };
}

export async function getArchivedForms(userProfileOrId?: UserProfile | string): Promise<ArchivedForm[]> {
  const isProfile = userProfileOrId && typeof userProfileOrId === 'object' && 'role' in userProfileOrId;
  const passedId = !isProfile && typeof userProfileOrId === 'string' ? userProfileOrId : undefined;

  if (isSandboxActive()) {
    const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
    if (passedId) {
      return deduplicateFormsByTeacher(archives.filter(a => a.schoolId === passedId));
    }
    return deduplicateFormsByTeacher(archives);
  }

  try {
    const q = passedId
      ? query(collection(db, 'archived_forms'), where('schoolId', '==', passedId))
      : query(collection(db, 'archived_forms'));
    const querySnapshot = await getDocs(q);
    const remoteResults: ArchivedForm[] = [];

    querySnapshot.forEach((docSnap) => {
      remoteResults.push(mapFirestoreDocToArchivedForm(docSnap));
    });

    const { merged, toSyncToFirestore } = mergeLocalAndRemoteForms(remoteResults);

    // Asynchronously push any missing seed or more-advanced local forms to Firestore
    if (toSyncToFirestore.length > 0) {
      Promise.allSettled(
        toSyncToFirestore.map((form) =>
          setDoc(doc(db, 'archived_forms', form.id), JSON.parse(JSON.stringify(form)), { merge: true })
        )
      ).catch(() => {});
    }

    if (passedId) {
      return deduplicateFormsByTeacher(merged.filter(a => a.schoolId === passedId));
    }
    return deduplicateFormsByTeacher(merged);
  } catch (error) {
    console.warn("Firestore getArchivedForms fallback to local cache:", error);
    const localFallback = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
    return deduplicateFormsByTeacher(localFallback);
  }
}

export function subscribeToArchivedForms(
  _userProfile: UserProfile | null,
  onUpdate: (forms: ArchivedForm[]) => void
): () => void {
  let latestRemoteForms: ArchivedForm[] = [];

  const emitMerged = () => {
    const { merged } = mergeLocalAndRemoteForms(latestRemoteForms);
    onUpdate(deduplicateFormsByTeacher(merged));
  };

  // Immediate emit from local cache so UI is never blank
  emitMerged();

  const handleLocalSync = () => {
    emitMerged();
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === SANDBOX_ARCHIVED_FORMS_KEY) {
      emitMerged();
    }
  };

  window.addEventListener('oman_moe_archived_forms_updated', handleLocalSync);
  window.addEventListener('storage', handleStorageEvent);

  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('oman_moe_sync_channel');
      bc.onmessage = () => {
        emitMerged();
      };
    } catch (e) {
      bc = null;
    }
  }

  let unsubFirestore: (() => void) | null = null;
  if (!isSandboxActive()) {
    try {
      const q = query(collection(db, 'archived_forms'));
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const remote: ArchivedForm[] = [];
          snapshot.forEach((docSnap) => {
            remote.push(mapFirestoreDocToArchivedForm(docSnap));
          });
          latestRemoteForms = remote;
          const { merged, toSyncToFirestore } = mergeLocalAndRemoteForms(remote);
          if (toSyncToFirestore.length > 0) {
            Promise.allSettled(
              toSyncToFirestore.map((form) =>
                setDoc(doc(db, 'archived_forms', form.id), JSON.parse(JSON.stringify(form)), { merge: true })
              )
            ).catch(() => {});
          }
          onUpdate(deduplicateFormsByTeacher(merged));
        },
        (err) => {
          console.warn("Firestore archived_forms real-time listener error:", err);
        }
      );
    } catch (e) {
      console.warn("Could not attach Firestore archived_forms listener:", e);
    }
  }

  return () => {
    window.removeEventListener('oman_moe_archived_forms_updated', handleLocalSync);
    window.removeEventListener('storage', handleStorageEvent);
    if (bc) {
      bc.close();
    }
    if (unsubFirestore) {
      unsubFirestore();
    }
  };
}

export async function signArchivedForm(
  archiveId: string, 
  principalName: string, 
  signatureQrData: string, 
  stampUrl?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const idx = archives.findIndex(a => a.id === archiveId);
  let targetForm: Partial<ArchivedForm> = {};

  if (idx !== -1) {
    archives[idx] = {
      ...archives[idx],
      isSigned: true,
      workflowStage: 'principal_signed_transferred_to_teacher',
      signedAt: nowIso,
      signedByPrincipalName: principalName,
      signatureQrData: signatureQrData,
      signatureStampUrl: stampUrl || 'Stamping verified electronically',
      updatedAt: nowIso
    };
    targetForm = archives[idx];
    setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);
  }

  if (isSandboxActive()) return;

  try {
    await setDoc(doc(db, 'archived_forms', archiveId), {
      ...JSON.parse(JSON.stringify(targetForm)),
      isSigned: true,
      workflowStage: 'principal_signed_transferred_to_teacher',
      signedAt: nowIso,
      signedByPrincipalName: principalName,
      signatureQrData: signatureQrData,
      signatureStampUrl: stampUrl || 'Stamping verified electronically',
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
  } catch (error) {
    console.warn("Firestore signArchivedForm sync warning:", error);
  }
}

export async function signArchivedTeacherForm(
  archiveId: string, 
  teacherName: string, 
  signatureQrData: string, 
  stampUrl?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const idx = archives.findIndex(a => a.id === archiveId);
  let targetForm: Partial<ArchivedForm> = {};

  if (idx !== -1) {
    archives[idx] = {
      ...archives[idx],
      isTeacherSigned: true,
      workflowStage: 'completed',
      teacherSignedAt: nowIso,
      teacherSignedName: teacherName,
      teacherSignatureQrData: signatureQrData,
      teacherSignatureStampUrl: stampUrl || 'Teacher verified electronically',
      updatedAt: nowIso
    };
    targetForm = archives[idx];
    setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);
  }

  if (isSandboxActive()) return;

  try {
    await setDoc(doc(db, 'archived_forms', archiveId), {
      ...JSON.parse(JSON.stringify(targetForm)),
      isTeacherSigned: true,
      workflowStage: 'completed',
      teacherSignedAt: nowIso,
      teacherSignedName: teacherName,
      teacherSignatureQrData: signatureQrData,
      teacherSignatureStampUrl: stampUrl || 'Teacher verified electronically',
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
  } catch (error) {
    console.warn("Firestore signArchivedTeacherForm sync warning:", error);
  }
}

export async function transferArchivedFormToPrincipal(
  archiveId: string, 
  adminName: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const idx = archives.findIndex(a => a.id === archiveId);
  let targetForm: Partial<ArchivedForm> = {};

  if (idx !== -1) {
    archives[idx] = {
      ...archives[idx],
      workflowStage: 'admin_transferred_to_principal',
      adminReviewedAt: nowIso,
      adminReviewedBy: adminName,
      updatedAt: nowIso
    };
    targetForm = archives[idx];
    setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);
  }

  if (isSandboxActive()) return;

  try {
    await setDoc(doc(db, 'archived_forms', archiveId), {
      ...JSON.parse(JSON.stringify(targetForm)),
      workflowStage: 'admin_transferred_to_principal',
      adminReviewedAt: nowIso,
      adminReviewedBy: adminName,
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
  } catch (error) {
    console.warn("Firestore transferArchivedFormToPrincipal sync warning:", error);
  }
}

export async function transferArchivedFormToTeacher(
  archiveId: string, 
  adminName: string
): Promise<void> {
  return transferArchivedFormToPrincipal(archiveId, adminName);
}


export async function markAssessmentReadByExaminer(
  assessmentId: string, 
  examinerName: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1 && !assessments[idx].examinerReadReceiptLogged) {
      assessments[idx] = {
        ...assessments[idx],
        readByExaminer: { name: examinerName, timestamp: nowIso },
        examinerReadReceiptLogged: true,
        updatedAt: nowIso
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);
      await createActivityLog({
        assessmentId,
        action: 'EXAMINER_READ_RECEIPT',
        userId: 'examiner',
        userName: examinerName,
        userRole: 'moderator',
        comment: `تمت القراءة من قبل : المدقق أ. ${examinerName}`
      });
    }
    return;
  }

  const path = `assessments/${assessmentId}`;
  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      readByExaminer: { name: examinerName, timestamp: nowIso },
      examinerReadReceiptLogged: true,
      updatedAt: serverTimestamp()
    });
    await createActivityLog({
      assessmentId,
      action: 'EXAMINER_READ_RECEIPT',
      userId: 'examiner',
      userName: examinerName,
      userRole: 'moderator',
      comment: `تمت القراءة من قبل : المدقق أ. ${examinerName}`
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function signArchivedExaminerForm(
  archiveId: string, 
  examinerName: string, 
  signatureQrData: string, 
  stampUrl?: string,
  conformanceStatus?: 'conforming' | 'non-conforming',
  hasGradeRevisions?: boolean
): Promise<void> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const idx = archives.findIndex(a => a.id === archiveId);
  let targetForm: Partial<ArchivedForm> = {};

  if (idx !== -1) {
    archives[idx] = {
      ...archives[idx],
      isExaminerSigned: true,
      workflowStage: archives[idx].workflowStage || 'examiner_submitted_to_admin',
      examinerSignedAt: nowIso,
      examinerSignedName: examinerName,
      examinerSignatureQrData: signatureQrData,
      examinerSignatureStampUrl: stampUrl || 'Examiner verified electronically',
      conformanceStatus: conformanceStatus || undefined,
      hasGradeRevisions: hasGradeRevisions || false,
      updatedAt: nowIso
    };
    targetForm = archives[idx];
    setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);
  }

  if (isSandboxActive()) return;

  try {
    await setDoc(doc(db, 'archived_forms', archiveId), {
      ...JSON.parse(JSON.stringify(targetForm)),
      isExaminerSigned: true,
      workflowStage: targetForm.workflowStage || 'examiner_submitted_to_admin',
      examinerSignedAt: nowIso,
      examinerSignedName: examinerName,
      examinerSignatureQrData: signatureQrData,
      examinerSignatureStampUrl: stampUrl || 'Examiner verified electronically',
      conformanceStatus: conformanceStatus || null,
      hasGradeRevisions: hasGradeRevisions || false,
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
  } catch (error) {
    console.warn("Firestore signArchivedExaminerForm sync warning:", error);
  }
}

export async function updateArchivedFormStudents(
  archiveId: string, 
  students: StudentMark[]
): Promise<void> {
  const nowIso = new Date().toISOString();
  const archives = getSandboxData<ArchivedForm[]>(SANDBOX_ARCHIVED_FORMS_KEY, INITIAL_SANDBOX_ARCHIVED_FORMS);
  const idx = archives.findIndex(a => a.id === archiveId);
  let targetForm: Partial<ArchivedForm> = {};

  if (idx !== -1) {
    archives[idx] = {
      ...archives[idx],
      students,
      updatedAt: nowIso
    };
    targetForm = archives[idx];
    setSandboxData(SANDBOX_ARCHIVED_FORMS_KEY, archives);
  }

  if (isSandboxActive()) return;

  try {
    await setDoc(doc(db, 'archived_forms', archiveId), {
      ...JSON.parse(JSON.stringify(targetForm)),
      students,
      updatedAt: nowIso
    }, { merge: true });
    notifyArchivedFormsSync();
  } catch (error) {
    console.warn("Firestore updateArchivedFormStudents sync warning:", error);
  }
}

// --- FORM CUSTOMIZATION AND RENDERING DESIGN ENGINE (ADMIN-ONLY CONTROLLER) ---
export const DEFAULT_FORM_STYLES: FormDesignSettings = {
  primaryFont: 'Cairo', // Options: 'Cairo', 'Tajawal', 'Amiri', 'Inter', 'IBM Plex Sans Arabic'
  monoFont: 'JetBrains Mono', // Options: 'JetBrains Mono', 'Courier New', 'Fira Code'
  titleSize: '24px',
  headerDetailsSize: '13px',
  tableHeaderSize: '13px',
  tableBodySize: '12px',
  notesSize: '11px',
  primaryColor: '#821315', // Oman Ministry Red / Royal Burgundy
  secondaryColor: '#051C3F', // Complementary Navy Blue
  tablePaddingY: '8px',
  outerPadding: '32px',
  borderWidth: '1.5px',
  borderType: 'solid',
  titleTextAr: 'وزارة التعليم',
  titleTextEn: 'MINISTRY OF EDUCATION',
  subTitleTextAr: 'المديرية العامة للإشراف التربوي - دائرة تقييم العائد التدريبي والقياس اللغوي',
  subTitleTextEn: 'DIRECTORATE GENERAL OF EDUCATIONAL SUPERVISION',
  showWatermark: true,
  watermarkText: 'وزارة التعليم - وثيقة فحص رسمية',

  // Default content labels for total control configuration
  reportTitleAr: 'استمارة الفحص و التدقيق المستمر',
  reportTitleEn: 'Continuous Assessment Auditing & Moderation Form',
  labelSchoolAr: 'المدرسة الدراسية:',
  labelSchoolEn: 'School:',
  labelAcademicAr: 'المجلس الأكاديمي والزيارة:',
  labelAcademicEn: 'Academic & Visit:',
  labelTeacherAr: 'الأستاذ القائم / المعلم:',
  labelTeacherEn: 'Assigned Teacher:',
  labelSubjectAr: 'المادة وسنة التعيين:',
  labelSubjectEn: 'Subject & Appt Year:',
  labelFileNumberAr: 'رقم الملف الوظيفي:',
  labelFileNumberEn: 'File ID Number:',
  labelYearOfAppointmentAr: 'سنة التعيين:',
  labelYearOfAppointmentEn: 'Appointment Year:',
  labelDirectorateAr: 'المديريـــــــــة:',
  labelDirectorateEn: 'Directorate:',
  labelSpecializationAr: 'التخصـــــــــص:',
  labelSpecializationEn: 'Specialization:',
  labelVisitDateAr: 'تاريخ الزيارة:',
  labelVisitDateEn: 'Visit Date:',

  colIdAr: 'م',
  colStudentNameAr: 'اسم الطالب ثلاثياً وقبيلته',
  colClassAr: 'الصف والشعبة',
  colToolAr: 'أداة التقويم المستمر',
  colScoreBeforeAr: 'قبل',
  colScoreAfterAr: 'بعد',
  colReasonAr: 'سبب التعديل',

  sectionDevelopmentAr: 'برامج الإنماء والتمكين المهني المقترحة بالتقرير:',
  sectionAuditorSignAr: 'مشرف فحص ومطابقة المادة:',
  sectionPrincipalSignAr: 'مدير المدرسة المصادق:',
  sectionTeacherSignAr: 'توقيع المعلم القائم بالرصد:',
  
  showTeacherSignature: true,
  showSultanateLogo: true,
  cardBackgroundType: 'plain',
  tableHeaderBg: '#f8fafc',
  signatureLayout: 'horizontal',

  // Table styling & movement defaults
  tableBorderWidth: '1px',
  tableBorderType: 'solid',
  tableBorderColor: '#cbd5e1',
  tableOuterBorderColor: '#821315',
  tableOuterBorderWidth: '1.5px',
  tableGridPattern: 'full',
  tableMarginTop: '0px',
  tableMarginBottom: '0px',
  sectionSpacingY: '12px',
  headerMarginBottom: '12px',
  metaMarginBottom: '12px',
  legendPaddingY: '8px',
  signaturesPaddingY: '12px',
  printPageMarginX: '12mm',
  printPageMarginY: '10mm',
  printPagePadding: '6mm 8mm',
  printZoom: '100%',
  stampOffsetX: 0,
  stampOffsetY: 0
};

const SANDBOX_FORM_SETTINGS_KEY = 'oman_moe_sandbox_form_settings_v2';

export async function getFormDesignSettings(): Promise<FormDesignSettings> {
  const sanitize = (settings: FormDesignSettings): FormDesignSettings => {
    const res = { ...DEFAULT_FORM_STYLES, ...settings };
    if (!res.colReasonAr || res.colReasonAr === 'سبب التعديل والقرار الفني للمطابقة' || res.colReasonAr.includes('والقرار الفني')) {
      res.colReasonAr = 'سبب التعديل';
    }
    if (!res.colScoreBeforeAr || res.colScoreBeforeAr === 'الدرجة قبل') {
      res.colScoreBeforeAr = 'قبل';
    }
    if (!res.colScoreAfterAr || res.colScoreAfterAr === 'الدرجة بعد') {
      res.colScoreAfterAr = 'بعد';
    }
    return res;
  };

  if (isSandboxActive()) {
    const val = localStorage.getItem(SANDBOX_FORM_SETTINGS_KEY);
    if (val) {
      try {
        return sanitize(JSON.parse(val));
      } catch (e) {
        return DEFAULT_FORM_STYLES;
      }
    }
    return DEFAULT_FORM_STYLES;
  }

  const path = 'form_settings/global_style';
  try {
    const s = await getDoc(doc(db, 'form_settings', 'global_style'));
    if (s.exists()) {
      return sanitize(s.data() as FormDesignSettings);
    }
    return DEFAULT_FORM_STYLES;
  } catch (error) {
    console.warn("Firestore style load defaulted to fallback:", error);
    return DEFAULT_FORM_STYLES;
  }
}

export async function saveFormDesignSettings(settings: FormDesignSettings): Promise<void> {
  if (isSandboxActive()) {
    localStorage.setItem(SANDBOX_FORM_SETTINGS_KEY, JSON.stringify(settings));
    return;
  }

  const path = 'form_settings/global_style';
  try {
    await setDoc(doc(db, 'form_settings', 'global_style'), {
      ...settings,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const SANDBOX_SCHOOLS_KEY = 'oman_moe_sandbox_schools_v4';

export async function getSchoolsList(): Promise<SchoolDoc[]> {
  if (isSandboxActive()) {
    const val = localStorage.getItem(SANDBOX_SCHOOLS_KEY);
    if (val) {
      try {
        const parsed = JSON.parse(val) as SchoolDoc[];
        if (parsed.length >= 27 && parsed.some(s => s.nameAr.includes('11 يناير'))) {
          return parsed;
        }
      } catch (e) {
        // Fallback to static seed
      }
    }
    // Seed Sandbox schools list from static OMAN_WUSTA_SCHOOLS
    const initialList: SchoolDoc[] = [];
    let idx = 1;
    OMAN_WUSTA_SCHOOLS.forEach(wilaya => {
      wilaya.schools.forEach(school => {
        initialList.push({
          id: `school-seed-${idx++}`,
          nameAr: school.nameAr,
          nameEn: school.nameEn,
          wilayaId: wilaya.id,
          wilayaAr: wilaya.nameAr,
          wilayaEn: wilaya.nameEn,
          createdAt: new Date().toISOString()
        });
      });
    });
    localStorage.setItem(SANDBOX_SCHOOLS_KEY, JSON.stringify(initialList));
    return initialList;
  }

  const path = 'schools';
  try {
    const snapshot = await getDocs(collection(db, 'schools'));
    const list: SchoolDoc[] = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as SchoolDoc);
    });

    if (list.length === 0) {
      // Seed Firebase automatically so the admin has the data
      const initialList: SchoolDoc[] = [];
      let idx = 1;
      for (const wilaya of OMAN_WUSTA_SCHOOLS) {
        for (const school of wilaya.schools) {
          const newId = `school-seed-${idx++}`;
          const item = {
            nameAr: school.nameAr,
            nameEn: school.nameEn,
            wilayaId: wilaya.id,
            wilayaAr: wilaya.nameAr,
            wilayaEn: wilaya.nameEn,
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'schools', newId), item);
          initialList.push({ id: newId, ...item });
        }
      }
      return initialList;
    }

    return list.sort((a, b) => a.nameAr.localeCompare(b.nameAr));
  } catch (error) {
    console.warn("Firestore schools failed to load: ", error);
    // Return static seed fallback
    const list: SchoolDoc[] = [];
    let idx = 1;
    OMAN_WUSTA_SCHOOLS.forEach(wilaya => {
      wilaya.schools.forEach(school => {
        list.push({
          id: `school-fallback-${idx++}`,
          nameAr: school.nameAr,
          nameEn: school.nameEn,
          wilayaId: wilaya.id,
          wilayaAr: wilaya.nameAr,
          wilayaEn: wilaya.nameEn,
          createdAt: new Date().toISOString()
        });
      });
    });
    return list;
  }
}

export async function syncOfficialWustaSchools(): Promise<SchoolDoc[]> {
  const initialList: SchoolDoc[] = [];
  let idx = 1;
  for (const wilaya of OMAN_WUSTA_SCHOOLS) {
    for (const school of wilaya.schools) {
      initialList.push({
        id: `school-wusta-${idx++}`,
        nameAr: school.nameAr,
        nameEn: school.nameEn,
        wilayaId: wilaya.id,
        wilayaAr: wilaya.nameAr,
        wilayaEn: wilaya.nameEn,
        createdAt: new Date().toISOString()
      });
    }
  }

  if (isSandboxActive()) {
    localStorage.setItem(SANDBOX_SCHOOLS_KEY, JSON.stringify(initialList));
    return initialList;
  }

  try {
    const existingSnapshot = await getDocs(collection(db, 'schools'));
    const existingMap = new Map<string, string>();
    existingSnapshot.forEach(d => {
      const data = d.data();
      if (data?.nameAr) {
        existingMap.set(data.nameAr, d.id);
      }
    });

    for (const item of initialList) {
      const existingId = existingMap.get(item.nameAr);
      const targetId = existingId || item.id;
      await setDoc(doc(db, 'schools', targetId), {
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        wilayaId: item.wilayaId,
        wilayaAr: item.wilayaAr,
        wilayaEn: item.wilayaEn,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    return await getSchoolsList();
  } catch (err) {
    console.warn("Failed to sync Firestore schools, returning static list:", err);
    return initialList;
  }
}

export async function addSchoolDoc(school: Omit<SchoolDoc, 'id' | 'createdAt'>): Promise<string> {
  const timestamp = new Date().toISOString();
  if (isSandboxActive()) {
    const list = await getSchoolsList();
    const newId = `school-custom-${Date.now()}`;
    const newSchool: SchoolDoc = {
      id: newId,
      ...school,
      createdAt: timestamp
    };
    list.push(newSchool);
    localStorage.setItem(SANDBOX_SCHOOLS_KEY, JSON.stringify(list));
    return newId;
  }

  const path = 'schools';
  try {
    const docRef = await addDoc(collection(db, 'schools'), {
      ...school,
      createdAt: timestamp
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function updateSchoolDoc(schoolId: string, updates: Partial<SchoolDoc>): Promise<void> {
  if (isSandboxActive()) {
    const list = await getSchoolsList();
    const idx = list.findIndex(s => s.id === schoolId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem(SANDBOX_SCHOOLS_KEY, JSON.stringify(list));
    }
    return;
  }

  const path = `schools/${schoolId}`;
  try {
    await updateDoc(doc(db, 'schools', schoolId), {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSchoolDoc(schoolId: string): Promise<void> {
  if (isSandboxActive()) {
    let list = await getSchoolsList();
    list = list.filter(s => s.id !== schoolId);
    localStorage.setItem(SANDBOX_SCHOOLS_KEY, JSON.stringify(list));
    return;
  }

  const path = `schools/${schoolId}`;
  try {
    await deleteDoc(doc(db, 'schools', schoolId));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- School Stamps Operations ---
export async function uploadSchoolStamp(
  schoolId: string, 
  stampDataUrl: string, 
  fileName?: string, 
  adminName?: string
): Promise<string> {
  const now = new Date().toISOString();
  let finalStampUrl = stampDataUrl;

  // Try uploading to Firebase Storage if online and not sandbox
  if (!isSandboxActive() && stampDataUrl.startsWith('data:')) {
    try {
      const cleanFileName = (fileName || 'official_school_stamp.png').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileRef = ref(storage, `school_stamps/${schoolId}/${Date.now()}_${cleanFileName}`);
      await uploadString(fileRef, stampDataUrl, 'data_url');
      finalStampUrl = await getDownloadURL(fileRef);
    } catch (storageErr) {
      console.warn("Storage upload failed or offline, saving DataURL directly to Firestore:", storageErr);
      finalStampUrl = stampDataUrl;
    }
  }

  const updates: Partial<SchoolDoc> = {
    stampUrl: finalStampUrl,
    stampName: fileName || 'school_stamp.png',
    stampUploadedAt: now,
    stampUploadedBy: adminName || 'مدير النظام (Admin)',
    updatedAt: now
  };

  // Cache locally for instantaneous retrieval across the portal
  try {
    localStorage.setItem(`oman_school_stamp_${schoolId}`, finalStampUrl);
  } catch (e) {
    // ignore quota err
  }

  await updateSchoolDoc(schoolId, updates);
  return finalStampUrl;
}

export async function deleteSchoolStamp(schoolId: string): Promise<void> {
  const now = new Date().toISOString();
  const updates: Partial<SchoolDoc> = {
    stampUrl: '',
    stampName: '',
    stampUploadedAt: '',
    stampUploadedBy: '',
    updatedAt: now
  };

  try {
    localStorage.removeItem(`oman_school_stamp_${schoolId}`);
  } catch (e) {
    // ignore
  }

  await updateSchoolDoc(schoolId, updates);
}

export async function getSchoolStampBySchoolIdOrName(schoolIdOrName: string): Promise<string | null> {
  if (!schoolIdOrName) return null;
  const target = schoolIdOrName.trim().toLowerCase();

  // 1. Check local storage cache first
  try {
    const cached = localStorage.getItem(`oman_school_stamp_${schoolIdOrName}`);
    if (cached) return cached;
  } catch (e) {
    // ignore
  }

  // 2. Look up in schools list
  try {
    const schools = await getSchoolsList();
    const found = schools.find(s => 
      s.id === schoolIdOrName ||
      s.nameAr.trim().toLowerCase() === target ||
      (s.nameEn && s.nameEn.trim().toLowerCase() === target) ||
      target.includes(s.nameAr.trim().toLowerCase()) ||
      s.nameAr.trim().toLowerCase().includes(target)
    );
    if (found && found.stampUrl) {
      try {
        localStorage.setItem(`oman_school_stamp_${found.id}`, found.stampUrl);
      } catch (e) {}
      return found.stampUrl;
    }
  } catch (err) {
    console.warn("Failed looking up school stamp:", err);
  }

  return null;
}

// --- School Reports Operations ---
const SANDBOX_REPORTS_KEY = 'sandbox_school_reports';

export async function getSchoolReports(userProfile?: UserProfile | null): Promise<SchoolReport[]> {
  if (isSandboxActive()) {
    const raw = localStorage.getItem(SANDBOX_REPORTS_KEY);
    const list: SchoolReport[] = raw ? JSON.parse(raw) : [];
    if (!userProfile) return list;
    if (userProfile.role === 'admin') {
      return list;
    } else {
      // Automatic routing: each school gets only its designated reports
      const mySchoolName = (userProfile.schoolName || '').trim().toLowerCase();
      return list.filter(r => {
        const repSchoolName = (r.schoolName || '').trim().toLowerCase();
        return (
          r.schoolId === userProfile.uid || 
          (mySchoolName && repSchoolName && (mySchoolName === repSchoolName || mySchoolName.includes(repSchoolName) || repSchoolName.includes(mySchoolName)))
        );
      });
    }
  }

  const path = 'school_reports';
  try {
    if (!userProfile) {
      const snap = await getDocs(collection(db, 'school_reports'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolReport));
    }

    if (userProfile.role === 'admin') {
      const snap = await getDocs(collection(db, 'school_reports'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolReport));
    } else {
      // Fetch all reports to filter client-side for resilient matching without complex Firestore compound setups
      const snap = await getDocs(collection(db, 'school_reports'));
      const allReports = snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolReport));
      const mySchoolName = (userProfile.schoolName || '').trim().toLowerCase();
      
      return allReports.filter(r => {
        const repSchoolName = (r.schoolName || '').trim().toLowerCase();
        return (
          r.schoolId === userProfile.uid || 
          (mySchoolName && repSchoolName && (mySchoolName === repSchoolName || mySchoolName.includes(repSchoolName) || repSchoolName.includes(mySchoolName)))
        );
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function createSchoolReport(report: Omit<SchoolReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = new Date().toISOString();
  if (isSandboxActive()) {
    const raw = localStorage.getItem(SANDBOX_REPORTS_KEY);
    const list: SchoolReport[] = raw ? JSON.parse(raw) : [];
    const newReport: SchoolReport = {
      ...report,
      id: 'rep_' + Math.random().toString(36).substr(2, 9),
      isRead: false,
      readAt: '',
      readBy: '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newReport);
    localStorage.setItem(SANDBOX_REPORTS_KEY, JSON.stringify(list));
    return newReport.id!;
  }

  const path = 'school_reports';
  try {
    const docRef = await addDoc(collection(db, 'school_reports'), {
      ...report,
      isRead: false,
      readAt: '',
      readBy: '',
      createdAt: now,
      updatedAt: now
    });

    // If PDF is supplied and is in base64 DataURL format, upload it to real Firebase Storage
    const rawPdfData = report.pdfData;
    if (rawPdfData && rawPdfData.startsWith('data:')) {
      try {
        const fileRef = ref(storage, `school_reports/${docRef.id}/${report.pdfName || 'school_report.pdf'}`);
        await uploadString(fileRef, rawPdfData, 'data_url');
        const downloadUrl = await getDownloadURL(fileRef);
        
        // Update document with the clean storage URL
        await updateDoc(doc(db, 'school_reports', docRef.id), { pdfData: downloadUrl });
      } catch (storageErr) {
        console.warn("Could not save to Firebase Storage, falling back to Base64 in Firestore", storageErr);
      }
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function deleteSchoolReport(reportId: string): Promise<void> {
  if (isSandboxActive()) {
    const raw = localStorage.getItem(SANDBOX_REPORTS_KEY);
    if (raw) {
      let list: SchoolReport[] = JSON.parse(raw);
      list = list.filter(r => r.id !== reportId);
      localStorage.setItem(SANDBOX_REPORTS_KEY, JSON.stringify(list));
    }
    return;
  }

  const path = `school_reports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'school_reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function markSchoolReportAsRead(reportId: string, userName: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSandboxActive()) {
    const raw = localStorage.getItem(SANDBOX_REPORTS_KEY);
    if (raw) {
      const list: SchoolReport[] = JSON.parse(raw);
      const index = list.findIndex(r => r.id === reportId);
      if (index !== -1) {
        list[index].isRead = true;
        list[index].readAt = now;
        list[index].readBy = userName;
        list[index].updatedAt = now;
        localStorage.setItem(SANDBOX_REPORTS_KEY, JSON.stringify(list));
      }
    }
    return;
  }

  const path = `school_reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'school_reports', reportId), {
      isRead: true,
      readAt: now,
      readBy: userName,
      updatedAt: now
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}




export async function createTeacherNotification(notification: Omit<TeacherNotification, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'teacher_notifications'), {
      ...notification,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating teacher notification:', error);
    throw error;
  }
}

export async function getTeacherNotifications(teacherId: string): Promise<TeacherNotification[]> {
  try {
    const q = query(
      collection(db, 'teacher_notifications'),
      where('teacherId', '==', teacherId)
    );
    const snap = await getDocs(q);
    const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeacherNotification));
    return results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (error) {
    console.error('Error fetching teacher notifications:', error);
    return [];
  }
}

export async function markTeacherNotificationRead(notificationId: string): Promise<void> {
  try {
    const docRef = doc(db, 'teacher_notifications', notificationId);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
  }
}

// --- 5-STEP UPLOAD LIFECYCLE: SCHOOL INSPECTION PLANS & UPLOADS WORKFLOW ---
import { SchoolInspectionPlan } from '../types';

const SANDBOX_INSPECTION_PLANS_KEY = 'oman_moe_sandbox_inspection_plans_v1';

const INITIAL_SANDBOX_INSPECTION_PLANS: SchoolInspectionPlan[] = [
  {
    id: 'plan_duqm',
    schoolId: 'school_duqm',
    schoolName: LINKED_EXPERIMENT_SCHOOL_AR,
    inspectionDate: '2026-10-26',
    adminUnlocked: true,
    principalUnlocked: true,
    adminUnlockedAt: new Date().toISOString(),
    principalUnlockedAt: new Date().toISOString(),
    notes: 'تاريخ الفحص المحدد - تم فتح صلاحية الرفع للمدرسة والمعلمين',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'plan_soqra',
    schoolId: 'school_soqra',
    schoolName: 'صوقرة للتعليم الأساسي',
    inspectionDate: '2026-10-28',
    adminUnlocked: true,
    principalUnlocked: false,
    adminUnlockedAt: new Date().toISOString(),
    notes: 'تم فتح صلاحية الرفع من مدير النظام - بانتظار تفعيل مدير المدرسة للمعلمين',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'plan_haima',
    schoolId: 'school_haima',
    schoolName: 'مدرسة هيماء للتعليم الأساسي',
    inspectionDate: '2026-11-02',
    adminUnlocked: false,
    principalUnlocked: false,
    notes: 'موعد الفحص المجدول القادم وفق الخطة الوزارية',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'plan_mahout',
    schoolId: 'school_mahout',
    schoolName: 'مدرسة محوت للتعليم الأساسي',
    inspectionDate: '2026-11-09',
    adminUnlocked: false,
    principalUnlocked: false,
    notes: 'موعد الفحص المجدول وفق الخطة الوزارية',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function getInspectionPlans(): Promise<SchoolInspectionPlan[]> {
  if (isSandboxActive()) {
    const raw = getSandboxData<SchoolInspectionPlan[]>(SANDBOX_INSPECTION_PLANS_KEY, INITIAL_SANDBOX_INSPECTION_PLANS);
    return raw.map(p => ({
      ...p,
      // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
      principalUnlocked: p.adminUnlocked ? (p.principalUnlocked ?? false) : false
    }));
  }

  try {
    const q = collection(db, 'inspection_plans');
    const snap = await getDocs(q);
    const list: SchoolInspectionPlan[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const adminUnlocked = data.adminUnlocked ?? false;
      // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
      const principalUnlocked = adminUnlocked ? (data.principalUnlocked ?? false) : false;
      list.push({
        id: d.id,
        schoolId: data.schoolId || d.id,
        schoolName: data.schoolName,
        inspectionDate: data.inspectionDate,
        adminUnlocked,
        principalUnlocked,
        adminUnlockedAt: data.adminUnlockedAt,
        principalUnlockedAt: adminUnlocked ? data.principalUnlockedAt : undefined,
        notes: data.notes || '',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      });
    });
    return list;
  } catch (error) {
    console.warn('Error fetching inspection plans from firestore, using local state:', error);
    const raw = getSandboxData<SchoolInspectionPlan[]>(SANDBOX_INSPECTION_PLANS_KEY, INITIAL_SANDBOX_INSPECTION_PLANS);
    return raw.map(p => ({
      ...p,
      principalUnlocked: p.adminUnlocked ? (p.principalUnlocked ?? false) : false
    }));
  }
}

export async function saveInspectionPlan(plan: Partial<SchoolInspectionPlan> & { schoolName: string }): Promise<void> {
  const now = new Date().toISOString();
  if (isSandboxActive()) {
    const plans = getSandboxData<SchoolInspectionPlan[]>(SANDBOX_INSPECTION_PLANS_KEY, INITIAL_SANDBOX_INSPECTION_PLANS);
    const existingIdx = plans.findIndex(p => isSameSchoolLocal(p.schoolName, plan.schoolName));
    if (existingIdx !== -1) {
      const mergedAdminUnlocked = plan.adminUnlocked !== undefined ? plan.adminUnlocked : plans[existingIdx].adminUnlocked;
      // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
      const mergedPrincipalUnlocked = mergedAdminUnlocked 
        ? (plan.principalUnlocked !== undefined ? plan.principalUnlocked : plans[existingIdx].principalUnlocked) 
        : false;
      plans[existingIdx] = {
        ...plans[existingIdx],
        ...plan,
        adminUnlocked: mergedAdminUnlocked,
        principalUnlocked: mergedPrincipalUnlocked,
        principalUnlockedAt: mergedPrincipalUnlocked ? (plan.principalUnlockedAt || plans[existingIdx].principalUnlockedAt) : undefined,
        updatedAt: now
      };
    } else {
      const adminUnlocked = plan.adminUnlocked ?? false;
      const principalUnlocked = adminUnlocked ? (plan.principalUnlocked ?? false) : false;
      plans.push({
        id: 'plan_' + Math.random().toString(36).substring(2, 9),
        schoolId: plan.schoolId || 'school_' + Math.random().toString(36).substring(2, 7),
        schoolName: plan.schoolName,
        inspectionDate: plan.inspectionDate || '2026-11-01',
        adminUnlocked,
        principalUnlocked,
        notes: plan.notes || '',
        createdAt: now,
        updatedAt: now
      });
    }
    setSandboxData(SANDBOX_INSPECTION_PLANS_KEY, plans);
    return;
  }

  try {
    const plansRef = collection(db, 'inspection_plans');
    const q = query(plansRef, where('schoolName', '==', plan.schoolName));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docId = snap.docs[0].id;
      const existingData = snap.docs[0].data();
      const mergedAdminUnlocked = plan.adminUnlocked !== undefined ? plan.adminUnlocked : existingData.adminUnlocked;
      // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
      const mergedPrincipalUnlocked = mergedAdminUnlocked 
        ? (plan.principalUnlocked !== undefined ? plan.principalUnlocked : existingData.principalUnlocked) 
        : false;
      await updateDoc(doc(db, 'inspection_plans', docId), {
        ...plan,
        adminUnlocked: mergedAdminUnlocked,
        principalUnlocked: mergedPrincipalUnlocked,
        principalUnlockedAt: mergedPrincipalUnlocked ? (plan.principalUnlockedAt || existingData.principalUnlockedAt) : null,
        updatedAt: now
      });
    } else {
      const adminUnlocked = plan.adminUnlocked ?? false;
      const principalUnlocked = adminUnlocked ? (plan.principalUnlocked ?? false) : false;
      await addDoc(plansRef, {
        schoolId: plan.schoolId || 'school_' + Math.random().toString(36).substring(2, 7),
        schoolName: plan.schoolName,
        inspectionDate: plan.inspectionDate || '2026-11-01',
        adminUnlocked,
        principalUnlocked,
        notes: plan.notes || '',
        createdAt: now,
        updatedAt: now
      });
    }
  } catch (e) {
    console.error('Error saving inspection plan:', e);
  }
}

export async function toggleAdminUploadPermission(schoolName: string, unlocked: boolean): Promise<void> {
  await saveInspectionPlan({
    schoolName,
    adminUnlocked: unlocked,
    adminUnlockedAt: unlocked ? new Date().toISOString() : undefined,
    // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
    principalUnlocked: unlocked ? undefined : false,
    principalUnlockedAt: unlocked ? undefined : undefined
  });
}

export async function togglePrincipalUploadPermission(schoolName: string, unlocked: boolean): Promise<{ success: boolean; message?: string }> {
  const status = await getSchoolUploadPermissionStatus(schoolName);
  if (unlocked && !status.adminUnlocked) {
    return {
      success: false,
      message: 'عذراً، لا يمكنك فتح الصلاحية للمعلمين قبل أن يقوم مدير النظام بفتح الصلاحية لمدرستك أولاً وفق خطة الفحص.'
    };
  }
  await saveInspectionPlan({
    schoolName,
    principalUnlocked: unlocked,
    principalUnlockedAt: unlocked ? new Date().toISOString() : undefined
  });
  return { success: true };
}

export async function getSchoolUploadPermissionStatus(schoolName: string): Promise<{
  adminUnlocked: boolean;
  principalUnlocked: boolean;
  canTeacherUpload: boolean;
  inspectionDate: string;
  notes?: string;
}> {
  const plans = await getInspectionPlans();
  const matched = plans.find(p => isSameSchoolLocal(p.schoolName, schoolName));

  if (!matched) {
    // Default fallback: Duqm is unlocked for testing, others require admin setup
    const isDuqm = isSameSchoolLocal(schoolName, LINKED_EXPERIMENT_SCHOOL_AR);
    return {
      adminUnlocked: isDuqm,
      principalUnlocked: isDuqm,
      canTeacherUpload: isDuqm,
      inspectionDate: '2026-10-26',
      notes: isDuqm ? 'مفتوحة تلقائياً' : 'مطلوب إدراج خطة الفحص من مدير النظام'
    };
  }

  const adminUnlocked = matched.adminUnlocked ?? false;
  // عندما يغلق مدير النظام الصلاحية تغلق صلاحية المدير تلقائياً
  const principalUnlocked = adminUnlocked ? (matched.principalUnlocked ?? false) : false;
  const canUpload = adminUnlocked && principalUnlocked;
  return {
    adminUnlocked,
    principalUnlocked,
    canTeacherUpload: canUpload,
    inspectionDate: matched.inspectionDate,
    notes: matched.notes
  };
}

export async function approveAssessmentByPrincipal(assessmentId: string, principalProfile: UserProfile): Promise<void> {
  const now = new Date().toISOString();
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1) {
      assessments[idx] = {
        ...assessments[idx],
        workflowStage: 'principal_approved',
        principalApprovedAt: now,
        principalApprovedBy: principalProfile.name,
        status: 'Pending', // Pending admin dispatch
        updatedAt: now
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);
      await createActivityLog({
        assessmentId,
        action: 'Principal Approved',
        userId: principalProfile.uid,
        userName: principalProfile.name,
        userRole: 'school',
        comment: `وافق مدير المدرسة (${principalProfile.name}) على إرسال ملف المعلم للوزارة لإسناده للفاحصين.`
      });
    }
    return;
  }

  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      workflowStage: 'principal_approved',
      principalApprovedAt: now,
      principalApprovedBy: principalProfile.name,
      updatedAt: now
    });
    await createActivityLog({
      assessmentId,
      action: 'Principal Approved',
      userId: principalProfile.uid,
      userName: principalProfile.name,
      userRole: 'school',
      comment: `وافق مدير المدرسة (${principalProfile.name}) على إرسال الملف للوزارة.`
    });
  } catch (error) {
    console.error('Error approving assessment by principal:', error);
  }
}

export async function dispatchAssessmentToExaminer(
  assessmentId: string, 
  examinerId: string, 
  examinerName: string, 
  adminProfile: UserProfile
): Promise<void> {
  const now = new Date().toISOString();
  if (isSandboxActive()) {
    const assessments = getSandboxData<Assessment[]>(SANDBOX_ASSESSMENTS_KEY, INITIAL_SANDBOX_ASSESSMENTS);
    const idx = assessments.findIndex(a => a.id === assessmentId);
    if (idx !== -1) {
      assessments[idx] = {
        ...assessments[idx],
        workflowStage: 'admin_dispatched',
        moderatorId: examinerId,
        moderatorName: examinerName,
        adminDispatchedAt: now,
        adminDispatchedBy: adminProfile.name,
        status: 'In Progress', // Active in examiner queue
        updatedAt: now
      };
      setSandboxData(SANDBOX_ASSESSMENTS_KEY, assessments);
      await createActivityLog({
        assessmentId,
        action: 'Admin Dispatched',
        userId: adminProfile.uid,
        userName: adminProfile.name,
        userRole: 'admin',
        comment: `قام مدير النظام بتحويل واستلام الملف وإسناده للفاحص المعتمد: ${examinerName}`
      });
    }
    return;
  }

  try {
    await updateDoc(doc(db, 'assessments', assessmentId), {
      workflowStage: 'admin_dispatched',
      moderatorId: examinerId,
      moderatorName: examinerName,
      adminDispatchedAt: now,
      adminDispatchedBy: adminProfile.name,
      status: 'In Progress',
      updatedAt: now
    });
    await createActivityLog({
      assessmentId,
      action: 'Admin Dispatched',
      userId: adminProfile.uid,
      userName: adminProfile.name,
      userRole: 'admin',
      comment: `قام مدير النظام بإسناد وتحويل الملف للفاحص المعتمد: ${examinerName}`
    });
  } catch (error) {
    console.error('Error dispatching assessment to examiner:', error);
  }
}


export const DEFAULT_SUBJECTS = [
  'Arabic Language', 'English Language', 'Mathematics', 
  'Science', 'Physics', 'Chemistry', 'Biology', 
  'Islamic Studies', 'Social Studies', 'Information Technology',
  'Applied Sciences', 'Individual Skills'
];

export async function getSubjectsList(): Promise<string[]> {
  try {
    const docRef = doc(db, 'form_settings', 'subjects');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().list) {
      return docSnap.data().list;
    }
    return DEFAULT_SUBJECTS;
  } catch (err) {
    console.error("Error getting subjects:", err);
    return DEFAULT_SUBJECTS;
  }
}

export async function saveSubjectsList(list: string[]): Promise<void> {
  try {
    const docRef = doc(db, 'form_settings', 'subjects');
    await setDoc(docRef, { list, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error("Error saving subjects:", err);
    throw err;
  }
}
