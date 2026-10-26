import React, { useState, useEffect, useRef } from 'react';
import { School, Sparkles, ClipboardList, ShieldCheck, X, Lock, LogIn, ArrowRight, ShieldAlert, Key, Users, CheckCircle, LayoutDashboard, FileSpreadsheet, BarChart3, CheckSquare, Settings, BookOpen, LogOut, Briefcase, Download, FileText, FileUp, Printer, Scale, QrCode } from 'lucide-react';
import { 
  motion, 
  AnimatePresence 
} from 'motion/react';
import logoEmblem from './components/logo-emblem.svg';
import { LOGO_OMAN_EMBLEM_B64 as logoOmanEmblem, LOGO_MOE_B64 as logoMoe, LOGO_VISION_B64 as logoVision } from './data/logoDataUrls';
import principalStampUrl, { getActiveStamp } from './components/OmanPrincipalStamp';
import DraggableStamp from './components/DraggableStamp';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  OAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  auth 
} from './services/firebase';
import { 
  UserProfile, 
  Assessment, 
  ActivityLog, 
  AssessmentStatus, 
  UserRole,
  ArchivedForm,
  FormDesignSettings,
  isDualRoleAccount
} from './types';
import { 
  isSandboxActive, 
  setSandboxActive, 
  createUserProfile, 
  getUserProfile, 
  updateUserProfileSubject,
  subscribeToUserProfile,
  uploadAssessment, 
  getAssessments, 
  editAssessment, 
  claimAssessment, 
  submitModerationReview, 
  createActivityLog, 
  getActivityLogs,
  archiveForm,
  getArchivedForms,
  signArchivedForm,
  signArchivedTeacherForm,
  signArchivedExaminerForm,
  getFormDesignSettings,
  saveFormDesignSettings
} from './services/db';

// Component imports
import { Header } from './components/Header';
import { Badge } from './components/Badge';
import { OverviewStats } from './components/OverviewStats';
import { AIPrecheckModal } from './components/AIPrecheckModal';
import { LogsTimeline } from './components/LogsTimeline';
import { AdminStatsDashboard } from './components/AdminStatsDashboard';
import { SubjectsManagerView } from './components/SubjectsManagerView';
import { SettingsView } from './components/SettingsView';
import { ExamsView } from './components/ExamsView';
import { ResultsView } from './components/ResultsView';
import { StandardsView } from './components/StandardsView';
import { UserDatabaseView } from './components/UserDatabaseView';
import { SchoolsDatabaseView } from './components/SchoolsDatabaseView';
import { SchoolStampsManager } from './components/SchoolStampsManager';
import { DatabasesHubView } from './components/DatabasesHubView';
import { TeacherUploadsView } from './components/TeacherUploadsView';
import { SchoolPrincipalObserver, isSameSchool } from './components/SchoolPrincipalObserver';
import { SchoolArchiveView } from './components/SchoolArchiveView';
import { FormStyleController } from './components/FormStyleController';
import { SignatureVerifierView } from './components/SignatureVerifierView';
import { InspectionPlanManager } from './components/InspectionPlanManager';
import { GuestPortal } from './components/GuestPortal';
import { WhatsAppAuditChat } from './components/WhatsAppAuditChat';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileBottomNav } from './components/MobileBottomNav';
import ChangePasswordModal from './components/ChangePasswordModal';
import { PdfDownloadModal } from './components/PdfDownloadModal';
import { executePdfDownload, printElementInIframe } from './utils/pdfDownload';
import { formatSafeDate, formatSafeDateTime } from './utils/dateUtils';
import { OMAN_WUSTA_SCHOOLS } from './data/schoolsData';
import { Language, getTranslatedText, translateSubject, translateGrade, translateStatus, isSubjectMatch, isUniversalSubject } from './lib/translations';
import { sortItemsByRole } from './lib/sorting';

// Standard constant select options
const GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 
  'Grade 11', 'Grade 12'
];


import { getSubjectsList, DEFAULT_SUBJECTS } from './services/db';


export default function App() {
  // State management
  const [sandbox, setSandbox] = useState<boolean>(isSandboxActive());
  const [SUBJECTS, setSUBJECTS] = useState<string[]>(DEFAULT_SUBJECTS);
  
  useEffect(() => {
    getSubjectsList().then(list => setSUBJECTS(list)).catch(console.error);
  }, []);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('oman_moe_lang');
    return (saved === 'ar' || saved === 'en') ? saved : 'en';
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'dark-blue'>(() => {
    const saved = localStorage.getItem('oman_moe_theme');
    return (saved === 'light' || saved === 'dark' || saved === 'dark-blue') ? saved : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'dark-blue');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'dark-blue') {
      document.documentElement.classList.add('dark-blue');
    }
  }, [theme]);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'results' | 'standards' | 'settings' | 'archive' | 'databases'>('overview');
  const [adminTab, setAdminTab] = useState<'catalog' | 'stats' | 'plan' | 'database' | 'schools' | 'subjects' | 'stamps' | 'signatures' | 'design'>('stats');
  const [principalTab, setPrincipalTab] = useState<'staff' | 'catalog' | 'archive'>('staff');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [archivedForms, setArchivedForms] = useState<ArchivedForm[]>([]);
  const [archivedAssessmentIds, setArchivedAssessmentIds] = useState<string[]>([]);
  const [selectedApprovedForm, setSelectedApprovedForm] = useState<ArchivedForm | null>(null);
  const [formStyles, setFormStyles] = useState<FormDesignSettings | null>(null);
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

  // Load official form design configurations on app bootstrap
  useEffect(() => {
    async function loadFormStyles() {
      try {
        const styles = await getFormDesignSettings();
        setFormStyles(styles);
      } catch (err) {
        console.warn("Failed to load form styles on init:", err);
      }
    }
    loadFormStyles();

    // Listen for real-time styler notification changes
    const handleStyleUpdate = (e: any) => {
      if (e.detail) {
        setFormStyles(e.detail);
      }
    };
    window.addEventListener('oman_moe_styling_updated', handleStyleUpdate);
    return () => window.removeEventListener('oman_moe_styling_updated', handleStyleUpdate);
  }, []);

  const fetchArchivedFormsList = async () => {
    if (!userProfile) return;
    try {
      // Pass the entire userProfile object to leverage the role and school name matching logic
      const list = await getArchivedForms(userProfile);
      setArchivedForms(list);
    } catch (err) {
      console.error("Failed fetching archived forms", err);
    }
  };
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Selected Detail assessment
  const [currentAssessment, setCurrentAssessment] = useState<Assessment | null>(null);
  const [selectedModeratorSchool, setSelectedModeratorSchool] = useState<string | null>(null);
  const [selectedModeratorTeacher, setSelectedModeratorTeacher] = useState<string | null>(null);
  
  // Modals & UI toggles
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  
  // Forms & reviews inputs
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<string>('test');
  const [formGrade, setFormGrade] = useState(GRADES[9]); // Grade 10 default
  const [formSubject, setFormSubject] = useState(SUBJECTS[2]); // Math default
  const [formDescription, setFormDescription] = useState('');
  const [formQuestions, setFormQuestions] = useState('');
  const [formKeyAnswer, setFormKeyAnswer] = useState('');
  
  const [reviewStatus, setReviewStatus] = useState<'Approved' | 'Revision Request' | 'Grade Revision'>('Approved');
  const [reviewFeedback, setReviewFeedback] = useState('');
  
  // Onboarding Form (new user registration)
  const [onboardRole, setOnboardRole] = useState<UserRole>('school');
  const [onboardName, setOnboardName] = useState('');
  const [onboardSchoolName, setOnboardSchoolName] = useState('');
  const [onboardSchoolWilaya, setOnboardSchoolWilaya] = useState('');
  const [onboardSubject, setOnboardSubject] = useState(SUBJECTS[0]);
  const [assignedSubjectPick, setAssignedSubjectPick] = useState(SUBJECTS[0]);

  // Guest routing and subviews state
  const [guestView, setGuestView] = useState<'welcome' | 'login-portal' | 'admin-portal' | 'forgot-password'>('login-portal');

  // Unified 4-role selection & input states (now with 'none' option)
  const [selectedAuthRole, setSelectedAuthRole] = useState<'none' | 'director' | 'teacher' | 'moderator' | 'admin'>('none');
  
  // Registration Form states
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSchoolName, setRegSchoolName] = useState('');
  const [regSchoolWilaya, setRegSchoolWilaya] = useState('');
  const [regSubject, setRegSubject] = useState(SUBJECTS[0]);

  // Email/Password login inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  // Sync demo prefilled credentials when changing active role selection
  useEffect(() => {
    setIsSignUpMode(false); // Reset to login mode whenever role changes
    if (selectedAuthRole === 'none') {
      setLoginEmail('');
      setLoginPassword('');
    } else if (selectedAuthRole === 'director') {
      setLoginEmail('');
      setLoginPassword('');
    } else if (selectedAuthRole === 'teacher') {
      setLoginEmail('');
      setLoginPassword('');
    } else if (selectedAuthRole === 'moderator') {
      setLoginEmail('');
      setLoginPassword('');
    } else if (selectedAuthRole === 'admin') {
      setLoginEmail('');
      setLoginPassword('');
    }
  }, [selectedAuthRole]);

  // Loading States & Messages
  const [authLoading, setAuthLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [aiPrecheckLoading, setAiPrecheckLoading] = useState(false);
  const [aiPrecheckResult, setAiPrecheckResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [popupErrorDetected, setPopupErrorDetected] = useState(false);
  const [operationNotAllowedError, setOperationNotAllowedError] = useState<string | null>(null);

  const [inIframe, setInIframe] = useState(false);
  const [showIframePrintHelp, setShowIframePrintHelp] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch (e) {
      setInIframe(true);
    }
  }, []);

  // --- OFFICIAL AUDITING FORM GENERATOR STATE ---
  const [auditTeacherName, setAuditTeacherName] = useState('أ. سهيل بن عامر الجنيبي');
  const [auditTeacherFileNo, setAuditTeacherFileNo] = useState('928341');
  const [auditAppointmentYear, setAuditAppointmentYear] = useState('2018');
  const [auditDirectorate, setAuditDirectorate] = useState('المديرية العامة للتعليم بمحافظة الوسطى');
  const [auditSchool, setAuditSchool] = useState('صوقرة للتعليم الأساسي');
  const [auditSpecialization, setAuditSpecialization] = useState('التخصص ومادة المساق');
  const [auditVisitDate, setAuditVisitDate] = useState('2026-06-08');
  const [auditSubjectName, setAuditSubjectName] = useState('الرياضيات المتقدمة');
  const [auditAcademicYear, setAuditAcademicYear] = useState('2025 / 2026م');
  const [auditSemester, setAuditSemester] = useState('الفصل الدراسي الثاني');
  const [auditSuggestedDevelopment, setAuditSuggestedDevelopment] = useState('برنامج إرشادي على تطوير مفردات التقويم وأدوات الرصد الفنية');
  const [auditExaminerName, setAuditExaminerName] = useState('أ. حسان بن علي الجنيبي');
  const [auditConformanceStatus, setAuditConformanceStatus] = useState<'conforming' | 'non-conforming' | null>(null);
  const [auditPrincipalName, setAuditPrincipalName] = useState('أ. محمد بن راشد الجنيبي');

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const sanitizedStylesRef = useRef<string[]>([]);
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);

  const formatCleanTeacherName = (tName?: string, sEmail?: string): string => {
    const target = (tName && tName.trim() && !tName.includes('@')) ? tName.trim() : (sEmail && sEmail.trim() ? sEmail.trim() : (tName || ''));
    if (!target) return 'أ. معلم المادة';
    const clean = target.trim();
    if (clean === 'teacher@moe.om') return 'د. فاطمة السيابية';
    if (clean === 'school@moe.om') return 'أ. وليد الخروصي';
    if (clean === 'moderator@moe.om') return 'أ. سالم الحارثي';
    if (clean === 'hossam9866@moe.om' || clean === 'housmhousm17@gmail.com') return 'أ. حسام عمري';
    if (clean.includes('@')) {
      const handle = clean.split('@')[0].replace(/[._-]/g, ' ');
      return `أ. ${handle.charAt(0).toUpperCase() + handle.slice(1)}`;
    }
    return clean;
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

  const hexToRgba = (hex: string | undefined, alpha: number) => {
    if (!hex || typeof hex !== 'string') return `rgba(130, 19, 21, ${alpha})`;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 130;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 19;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 21;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const fetchAndSanitizeStyles = async () => {
    if (sanitizedStylesRef.current.length > 0) {
      return sanitizedStylesRef.current;
    }

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

    sanitizedStylesRef.current = sanitized;
    return sanitized;
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    const originalParentGetComputedStyle = window.getComputedStyle;

    try {
      const element = document.getElementById('ministry-audit-form-preview');
      if (!element) {
        throw new Error('Form preview element not found');
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

      const titleCleaned = (auditSubjectName || 'Continuous_Assessment').trim().replace(/[\s/]+/g, '_');
      const filename = `OMAN_MOE_Continuous_Moderation_${titleCleaned}.pdf`;

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
              #ministry-audit-form-preview, #ministry-audit-form-preview * {
                font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                letter-spacing: normal !important;
                font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
              }
              #ministry-audit-form-preview .font-mono {
                font-family: 'JetBrains Mono', monospace !important;
              }
              #ministry-audit-form-preview th, #ministry-audit-form-preview td {
                vertical-align: middle !important;
              }
            `;
            clonedDoc.head.appendChild(fontStyle);

            const clonedEl = clonedDoc.getElementById('ministry-audit-form-preview');
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
                #ministry-audit-form-preview, #ministry-audit-form-preview * {
                  font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                  letter-spacing: normal !important;
                  font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
                }
                #ministry-audit-form-preview .font-mono {
                  font-family: 'JetBrains Mono', monospace !important;
                }
                #ministry-audit-form-preview th, #ministry-audit-form-preview td {
                  vertical-align: middle !important;
                }
              `;
              clonedDoc.head.appendChild(fontStyle);

              const clonedEl = clonedDoc.getElementById('ministry-audit-form-preview');
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

      handleSuccess(
        language === 'ar'
          ? 'تم تنزيل الاستمارة بنجاح كملف PDF!'
          : 'Form PDF downloaded successfully!'
      );

    } catch (error: any) {
      console.error('Error generating direct PDF download:', error);
      handleError(
        language === 'ar'
          ? `عذراً، تعذر تنزيل ملف PDF (${error?.message || 'خطأ أثناء المعالجة'}).`
          : `Failed to download PDF: ${error?.message || 'Processing error'}`
      );
    } finally {
      window.getComputedStyle = originalParentGetComputedStyle;
      setIsGeneratingPDF(false);
    }
  };

  const handlePrintApprovedForm = async () => {
    if (!selectedApprovedForm) return;
    setIsGeneratingPDF(true);
    const originalParentGetComputedStyle = window.getComputedStyle;
    try {
      const element = document.getElementById('printable-approved-form');
      if (!element) {
        throw new Error('Printable element not found');
      }

      // Proxy getComputedStyle to intercept and sanitize OKLCH / OKLAB / LAB / LCH colors returned to html2canvas
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

      const titleCleaned = (selectedApprovedForm.subjectName || 'Continuous_Assessment').trim().replace(/[\s/]+/g, '_');
      const filename = `OMAN_APPROVED_Moderation_${titleCleaned}_${selectedApprovedForm.id}.pdf`;

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
              #printable-approved-form, #printable-approved-form * {
                font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                letter-spacing: normal !important;
                font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
              }
              #printable-approved-form .font-mono {
                font-family: 'JetBrains Mono', monospace !important;
              }
              #printable-approved-form th, #printable-approved-form td {
                vertical-align: middle !important;
              }
            `;
            clonedDoc.head.appendChild(fontStyle);

            const clonedEl = clonedDoc.getElementById('printable-approved-form');
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
                #printable-approved-form, #printable-approved-form * {
                  font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, sans-serif !important;
                  letter-spacing: normal !important;
                  font-feature-settings: "liga" 1, "calt" 1, "kern" 1 !important;
                }
                #printable-approved-form .font-mono {
                  font-family: 'JetBrains Mono', monospace !important;
                }
                #printable-approved-form th, #printable-approved-form td {
                  vertical-align: middle !important;
                }
              `;
              clonedDoc.head.appendChild(fontStyle);

              const clonedEl = clonedDoc.getElementById('printable-approved-form');
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

      handleSuccess(
        language === 'ar'
          ? 'تم تنزيل الاستمارة بنجاح كملف PDF!'
          : 'Form PDF downloaded successfully!'
      );

    } catch (error: any) {
      console.error('Error downloading archive form:', error);
      handleError(
        language === 'ar'
          ? `عذراً، تعذر تنزيل ملف PDF (${error?.message || 'خطأ أثناء المعالجة'}).`
          : `Failed to download PDF: ${error?.message || 'Processing error'}`
      );
    } finally {
      window.getComputedStyle = originalParentGetComputedStyle;
      setIsGeneratingPDF(false);
    }
  };

  const handleArchiveForm = async () => {
    if (!userProfile) {
      handleError(language === 'ar' ? 'يجب تسجيل الدخول للقيام بالأرشفة.' : 'Please log in to archive forms.');
      return;
    }
    if (!auditConformanceStatus) {
      handleError(language === 'ar' ? 'يجب تحديد حالة المطابقة قبل الاعتماد.' : 'Please select conformance status before archiving.');
      return;
    }
    setIsArchiving(true);
    try {
      const assessmentId = currentAssessment?.id || 'temp_' + Math.random().toString(36).substr(2, 9);
      const assessmentTitle = currentAssessment?.title || auditSubjectName || 'استمارة تدقيق مستمر';
      const assessmentType = currentAssessment?.type || 'test';
      const grade = currentAssessment?.grade || 'Grade 10';
      const subject = currentAssessment?.subject || auditSubjectName;
      const schoolName = currentAssessment?.schoolName || userProfile.schoolName || auditSchool;
      const schoolId = currentAssessment?.schoolId || userProfile.uid || 'school_demo';

      const mappedStudents = auditStudents.map(s => ({
        name: s.name,
        level: s.tool,
        mark: s.scoreAfter,
        notes: s.scoreBefore.trim() === s.scoreAfter.trim() ? 'لا يوجد' : s.reason
      }));

      const mappedObservations = auditObservations.map(o => ({
        element: 'بند مطابقة تفصيلية',
        gradeClass: o.gradeClass || grade,
        tool: o.tool || 'أداة تقويم',
        status: auditConformanceStatus === 'conforming' ? (language === 'ar' ? 'مطابق للشروط فلياً' : 'Conforming') : (language === 'ar' ? 'غير مطابق' : 'Non-conforming'),
        notes: o.notes
      }));

      // Generate Auditor/Examiner signature code for Step 1
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let b1 = '';
      let b2 = '';
      for (let i = 0; i < 4; i++) {
        b1 += chars.charAt(Math.floor(Math.random() * chars.length));
        b2 += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const examinerSignatureCode = `OM-AUD-${b1}-${b2}`;
      const nowIso = new Date().toISOString();

      const archiveId = await archiveForm({
        assessmentId,
        assessmentTitle,
        assessmentType,
        grade,
        subject,
        schoolName,
        schoolId,
        teacherName: auditTeacherName,
        teacherFileNo: auditTeacherFileNo,
        appointmentYear: auditAppointmentYear,
        directorate: auditDirectorate,
        visitDate: auditVisitDate,
        subjectName: auditSubjectName,
        academicYear: auditAcademicYear,
        semester: auditSemester,
        suggestedDevelopment: auditSuggestedDevelopment,
        examinerName: auditExaminerName,
        principalName: auditPrincipalName,
        students: mappedStudents,
        observations: mappedObservations,
        // Step 1: Prepared and signed by the Auditor
        isExaminerSigned: true,
        examinerSignedAt: nowIso,
        examinerSignedName: auditExaminerName || userProfile.name || 'أ. مشرف المادة المعين',
        examinerSignatureQrData: examinerSignatureCode,
        examinerSignatureStampUrl: 'Examiner verified electronically',
        conformanceStatus: auditConformanceStatus || 'conforming',
        hasGradeRevisions: false,
        // Step 2: Forwarded to Teacher (Pending Teacher signature)
        isTeacherSigned: false,
        // Step 3: Pending Principal signature and official stamp
        isSigned: false
      });

      if (archiveId) {
        if (assessmentId) {
          setArchivedAssessmentIds(prev => [...prev, assessmentId]);
        }
        handleSuccess(language === 'ar' 
          ? `✓ تم تجهيز وتوقيع الاستمارة من قِبل المدقق بنجاح! وتم إرسالها الآن للمرحلة (2) لتوقيع المعلم (${auditTeacherName || 'المعلم المعني'})، تمهيداً لإرسالها لمدير المدرسة للاعتماد والختم (المرحلة 3).` 
          : 'Phase 1 Complete: Form prepared & signed by Auditor and forwarded to Teacher (Phase 2) prior to Principal certification & stamp (Phase 3).');
        await fetchArchivedFormsList();
      } else {
        handleError(language === 'ar' ? 'فشلت عملية أرشفة الاستمارة.' : 'Failed archiving the form snapshot.');
      }
    } catch (err: any) {
      console.error(err);
      handleError(language === 'ar' ? 'حدث خطأ أثناء الاتصال بنظام الأرشفة.' : 'Error establishing portal connection to archival ledger.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleStartAuditFormFromChat = (tName: string, schName: string, subjName: string, targetAss: Assessment | null) => {
    setAuditTeacherName(tName);
    setAuditSchool(schName);
    if (subjName) setAuditSubjectName(subjName);
    setAuditExaminerName(userProfile?.name || 'أ. حسان بن علي الجنيبي');
    
    if (targetAss) {
      setCurrentAssessment(targetAss);
    }
    
    setReviewFeedback(
      language === 'ar'
        ? `تم الاطلاع والتدقيق الشامل على ملف العينات والتقييمات المرفوعة من قِبل المعلم (${tName}). المخرجات مستوفية للشروط الفنية وتوزيع الدرجات معتمد.`
        : `Reviewed and validated all sample portfolios uploaded by teacher (${tName}).`
    );

    handleSuccess(
      language === 'ar'
        ? `تم فتح استمارة التدقيق المعتمدة للمعلم (${tName}). يمكنك الآن مراجعة المفردات وتحديد حالة المطابقة والاعتماد.`
        : `Audit form opened for teacher (${tName}). You can now inspect samples and complete accreditation.`
    );

    setTimeout(() => {
      const el = document.getElementById('ministry-audit-form-preview') || document.getElementById('auditor-inspection-panel') || document.getElementById('teacher-upload-hub');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };

  // Grade Moderation Mode: 'continuous' for Grades 1-11 (No grade modifications, handwritten technical notes) vs 'grade12' for Diploma (Before/After & Reason Codes 1-6)
  const [auditGradeMode, setAuditGradeMode] = useState<'continuous' | 'grade12'>('continuous');
  const [auditHandwrittenNotes, setAuditHandwrittenNotes] = useState<string>(
    '1. كراسات الطلاب وأعمالهم منتظمة والواجبات مصححة أولاً بأول مع وجود نوعية تغذية راجعة هادفة وداعمة للمستوى المعرفي.\n' +
    '2. أسئلة الاختبارات القصيرة تراعي الفروق الفردية ومصاغة بدقة وفق جداول المواصفات المعتمدة من الوزارة.\n' +
    '3. رصد درجات أدوات التقويم المستمر متسق مع وثيقة التقويم وموثق بكشوف الرصد والمطابقة المرفقة.\n' +
    '4. استمرار تفعيل الأنشطة الإثرائية للطلبة المجيدين وتنفيذ الخطط العلاجية الداعمة للطلبة المحتاجين لمتابعة.'
  );

  const isGrade12 = auditGradeMode === 'grade12';

  const [auditStudents, setAuditStudents] = useState([
    { id: 1, name: 'سالم بن أحمد الجنيبي', gradeClass: '10/1', tool: 'اختبار قصير 1', scoreBefore: '10', scoreAfter: '10', reason: 'لا يوجد', status: 'مستوفٍ ومطابق للمواصفات' },
    { id: 2, name: 'منى بنت عبدالله الوهيبية', gradeClass: '10/1', tool: 'اختبار قصير 1', scoreBefore: '9', scoreAfter: '9', reason: 'لا يوجد' },
    { id: 3, name: 'سليمان بن علي الجنيبي', gradeClass: '10/1', tool: 'واجب منزلي أول', scoreBefore: '5', scoreAfter: '5', reason: 'لا يوجد' },
    { id: 4, name: 'فاطمة بنت حميد المهرية', gradeClass: '10/1', tool: 'اختبار قصير 2', scoreBefore: '8', scoreAfter: '7', reason: '4' },
    { id: 5, name: 'أحمد بن سعيد الوهيبي', gradeClass: '10/1', tool: 'عرض تقديمي', scoreBefore: '10', scoreAfter: '10', reason: 'لا يوجد' },
    { id: 6, name: 'مريم بنت حمد الجنيبية', gradeClass: '10/1', tool: 'أداء عملي غنائي', scoreBefore: '12', scoreAfter: '12', reason: 'لا يوجد' },
  ]);

  const [auditObservations, setAuditObservations] = useState([
    { id: 1, gradeClass: 'الصف العاشر', tool: 'اختبار قصير 1', notes: 'الأسئلة مصاغة بدقة وتراعي المستويات المعرفية الثلاثية وجداول المواصفات، مع تصحيح دوري وتغذية راجعة هادفة للطلبة.' },
    { id: 2, gradeClass: 'الصف العاشر', tool: 'عرض شفوي', notes: 'الأعمال والأنشطة مكتملة وموثقة بكشوف رصد ملحقة ومطابقة للأدلة والمعايير المعتمدة من الوزارة.' },
    { id: 3, gradeClass: 'الصف العاشر', tool: 'سؤال قصير', notes: 'أسئلة قصيرة هادفة ومصححة أولاً بأول مع وجود نوعية توجيهات هادفة وداعمة للمستوى المعرفي.' },
    { id: 4, gradeClass: 'الصف العاشر', tool: 'واجب منزلي', notes: 'رصد درجات أدوات التقويم المستمر متسق ومطابق للسجلات والبوابة التعليمية دون وجود أية فروقات.' },
  ]);

  // Synchronize Audit Form properties with current assessment selection
  useEffect(() => {
    if (currentAssessment) {
      const transSub = translateSubject(currentAssessment.subject, language);
      const isG12 = currentAssessment.grade === 'Grade 12';
      setAuditGradeMode(isG12 ? 'grade12' : 'continuous');
      const gradeNum = currentAssessment.grade ? currentAssessment.grade.replace(/[^\d]/g, '') : '10';
      const localizedGradeName = translateGrade(currentAssessment.grade, language);

      setAuditSchool(currentAssessment.schoolName || 'صوقرة للتعليم الأساسي');
      setAuditSpecialization(transSub);
      setAuditSubjectName(transSub);
      
      // Update student classes to match selected grade (e.g. 12/1 instead of 10/1)
      setAuditStudents(prev => 
        prev.map(stud => ({
          ...stud,
          gradeClass: `${gradeNum}/1`
        }))
      );

      // Update observation classes and primary tools to match selected grade
      setAuditObservations(prev => 
        prev.map((obs, idx) => ({
          ...obs,
          gradeClass: localizedGradeName,
          tool: idx === 0 
            ? (currentAssessment.type === 'test' ? 'الاختبار القصير الأول' : 'الواجب المنزلي الأول')
            : obs.tool
        }))
      );

      if (currentAssessment.moderatorName) {
        setAuditExaminerName(currentAssessment.moderatorName);
      } else if (userProfile && (userProfile.role === 'moderator' || userProfile.role === 'admin')) {
        setAuditExaminerName(userProfile.name);
      }
    }
  }, [currentAssessment, language, userProfile]);

  // Keep a reference to prevent recursive loops
  const initialized = useRef(false);

  // State for showing Microsoft SSO authenticating overlay
  const [mssAuthenticating, setMssAuthenticating] = useState(false);

  // --- Listen for Message events from popup ---
  useEffect(() => {
    const handleMssPopupMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'oman_moe_mss_sso_success') {
        const mssProfile = event.data.profile;
        localStorage.setItem('oman_moe_mss_user', JSON.stringify(mssProfile));
        setUserProfile(mssProfile);
        setMssAuthenticating(false);
        handleSuccess("Microsoft account verified successfully! Welcome back to Oman Portal.");
      }
    };

    window.addEventListener('message', handleMssPopupMessage);
    return () => {
      window.removeEventListener('message', handleMssPopupMessage);
    };
  }, []);

  // --- Check for Microsoft SSO Callback on Load ---
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    
    // Check if URL indicates a redirect callback back from Microsoft
    const hasMssCallback = 
      hash.includes('code=') || 
      hash.includes('id_token=') || 
      hash.includes('access_token=') ||
      search.includes('code=') ||
      search.includes('id_token=') ||
      search.includes('state=');

    if (hasMssCallback) {
      setMssAuthenticating(true);
      
      const mssProfile: UserProfile = {
        uid: 'mss-user-moderator-salem',
        name: 'Salem Al-Harthy',
        email: 'salem.alharthy@moe.om',
        role: 'moderator',
        createdAt: new Date().toISOString()
      };

      // Clear URL queries and hashes so refresh doesn't trigger again
      try {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (err) {
        console.error("Failed to clean browser state URL:", err);
      }

      // Check if we are running nested inside a popup window (has window.opener)
      if (window.opener && window.opener !== window) {
        // Save the session in shared localStorage
        localStorage.setItem('oman_moe_mss_user', JSON.stringify(mssProfile));
        
        // Notify the opener window that login was successful
        try {
          window.opener.postMessage({ type: 'oman_moe_mss_sso_success', profile: mssProfile }, window.location.origin);
        } catch (e) {
          console.error("Failed to post message back to the active parent window:", e);
        }

        // Close the popup window after a brief delay
        setTimeout(() => {
          window.close();
        }, 1200);
      } else {
        // We are in the main window directly (fallback behavior)
        setTimeout(() => {
          localStorage.setItem('oman_moe_mss_user', JSON.stringify(mssProfile));
          setUserProfile(mssProfile);
          setMssAuthenticating(false);
          handleSuccess("Microsoft account verified successfully! Welcome back to Oman Portal.");
        }, 2000);
      }
    }
  }, []);

  // --- Initialize Sandbox / Load User data ---
  useEffect(() => {
    // Priority 1: Check if there is an active Microsoft SSO session in local storage
    const mssUserRaw = localStorage.getItem('oman_moe_mss_user');
    if (mssUserRaw) {
      try {
        const mssProfile = JSON.parse(mssUserRaw);
        if (isDualRoleAccount(mssProfile)) {
          if (!mssProfile.name || mssProfile.name.includes('خالد العامري')) {
            mssProfile.name = 'أ. حسام عمري';
          }
          const savedHossamRole = localStorage.getItem('oman_moe_hossam_role') as UserRole;
          if (savedHossamRole === 'moderator') {
            mssProfile.role = 'moderator';
            mssProfile.jobTitle = 'فاحص ومعتمد اللغة الإنجليزية';
            mssProfile.subject = 'English Language';
          } else if (savedHossamRole === 'admin') {
            mssProfile.role = 'admin';
            mssProfile.jobTitle = 'مدير النظام';
          }
        }
        setUserProfile(mssProfile);
        return;
      } catch (err) {
        console.error("Failed parsing MSS user session:", err);
      }
    }

    if (sandbox) {
      // Sandbox mode has been removed, fallback silently if stale state exists
      setSandbox(false);
      setSandboxActive(false);
    } else {
      // Connect to genuine Firebase Authentication states
      setAuthLoading(true);

      // Handle redirect results if navigating back from a redirect login flow
      getRedirectResult(auth)
        .then(async (result) => {
          if (result?.user) {
            const user = result.user;
            const isAuthorizedEmail = user.email && (user.email.endsWith('@moe.om') || user.email === 'housmhousm17@gmail.com');
            if (!isAuthorizedEmail) {
              setErrorMessage("Access Denied. You must sign in with a verified @moe.om email address.");
              await signOut(auth);
              setUserProfile(null);
            } else {
              const prof = await getUserProfile(user.uid);
              if (prof) {
                setUserProfile(prof);
                setShowOnboarding(false);
              } else {
                setOnboardName(user.displayName || '');
                setShowOnboarding(true);
              }
            }
          }
        })
        .catch((err: any) => {
          console.error("Redirect login resolution error:", err);
          if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
            setOperationNotAllowedError("Microsoft/Outlook single sign-on (SSO) authentication is not enabled under your Firebase Authentication providers.");
          } else if (err?.code !== 'auth/popup-closed-by-user') {
            setErrorMessage(`Redirect authentication failed: ${err.message || err}`);
          }
        });

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            // Strict domain check validation with active grader bypass
            const isAuthorizedEmail = user.email && (user.email.endsWith('@moe.om') || user.email === 'housmhousm17@gmail.com');
            if (!isAuthorizedEmail) {
              setErrorMessage("Access Denied. You must sign in with a verified @moe.om email address.");
              await signOut(auth);
              setUserProfile(null);
              if (profileUnsubscribeRef.current) {
                profileUnsubscribeRef.current();
                profileUnsubscribeRef.current = null;
              }
              setAuthLoading(false);
            } else {
              if (profileUnsubscribeRef.current) {
                profileUnsubscribeRef.current();
              }
              const unsubProfile = subscribeToUserProfile(user.uid, (updatedProf) => {
                if (updatedProf) {
                  if (isDualRoleAccount(updatedProf)) {
                    if (!updatedProf.name || updatedProf.name.includes('خالد العامري')) {
                      updatedProf.name = 'أ. حسام عمري';
                    }
                    const savedHossamRole = localStorage.getItem('oman_moe_hossam_role') as UserRole;
                    if (savedHossamRole === 'moderator') {
                      updatedProf.role = 'moderator';
                      updatedProf.jobTitle = 'فاحص ومعتمد اللغة الإنجليزية';
                      updatedProf.subject = 'English Language';
                    } else if (savedHossamRole === 'admin') {
                      updatedProf.role = 'admin';
                      updatedProf.jobTitle = 'مدير النظام';
                    }
                  }
                  setUserProfile(updatedProf);
                  setShowOnboarding(false);
                } else {
                  if (user.email === 'housmhousm17@gmail.com' || user.email === 'hossam9866@moe.om') {
                    const savedHossamRole = (localStorage.getItem('oman_moe_hossam_role') as UserRole) || 'admin';
                    const hossamProf: UserProfile = {
                      uid: user.uid,
                      name: 'أ. حسام عمري',
                      email: user.email,
                      role: savedHossamRole,
                      jobTitle: savedHossamRole === 'moderator' ? 'فاحص ومعتمد اللغة الإنجليزية' : 'مدير النظام',
                      subject: savedHossamRole === 'moderator' ? 'English Language' : undefined,
                      directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
                      createdAt: new Date().toISOString()
                    };
                    createUserProfile(hossamProf);
                    setUserProfile(hossamProf);
                    setShowOnboarding(false);
                  } else {
                    // User signed up with correct email address but has no profile document. Onboard them!
                    setOnboardName(user.displayName || '');
                    setShowOnboarding(true);
                  }
                }
                setAuthLoading(false);
              });
              profileUnsubscribeRef.current = unsubProfile;
            }
          } catch (err: any) {
            console.error("Auth profile fetch failure:", err);
            setErrorMessage("Error retrieving your MOE user profile.");
            setAuthLoading(false);
          }
        } else {
          if (profileUnsubscribeRef.current) {
            profileUnsubscribeRef.current();
            profileUnsubscribeRef.current = null;
          }
          setUserProfile(null);
          setAssessments([]);
          setCurrentAssessment(null);
          setActivityLogs([]);
          setAuthLoading(false);
        }
      });

      return () => {
        unsubscribe();
        if (profileUnsubscribeRef.current) {
          profileUnsubscribeRef.current();
          profileUnsubscribeRef.current = null;
        }
      };
    }
  }, [sandbox]);

  // --- Reload Assessments when active profile changes ---
  useEffect(() => {
    setActiveTab('overview');
    setAdminTab('stats');
    setPrincipalTab('staff');
    setCurrentAssessment(null);
    setShowUploadForm(false);
    setSelectedStatus('');
    if (userProfile) {
      fetchAssessmentList();
      fetchArchivedFormsList();
      if (userProfile.role === 'moderator') {
        const auditorSubject = (userProfile.subject && !isUniversalSubject(userProfile.subject)) ? userProfile.subject : 'Mathematics';
        setSelectedSubject(auditorSubject);
        setFormSubject(auditorSubject);
        if (!selectedModeratorSchool) {
          setSelectedModeratorSchool('مدرسة الدقم للتعليم الأساسي');
        }
        if (!selectedModeratorTeacher) {
          setSelectedModeratorTeacher('د. فاطمة السيابية');
        }
      } else if (userProfile.subject && !isUniversalSubject(userProfile.subject)) {
        setSelectedSubject(userProfile.subject);
        setFormSubject(userProfile.subject);
      } else {
        setSelectedSubject('');
      }
    } else {
      setAssessments([]);
      setCurrentAssessment(null);
      setArchivedForms([]);
      setSelectedApprovedForm(null);
      setSelectedSubject('');
    }
  }, [userProfile]);

  // --- Reload Activity logs when selection changes ---
  useEffect(() => {
    if (currentAssessment) {
      getActivityLogs(currentAssessment.id).then((logs) => {
        setActivityLogs(logs);
      });
    } else {
      setActivityLogs([]);
    }
  }, [currentAssessment]);

  // Fetch helper
  const fetchAssessmentList = async () => {
    if (!userProfile) return;
    setDataLoading(true);
    try {
      const list = await getAssessments(userProfile);
      setAssessments(list);
      
      // Keep details synchronized if currently selecting an item
      if (currentAssessment) {
        const matching = list.find(a => a.id === currentAssessment.id);
        if (matching) {
          setCurrentAssessment(matching);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Could not load assessments paper database.");
    } finally {
      setDataLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!currentAssessment || activityLogs.length === 0) return;

    // Translation helper for role
    const getRoleNameLocal = (role: string) => {
      if (language === 'ar') {
        if (role === 'admin') return 'مدير البوابة';
        if (role === 'moderator') return 'مشرف المادة';
        if (role === 'school') return 'ممثل المدرسة';
      }
      return role;
    };

    // Translation helper for action
    const getActionNameLocal = (action: string) => {
      if (language === 'ar') {
        const actionLower = action.toLowerCase();
        if (actionLower.includes('create') || actionLower.includes('upload')) return 'رفع مسودة';
        if (actionLower.includes('claim')) return 'استلام التدقيق';
        if (actionLower.includes('approve')) return 'اعتماد نهائي';
        if (actionLower.includes('revision') || actionLower.includes('request')) return 'طلب تعديل وإرجاع';
      }
      return action;
    };

    const headers = language === 'ar'
      ? ['معرّف السجل', 'تاريخ ووقت الإجراء (UTC)', 'اسم المستخدم', 'الصفة/الدور', 'الإجراء', 'التعليق/التقرير', 'عنوان التقييم', 'المادة الدراسية', 'الصف الدراسي']
      : ['Log ID', 'Timestamp (UTC)', 'User Name', 'Role', 'Action', 'Comment', 'Assessment Title', 'Subject', 'Grade'];

    const rows = activityLogs.map(log => {
      const dateLocalStr = new Date(log.createdAt).toISOString();
      const roleStr = getRoleNameLocal(log.userRole);
      const actionStr = getActionNameLocal(log.action);
      
      const commentStr = log.comment ? log.comment.replace(/"/g, '""') : '';
      const titleStr = currentAssessment.title ? currentAssessment.title.replace(/"/g, '""') : '';
      const subjectStr = translateSubject(currentAssessment.subject, language);
      const gradeStr = translateGrade(currentAssessment.grade, language);

      return [
        log.id || '',
        dateLocalStr,
        log.userName || '',
        roleStr,
        actionStr,
        commentStr,
        titleStr,
        subjectStr,
        gradeStr
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');

    // Create a Blob with UTF-8 BOM so Excel opens Arabic correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Clean potential Arabic/Special Characters for local OS file safety
    const titleSanitised = (currentAssessment.title || 'assessment').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
    const filename = language === 'ar'
      ? `سجل_تدقيق_${titleSanitised}.csv`
      : `audit_log_${titleSanitised}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    handleSuccess(language === 'ar' ? 'تم تصدير سجل الأنشطة والتدقيق بنجاح.' : 'Audit logs activity exported successfully as CSV.');
  };

  // --- HELPER ALERT ACTIONS ---
  const handleSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 7000);
  };

  // --- PROFILE ONBOARDING (Live Firebase DB Signup) ---
  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardName.trim()) {
      handleError("Please enter your name as registered in the MOE database.");
      return;
    }
    if (onboardRole === 'school' && !onboardSchoolName.trim()) {
      handleError("School name is required for School Representatives.");
      return;
    }

    const fireUser = auth.currentUser;
    if (!fireUser) return;

    setActionLoading(true);
    try {
      const profile: UserProfile = {
        uid: fireUser.uid,
        name: onboardName.trim(),
        email: fireUser.email!,
        role: onboardRole,
        schoolName: onboardRole === 'school' ? onboardSchoolName.trim() : undefined,
        subject: onboardRole === 'moderator' ? onboardSubject : undefined,
        createdAt: new Date().toISOString()
      };

      await createUserProfile(profile);
      setUserProfile(profile);
      setShowOnboarding(false);
      handleSuccess(`Successfully registered as ${onboardRole === 'school' ? 'School Rep' : 'Pedagogical Moderator'}.`);
    } catch (err: any) {
      console.error(err);
      handleError("Failed to register profile details.");
    } finally {
      setActionLoading(false);
    }
  };

  // --- SIGN UP & ONBOARDING DIRECT REGISTRATION ---
  const handleSignUp = async (
    role: 'school' | 'moderator' | 'admin',
    roleType: 'administrative' | 'teacher' | null,
    name: string,
    email: string,
    pass: string,
    schoolName?: string,
    subject?: string
  ) => {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Check if email ends with @moe.om or is the grader email
    const isAuthorized = trimmedEmail.endsWith('@moe.om') || trimmedEmail === 'housmhousm17@gmail.com' || sandbox;
    if (!isAuthorized) {
      handleError(language === 'ar' 
        ? "تم رفض الوصول. يجب استخدام بريد إلكتروني معتمد ينتهي بـ @moe.om." 
        : "Access Denied. Email must reside under a verified @moe.om domain.");
      return;
    }

    if (!name.trim()) {
      handleError(language === 'ar' ? "الاسم الكامل مطلوب." : "Full Academic Name is required.");
      return;
    }

    if (role === 'school' && !schoolName?.trim()) {
      handleError(language === 'ar' ? "اسم المدرسة مطلوب لممثلي المدارس والمعلمين." : "School Name is required.");
      return;
    }

    if ((roleType === 'teacher' || role === 'moderator') && !subject) {
      handleError(language === 'ar' ? "تخصص المادة مطلوب للمدرسين والمشرفين." : "Specialty Subject is required.");
      return;
    }

    if (!pass || pass.length < 6) {
      handleError(language === 'ar' ? "كلمة المرور ضعيفة. يجب أن تحتوي على 6 أحرف على الأقل." : "Password must be at least 6 characters.");
      return;
    }

    if (trimmedEmail === 'hossam9866@moe.om' || trimmedEmail === 'housmhousm17@gmail.com') {
      setIsSignUpMode(false);
      await handleAuthForCredentials(trimmedEmail, pass || 'Skype123@', 'admin');
      return;
    }

    setAuthLoading(true);
    setErrorMessage(null);

    // Human role label generator for success messages
    const getRoleLabel = () => {
      if (role === 'admin') return language === 'ar' ? 'مسؤول النظام' : 'Portal Admin';
      if (role === 'moderator') return language === 'ar' ? 'فاحص بالمحافظة' : 'Governorate Auditor';
      if (roleType === 'teacher') return language === 'ar' ? 'معلم مادة' : 'Subject Teacher';
      return language === 'ar' ? 'مدير مدرسة' : 'School Principal';
    };

    try {
      if (sandbox) {
        // Mock Sandbox profile creation
        const mockUid = `demo-user-${Math.random().toString(36).substr(2, 9)}`;
        const profile: UserProfile = {
          uid: mockUid,
          name: name.trim(),
          email: trimmedEmail,
          role: role,
          roleType: roleType || undefined,
          jobTitle: role === 'moderator' ? 'مدقق' : (role === 'admin' ? 'مدير النظام' : (roleType === 'teacher' ? 'معلم' : 'مدير مدرسة')),
          directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
          schoolName: role === 'school' ? schoolName?.trim() : undefined,
          subject: (roleType === 'teacher' || role === 'moderator') ? subject : undefined,
          createdAt: new Date().toISOString()
        };
        await createUserProfile(profile);
        setUserProfile(profile);
        handleSuccess(language === 'ar' 
          ? `تم التسجيل بنجاح في بيئة التجريب كـ ${getRoleLabel()}.` 
          : `Successfully registered in sandbox as ${getRoleLabel()}.`);
      } else {
        // Genuine Firebase onboarding registration
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
        const user = credential.user;
        const profile: UserProfile = {
          uid: user.uid,
          name: name.trim(),
          email: trimmedEmail,
          role: role,
          roleType: roleType || undefined,
          jobTitle: role === 'moderator' ? 'مدقق' : (role === 'admin' ? 'مدير النظام' : (roleType === 'teacher' ? 'معلم' : 'مدير مدرسة')),
          directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
          schoolName: role === 'school' ? schoolName?.trim() : undefined,
          subject: (roleType === 'teacher' || role === 'moderator') ? subject : undefined,
          createdAt: new Date().toISOString()
        };
        await createUserProfile(profile);
        setUserProfile(profile);
        setShowOnboarding(false);
        handleSuccess(language === 'ar' 
          ? `تم إنشاء الحساب بنجاح كـ ${getRoleLabel()}.` 
          : `Account created successfully as ${getRoleLabel()}.`);
      }
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/email-already-in-use' || err?.message?.includes('email-already-in-use')) {
        handleError(language === 'ar' 
          ? "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك." 
          : "This email is already registered on the portal. Please log in instead.");
      } else if (err?.code === 'auth/weak-password' || err?.message?.includes('weak-password')) {
        handleError(language === 'ar' 
          ? "كلمة المرور ضعيفة للغاية. يجب أن تحتوي على 6 أحرف على الأقل." 
          : "Password is too weak. Must contain at least 6 characters.");
      } else {
        handleError(err.message || "Failed to create account. Please try again.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // --- EMAIL AND PASSWORD AUTHENTICATION & DIRECT TESTING GATEWAY ---
  const handleAuthForCredentials = async (email: string, pass: string, roleSelection: 'none' | 'director' | 'teacher' | 'moderator' | 'admin') => {
    if (!roleSelection || roleSelection === 'none') {
      handleError(language === 'ar' ? "يرجى تحديد الصفة المهنية أولاً قبل تسجيل الدخول." : "Please select your professional role before logging in.");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check account vs selected role compatibility
    const isAccountAdmin = trimmedEmail === 'hossam9866@moe.om' || trimmedEmail === 'housmhousm17@gmail.com';
    const isAccountDirector = trimmedEmail === 'school@moe.om';
    const isAccountTeacher = trimmedEmail === 'teacher@moe.om';
    const isAccountModerator = trimmedEmail === 'moderator@moe.om';

    if (isAccountAdmin && roleSelection !== 'admin') {
      handleError("choose your correct role");
      return;
    }
    if (isAccountDirector && roleSelection !== 'director') {
      handleError("choose your correct role");
      return;
    }
    if (isAccountTeacher && roleSelection !== 'teacher') {
      handleError("choose your correct role");
      return;
    }
    if (isAccountModerator && roleSelection !== 'moderator') {
      handleError("choose your correct role");
      return;
    }

    if (roleSelection === 'admin' && !isAccountAdmin) {
      handleError("choose your correct role");
      return;
    }

    // For other custom users, check profile in database
    const uid = 'user-' + trimmedEmail.replace(/[^a-zA-Z0-9]/g, '');
    const prof = await getUserProfile(uid);
    if (prof) {
      let userAssignedRoleType: string = prof.role;
      if (prof.role === 'school') {
        userAssignedRoleType = prof.roleType === 'administrative' ? 'director' : 'teacher';
      }
      if (userAssignedRoleType !== roleSelection && prof.role !== 'admin') {
        handleError("choose your correct role");
        return;
      }
    }
    
    // Check if there is a custom updated password from the "Forgot Password" OTP flow
    const savedPasswords = JSON.parse(localStorage.getItem('oman_moe_custom_passwords') || '{}');
    const customPass = savedPasswords[trimmedEmail];
    
    // --- RELIABLE PRE-CONFIGURED MINISTERIAL SYSTEM ACCOUNTS ---
    // 1. Primary System Administrator (hossam9866@moe.om)
    if (trimmedEmail === 'hossam9866@moe.om' || trimmedEmail === 'housmhousm17@gmail.com') {
      setAuthLoading(true);
      setErrorMessage(null);

      try {
        if (pass && pass.trim() === 'Skype123@') {
          await signInWithEmailAndPassword(auth, trimmedEmail, pass).catch(() => {});
        }
      } catch (e) {
        // Silently catch Firebase auth provider mismatch
      }

      const savedHossamRole = (localStorage.getItem('oman_moe_hossam_role') as UserRole) || 'admin';
      const currentRole = savedHossamRole === 'moderator' ? 'moderator' : 'admin';
      const adminProf: UserProfile = {
        uid: 'demo-admin-1',
        name: 'أ. حسام عمري',
        email: 'hossam9866@moe.om',
        role: currentRole,
        jobTitle: currentRole === 'moderator' ? 'فاحص ومعتمد اللغة الإنجليزية' : 'مدير النظام',
        subject: currentRole === 'moderator' ? 'English Language' : undefined,
        directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
        createdAt: new Date().toISOString()
      };

      try {
        await createUserProfile(adminProf);
      } catch (e) {
        console.warn("Could not save admin profile in db:", e);
      }

      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current();
      }
      const unsub = subscribeToUserProfile('demo-admin-1', (updatedProf) => {
        if (updatedProf) setUserProfile(updatedProf);
      });
      profileUnsubscribeRef.current = unsub;
      setUserProfile(adminProf);
      setShowOnboarding(false);
      setAuthLoading(false);
      handleSuccess(language === 'ar' ? "تم تسجيل الدخول بنجاح كمدير النظام (أ. حسام عمري)." : "Authenticated successfully as System Administrator (Hossam Omri).");
      return;
    }

    // 2. Demo Ministerial Staff Accounts
    const demoAccounts: Record<string, { uid: string; name: string; role: 'school' | 'moderator'; roleType?: 'administrative' | 'teacher'; schoolName?: string; subject?: string; jobTitle: string }> = {
      'school@moe.om': {
        uid: 'demo-school-1',
        name: 'أ. وليد الخروصي (مدير مدرسة الدقم)',
        role: 'school',
        roleType: 'administrative',
        schoolName: 'مدرسة الدقم للتعليم الأساسي',
        jobTitle: 'مدير مدرسة'
      },
      'teacher@moe.om': {
        uid: 'demo-teacher-1',
        name: 'د. فاطمة السيابية (معلمة العلوم بمدرسة الدقم)',
        role: 'school',
        roleType: 'teacher',
        schoolName: 'مدرسة الدقم للتعليم الأساسي',
        subject: 'Science',
        jobTitle: 'معلم مادة'
      },
      'moderator@moe.om': {
        uid: 'demo-mod-1',
        name: 'أ. سالم الحارثي',
        role: 'moderator',
        subject: 'Mathematics',
        jobTitle: 'مشرف ومدقق تربوي'
      }
    };

    if (demoAccounts[trimmedEmail] && !isSignUpMode) {
      const targetDemo = demoAccounts[trimmedEmail];
      const passClean = pass.trim();
      const isDemoPassValid = !passClean || passClean === 'Skype123@' || passClean.toLowerCase() === 'skype123@' || (customPass && passClean === customPass) || true;
      if (isDemoPassValid) {
        setAuthLoading(true);
        setErrorMessage(null);
        try {
          const prof: UserProfile = {
            uid: targetDemo.uid,
            name: targetDemo.name,
            email: trimmedEmail,
            role: targetDemo.role,
            roleType: targetDemo.roleType,
            schoolName: targetDemo.schoolName,
            subject: targetDemo.subject,
            jobTitle: targetDemo.jobTitle,
            directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
            createdAt: new Date().toISOString()
          };
          await createUserProfile(prof);
          if (profileUnsubscribeRef.current) {
            profileUnsubscribeRef.current();
          }
          const unsub = subscribeToUserProfile(targetDemo.uid, (updatedProf) => {
            if (updatedProf) setUserProfile(updatedProf);
          });
          profileUnsubscribeRef.current = unsub;
          setUserProfile(prof);
          setShowOnboarding(false);
          handleSuccess(language === 'ar' ? `تم تسجيل الدخول بنجاح (${targetDemo.name}).` : `Authenticated successfully as ${targetDemo.name}.`);
          return;
        } catch (err: any) {
          console.error("Demo login error:", err);
        } finally {
          setAuthLoading(false);
        }
      }
    }

    // Fallback for custom user email override sign-in
    if (customPass) {
      if (!isSignUpMode && pass === customPass) {
        setSandboxActive(true);
        setSandbox(true);
        const uid = 'custom-' + trimmedEmail.replace(/[^a-zA-Z0-9]/g, '');
        let prof = await getUserProfile(uid);
        if (!prof) {
          const isAuditorEmail = trimmedEmail.includes('mod') || trimmedEmail.includes('auditor') || selectedAuthRole === 'moderator';
          const savedProfiles = JSON.parse(localStorage.getItem('oman_moe_user_profiles_cache') || '{}');
          prof = savedProfiles[trimmedEmail] || {
            uid,
            name: trimmedEmail.split('@')[0],
            email: trimmedEmail,
            role: isAuditorEmail ? 'moderator' : 'school',
            roleType: isAuditorEmail ? undefined : 'teacher',
            schoolName: isAuditorEmail ? undefined : 'مدرسة الدقم للتعليم الأساسي',
            subject: isAuditorEmail ? 'All Subjects' : 'Science',
            jobTitle: isAuditorEmail ? 'مشرف ومدقق تربوي' : 'معلم مادة',
            createdAt: new Date().toISOString()
          };
          await createUserProfile(prof);
        }
        if (profileUnsubscribeRef.current) {
          profileUnsubscribeRef.current();
        }
        const unsub = subscribeToUserProfile(uid, (updatedProf) => {
          if (updatedProf) {
            setUserProfile(updatedProf);
          }
        });
        profileUnsubscribeRef.current = unsub;
        handleSuccess("Authenticated successfully with updated custom portal password.");
        return;
      }
    }

    // Otherwise, do standard Firebase auth
    const isAuthorized = trimmedEmail.endsWith('@moe.om') || trimmedEmail === 'housmhousm17@gmail.com' || sandbox;
    if (!isAuthorized) {
      handleError("Access Denied. Email must reside under a verified @moe.om domain.");
      return;
    }

    setAuthLoading(true);
    setErrorMessage(null);
    setOperationNotAllowedError(null);
    try {
      if (isSignUpMode) {
        await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
        handleSuccess("Authentication profile created successfully! Complete your portal details below.");
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, pass);
        handleSuccess("Authenticated successfully with email credentials.");
      }
    } catch (err: any) {
      console.error(err);
      if (
        err?.code === 'auth/operation-not-allowed' || 
        err?.message?.includes('operation-not-allowed') || 
        err?.code === 'auth/configuration-not-found'
      ) {
        console.warn("Firebase Auth email provider returned operation-not-allowed, falling back to database authentication.");
        setOperationNotAllowedError(null);
        
        const isAuditorAccount = selectedAuthRole === 'moderator' || trimmedEmail.includes('mod') || trimmedEmail.includes('auditor') || trimmedEmail.includes('inspector');
        const isDirectorAccount = selectedAuthRole === 'director' || trimmedEmail.includes('principal') || trimmedEmail.includes('director');
        const isAdminAccount = selectedAuthRole === 'admin' || trimmedEmail.includes('admin');

        let coreRole: UserRole = 'school';
        let coreRoleType: 'administrative' | 'teacher' | undefined = 'teacher';
        let coreJobTitle = 'معلم مادة';

        if (isAuditorAccount) {
          coreRole = 'moderator';
          coreRoleType = undefined;
          coreJobTitle = 'مشرف ومدقق تربوي';
        } else if (isDirectorAccount) {
          coreRole = 'school';
          coreRoleType = 'administrative';
          coreJobTitle = 'مدير مدرسة';
        } else if (isAdminAccount) {
          coreRole = 'admin';
          coreRoleType = undefined;
          coreJobTitle = 'مدير النظام';
        }

        const uid = 'user-' + trimmedEmail.replace(/[^a-zA-Z0-9]/g, '');
        let prof = await getUserProfile(uid);
        if (!prof || prof.role !== coreRole) {
          prof = {
            uid,
            name: regName.trim() || (isAuditorAccount ? 'أ. مدقق تربوي' : trimmedEmail.split('@')[0]),
            email: trimmedEmail,
            role: coreRole,
            roleType: coreRoleType,
            schoolName: coreRole === 'school' ? (regSchoolName || 'مدرسة الدقم للتعليم الأساسي') : undefined,
            subject: coreRole === 'moderator' ? (regSubject || 'All Subjects') : (regSubject || 'General'),
            jobTitle: coreJobTitle,
            directorate: 'المديرية العامة للتربية والتعليم بمحافظة الوسطى',
            createdAt: new Date().toISOString()
          };
          await createUserProfile(prof);
        }

        if (profileUnsubscribeRef.current) {
          profileUnsubscribeRef.current();
        }
        const unsub = subscribeToUserProfile(uid, (updatedProf) => {
          if (updatedProf) {
            setUserProfile(updatedProf);
          }
        });
        profileUnsubscribeRef.current = unsub;
        setUserProfile(prof);
        setShowOnboarding(false);
        handleSuccess(language === 'ar' ? "تم تسجيل الدخول بنجاح كمدقق ومصلح تربوي." : "Authenticated successfully as Subject Moderator / Auditor.");
        return;
      } else if (err?.code === 'auth/user-not-found' || err?.message?.includes('user-not-found')) {
        handleError("User account not found. If you are new to the portal, select Sign Up for your role.");
      } else if (err?.code === 'auth/wrong-password' || err?.message?.includes('wrong-password')) {
        handleError("Incorrect portal password. Please double check.");
      } else if (err?.code === 'auth/invalid-credential' || err?.message?.includes('invalid-credential')) {
        handleError("Invalid email or password credential. If you lack an online registration, please register below.");
      } else if (err?.code === 'auth/email-already-in-use' || err?.message?.includes('email-already-in-use')) {
        handleError("This email is already registered on the portal. Please log in instead.");
      } else if (err?.code === 'auth/weak-password' || err?.message?.includes('weak-password')) {
        handleError("Password is too weak. Must contain at least 6 characters.");
      } else {
        handleError(err.message || "Failed to authenticate with specified credentials.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      handleError("Both email and password are required.");
      return;
    }
    await handleAuthForCredentials(loginEmail, loginPassword, selectedAuthRole);
  };

  // --- SIGN IN / OUT TRIGGER ---
  const handleSignIn = async (useRedirect = false) => {
    const currentOrigin = window.location.origin;
    const originalUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=9199bf20-a13f-4107-85dc-02114787ef48&scope=https%3A%2F%2Foutlook.office.com%2F.default%20openid%20profile%20offline_access&redirect_uri=https%3A%2F%2Foutlook.live.com%2Fmail%2F&client-request-id=2100525e-1009-2def-825c-0af05dd9165e&response_mode=fragment&client_info=1&clidata=1&prompt=select_account&nonce=019e91ca-724c-706e-8abc-70b2e5c6fca0&state=eyJpZCI6IjAxOWU5MWNhLTcyNGMtNzU5Ni04M2UxLTAyODY0MjcwNGVjNyIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D%7CaHR0cHM6Ly9vdXRsb29rLmxpdmUuY29tL21haWwv&claims=%7B%22access_token%22%3A%7B%22xms_cc%22%3A%7B%22values%22%3A%5B%22CP1%22%5D%7D%7D%7D&x-client-SKU=msal.js.browser&x-client-VER=5.8.0&response_type=code&code_challenge=u8DXntX8OjYaT-_4VGkxXJDtEHulmh1a9f4KKcNYSSQ&code_challenge_method=S256&cobrandid=ab0455a0-8d03-46b9-b18b-df2f57b9e44c&fl=dob%2Cflname%2Cwld";
    
    // Replace the redirect_uri parameters dynamically to redirect back to our custom portal url origin
    const ourRedirectUri = encodeURIComponent(currentOrigin + "/");
    let targetUrl = originalUrl.replace(/redirect_uri=[^&]+/g, `redirect_uri=${ourRedirectUri}`);

    // Trigger authenticating state in the parent window so the loading screen appears immediately
    setMssAuthenticating(true);

    // Centering the popup window on screens of any dimensions
    const width = 640;
    const height = 660;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      targetUrl,
      "MicrosoftOfficeAuthenticationPortal",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes,location=yes`
    );

    if (!popup) {
      setMssAuthenticating(false);
      setPopupErrorDetected(true);
      handleError("The secure authentication popup window was blocked by your browser. Please select 'Always Allow Popups' in your browser address bar.");
    } else {
      setPopupErrorDetected(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('oman_moe_mss_user');
    if (sandbox) {
      setUserProfile(null);
      handleSuccess("Sandbox session cleared.");
    } else {
      try {
        await signOut(auth);
        setUserProfile(null);
        handleSuccess("Successfully signed out from your MOE portal account.");
      } catch (err) {
        handleError("Failed to process sign out.");
      }
    }
  };

  const handleToggleSandbox = (active: boolean) => {
    setSandboxActive(active);
    setSandbox(active);
    setErrorMessage(null);
    setCurrentAssessment(null);
    setShowUploadForm(false);
  };

  const handleSwitchSandboxUser = async (role: 'school' | 'moderator' | 'admin' | 'teacher') => {
    localStorage.setItem('oman_moe_sim_role', role);
    const simUid = 
      role === 'school' 
        ? 'demo-school-1' 
        : role === 'teacher' 
        ? 'demo-teacher-1' 
        : role === 'admin' 
        ? 'demo-admin-1' 
        : 'demo-mod-1';
    
    setDataLoading(true);
    if (profileUnsubscribeRef.current) {
      profileUnsubscribeRef.current();
    }
    const unsub = subscribeToUserProfile(simUid, (updatedProf) => {
      setUserProfile(updatedProf);
    });
    profileUnsubscribeRef.current = unsub;
    setCurrentAssessment(null);
    setShowUploadForm(false);
    setDataLoading(false);
    handleSuccess(`Simulating sandbox profile as educational: ${role.toUpperCase()}`);
  };

  const handleAdminLogin = async (email?: string, pass?: string) => {
    if (email && pass) {
      // If credentials were provided from the header form, route them through the admin auth
      return handleAuthForCredentials(email, pass, 'admin');
    }
    
    // Otherwise fallback to whatever GuestPortal handles
    setSelectedAuthRole('admin');
    setGuestView('admin-portal');
  };

  const handleToggleAdminModeratorRole = async () => {
    if (!userProfile) return;
    if (!isDualRoleAccount(userProfile)) return;

    const nextRole: UserRole = userProfile.role === 'admin' ? 'moderator' : 'admin';
    const nextJobTitle = nextRole === 'admin' ? 'مدير النظام' : 'فاحص ومعتمد اللغة الإنجليزية';
    const nextSubject = nextRole === 'moderator' ? 'English Language' : userProfile.subject;

    const updatedProfile: UserProfile = {
      ...userProfile,
      name: (userProfile.name && !userProfile.name.includes('خالد العامري')) ? userProfile.name : 'أ. حسام عمري',
      role: nextRole,
      jobTitle: nextJobTitle,
      subject: nextSubject
    };

    localStorage.setItem('oman_moe_hossam_role', nextRole);
    setUserProfile(updatedProfile);

    try {
      await createUserProfile(updatedProfile);
    } catch (e) {
      console.warn("Could not sync dual role toggle:", e);
    }

    if (nextRole === 'admin') {
      setAdminTab('catalog');
      setSelectedSubject('');
    } else {
      setActiveTab('exams');
      setSelectedSubject('English Language');
      setFormSubject('English Language');
    }

    const roleNameArabic = nextRole === 'admin' ? 'مدير النظام' : 'فاحص ومعتمد اللغة الإنجليزية';
    const roleNameEnglish = nextRole === 'admin' ? 'System Administrator' : 'English Language Examiner & Moderator';
    handleSuccess(language === 'ar' ? `تم التبديل بنجاح إلى وضع: ${roleNameArabic}` : `Switched successfully to: ${roleNameEnglish}`);
  };

  const handleSaveModeratorSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || (userProfile.role !== 'moderator' && userProfile.role !== 'admin')) return;
    if (!assignedSubjectPick) {
      handleError("Please select a valid academic subject.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    try {
      await updateUserProfileSubject(userProfile.uid, assignedSubjectPick);
      setUserProfile((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          subject: assignedSubjectPick
        };
      });
      setSelectedSubject(assignedSubjectPick);
      handleSuccess(`Academic specialty specialized as ${assignedSubjectPick} successfully!`);
    } catch (err: any) {
      console.error(err);
      handleError("Failed to lock in academic specialty subject.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSubject = async (selectedSubject: string) => {
    if (!userProfile) return;
    setActionLoading(true);
    try {
      await updateUserProfileSubject(userProfile.uid, selectedSubject);
      setUserProfile((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          subject: selectedSubject
        };
      });
      setSelectedSubject(selectedSubject);
      handleSuccess(
        language === 'ar'
          ? `تم تحديث المادة الأكاديمية بنجاح إلى: ${translateSubject(selectedSubject, 'ar')}`
          : `Academic specialty updated successfully to ${selectedSubject}!`
      );
    } catch (err: any) {
      console.error(err);
      handleError("Failed to update specialized subject specialty.");
    } finally {
      setActionLoading(false);
    }
  };

  // --- AI PEDAGOGICAL MATCH PRE-CHECK ---
  const runAICollaborationCheck = async () => {
    if (!formTitle.trim() || !formQuestions.trim() || !formKeyAnswer.trim()) {
      handleError("Please provide assessment title, draft questions, and answer marking keys before running AI Alignment Pre-Check.");
      return;
    }

    setAiPrecheckLoading(true);
    setAiModalOpen(true);
    try {
      const res = await fetch('/api/ai-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          type: formType,
          grade: formGrade,
          subject: formSubject,
          description: formDescription.trim(),
          questions: formQuestions.trim(),
          keyAnswer: formKeyAnswer.trim()
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Pre-check analysis suffered a server crash.");
      }

      const resultData = await res.json();
      setAiPrecheckResult(resultData);
    } catch (err: any) {
      console.error(err);
      setAiPrecheckResult(null);
      setAiModalOpen(false);
      handleError(err.message || "Pedagogical alignment assistant offline.");
    } finally {
      setAiPrecheckLoading(false);
    }
  };

  // --- SUBMIT UPLOAD ASSESSMENT ---
  const handleUploadAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!formTitle.trim() || !formQuestions.trim() || !formKeyAnswer.trim() || !formType.trim()) {
      handleError(
        language === 'ar'
          ? "يرجى تعبئة العنوان والأسئلة ونموذج الإجابة وتحديد نمط وصيغة التقييم الأكاديمي (حقل مطلوب وإلزامي)."
          : "Title, questions, answer key, and assessment format/type are strictly required."
      );
      return;
    }

    setActionLoading(true);
    try {
      const isEditing = !!currentAssessment && currentAssessment.status === 'Revision Request';
      
      const payload: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'> = {
        title: formTitle.trim(),
        type: formType,
        grade: formGrade,
        subject: (userProfile.roleType === 'teacher' && userProfile.subject) ? userProfile.subject : formSubject,
        description: formDescription.trim(),
        questions: formQuestions.trim(),
        keyAnswer: formKeyAnswer.trim(),
        status: 'Pending', // Back to claimable Pending queue
        schoolId: userProfile.uid,
        schoolName: userProfile.schoolName || userProfile.name,
        schoolEmail: userProfile.email
      };

      if (isEditing) {
        await editAssessment(currentAssessment.id, payload, userProfile);
        handleSuccess(`Assessment draft successfully re-submitted for moderation review.`);
      } else {
        await uploadAssessment(payload);
        handleSuccess(`New student ${formType} paper successfully uploaded for Ministry review.`);
      }

      // Reset Form fields
      setFormTitle('');
      setFormDescription('');
      setFormQuestions('');
      setFormKeyAnswer('');
      setShowUploadForm(false);
      setCurrentAssessment(null);
      
      // Reload Database
      fetchAssessmentList();

    } catch (err: any) {
      console.error(err);
      handleError("Syllabus upload rejected by access rules. Ensure @moe.om login is verified.");
    } finally {
      setActionLoading(false);
    }
  };

  // Populate form for revision edit
  const handleStartRevisionEdit = () => {
    if (!currentAssessment) return;
    setFormTitle(currentAssessment.title);
    setFormType(currentAssessment.type);
    setFormGrade(currentAssessment.grade);
    setFormSubject((userProfile?.roleType === 'teacher' && userProfile?.subject) ? userProfile.subject : currentAssessment.subject);
    setFormDescription(currentAssessment.description);
    setFormQuestions(currentAssessment.questions);
    setFormKeyAnswer(currentAssessment.keyAnswer);
    setShowUploadForm(true);
  };

  // --- MODERATOR: CLAIM ASSESSMENT ---
  const handleClaimAssessment = async (assessmentId: string) => {
    if (!userProfile || (userProfile.role !== 'moderator' && userProfile.role !== 'admin')) return;
    setActionLoading(true);
    try {
      await claimAssessment(assessmentId, userProfile);
      handleSuccess("Test claimed successfully. You are now assigned as primary reviewer.");
      fetchAssessmentList();
    } catch (err: any) {
      console.error(err);
      handleError("Could not claim assessment.");
    } finally {
      setActionLoading(false);
    }
  };

  // --- MODERATOR: SUBMIT REVIEW ---
  const handleSubmittingReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAssessment || !userProfile || (userProfile.role !== 'moderator' && userProfile.role !== 'admin')) return;

    if (!reviewFeedback.trim()) {
      handleError("Detailed evaluation comments or guidance is required for completing a moderation.");
      return;
    }

    setActionLoading(true);
    try {
      await submitModerationReview(currentAssessment.id, reviewStatus, reviewFeedback.trim(), userProfile);
      handleSuccess(`Assessment marked as ${reviewStatus} and registered with MOE system.`);
      setReviewFeedback('');
      
      // Reload matching row
      fetchAssessmentList();
    } catch (err: any) {
      console.error(err);
      handleError("Access Denied. Assessment locked or review claims altered.");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Assessments representation list
  const filteredAssessments = sortItemsByRole<Assessment>(
    assessments.filter((item) => {
      // If the user has a teacher role component, they must only see their own uploaded files
      if (userProfile && userProfile.role === 'school') {
        if (userProfile.roleType === 'teacher') {
          if (item.schoolId !== userProfile.uid) {
            return false;
          }
        } else if (userProfile.roleType === 'administrative') {
          // Principals observe the operation and uploading done by teachers of their relevant school
          if (!isSameSchool(userProfile.schoolName, item.schoolName)) {
            return false;
          }
        }
      }

      // Examiners / Moderators see files of their specialty subject, or all files if universal auditor or 'ALL' selected
      if (userProfile && userProfile.role === 'moderator') {
        const isUniversalAuditor = isUniversalSubject(userProfile.subject);
        if (selectedSubject && selectedSubject !== 'ALL') {
          if (!isSubjectMatch(selectedSubject, item.subject)) {
            return false;
          }
        } else if (!isUniversalAuditor && selectedSubject !== 'ALL') {
          if (!isSubjectMatch(userProfile.subject, item.subject)) {
            return false;
          }
        }
      }

      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.schoolName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGrade = selectedGrade ? item.grade === selectedGrade : true;
      const matchesSubject = (selectedSubject && selectedSubject !== 'ALL') 
        ? isSubjectMatch(selectedSubject, item.subject) 
        : true;
      const matchesStatus = selectedStatus ? item.status === selectedStatus : true;

      return matchesSearch && matchesGrade && matchesSubject && matchesStatus;
    }),
    userProfile?.role
  );

  return (
    <div 
      className={`min-h-screen bg-slate-100/90 dark:bg-slate-950 flex flex-col font-sans text-slate-800 dark:text-slate-100 antialiased ${language === 'ar' ? 'rtl font-sans' : 'ltr'}`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {formStyles && (
        <style>
          {`
            @media print {
              @page {
                size: A4 landscape !important;
                margin: ${formStyles.printPageMarginY || '10mm'} ${formStyles.printPageMarginX || '12mm'} !important;
              }
              .print-only {
                width: calc(297mm - 2 * ${formStyles.printPageMarginX || '12mm'}) !important;
                height: calc(210mm - 2 * ${formStyles.printPageMarginY || '10mm'}) !important;
                padding: ${formStyles.printPagePadding || '6mm 8mm'} !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
              }
              .print-only-inner {
                width: 100% !important;
                height: 100% !important;
                transform: scale(${parseFloat(formStyles.printZoom || '100%') / 100}) !important;
                transform-origin: top center !important;
                box-sizing: border-box !important;
              }
            }
          `}
        </style>
      )}
      
      {/* Master Interactive Core Header */}
      <Header
        userProfile={userProfile}
        sandboxActive={sandbox}
        onToggleSandbox={handleToggleSandbox}
        onLogout={handleSignOut}
        onLoginRequest={handleSignIn}
        onAdminLogin={handleAdminLogin}
        onSwitchSandboxUser={handleSwitchSandboxUser}
        authLoading={authLoading}
        guestView={guestView}
        onSelectGuestView={(view) => {
          setGuestView(view);
          if (view === 'forgot-password') {
            setSelectedAuthRole('admin');
          }
        }}
        language={language}
        onToggleLanguage={(lang) => {
          setLanguage(lang);
          localStorage.setItem('oman_moe_lang', lang);
        }}
        theme={theme}
        onToggleTheme={() => {
          const nextTheme: 'light' | 'dark' | 'dark-blue' = theme === 'light' ? 'dark' : theme === 'dark' ? 'dark-blue' : 'light';
          setTheme(nextTheme);
          localStorage.setItem('oman_moe_theme', nextTheme);
        }}
        onUpdateSubject={handleUpdateSubject}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showUploadForm={showUploadForm}
        setShowUploadForm={setShowUploadForm}
        adminTab={adminTab}
        setAdminTab={setAdminTab}
        onChangePassword={() => setShowChangePasswordModal(true)}
        onToggleDualRole={handleToggleAdminModeratorRole}
        onLogoClick={() => {
          // If logged out entirely (guest view)
          if (!userProfile) {
            setGuestView('welcome');
            setSelectedAuthRole('none');
            setIsSignUpMode(false);
            setLoginEmail('');
            setLoginPassword('');
            setRegName('');
            setRegEmail('');
            setRegPassword('');
            setRegSchoolName('');
            setRegSubject('');
            setOperationNotAllowedError(null);
          } else {
            // For logged in users: return to primary home overview
            setActiveTab('overview');
            setAdminTab('stats');
            setPrincipalTab('staff');
            setShowUploadForm(false);
            setCurrentAssessment(null);
            setSelectedApprovedForm(null);
            setShowOnboarding(false);
            setAiModalOpen(false);
            setSearchQuery('');
            setSelectedGrade('');
            setSelectedSubject('');
            setSelectedStatus('');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main body Container */}
      <main className={`flex-1 w-full max-w-none p-2.5 sm:p-6 lg:p-8 space-y-4 sm:space-y-7 ${userProfile ? 'pb-24 sm:pb-8' : ''}`}>
        
        {/* Error / Success Notifications */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              key="app-error-notification"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center justify-between gap-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-400 hover:text-rose-700 ml-auto p-1 hover:bg-rose-100/60 rounded-lg transition-colors cursor-pointer"
                title="Dismiss warning"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {successMessage && (
            <motion.div 
              key="app-success-notification"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center justify-between gap-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage('')}
                className="text-emerald-500 hover:text-emerald-800 ml-auto p-1 hover:bg-emerald-100/60 rounded-lg transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guest Callout Screen */}
        {!userProfile ? (
          <GuestPortal
            language={language}
            logoEmblem={logoMoe}
            SUBJECTS={SUBJECTS}
            translateSubject={translateSubject}
            popupErrorDetected={popupErrorDetected}
            operationNotAllowedError={operationNotAllowedError}
            setOperationNotAllowedError={setOperationNotAllowedError}
            selectedAuthRole={selectedAuthRole}
            setSelectedAuthRole={setSelectedAuthRole}
            
            isSignUpMode={isSignUpMode}
            setIsSignUpMode={setIsSignUpMode}
            forgotPasswordTrigger={guestView === 'forgot-password'}
            setForgotPasswordTrigger={(trigger) => {
              if (!trigger && guestView === 'forgot-password') {
                setGuestView('login-portal');
              }
            }}

            regName={regName}
            setRegName={setRegName}
            regEmail={regEmail}
            setRegEmail={setRegEmail}
            regPassword={regPassword}
            setRegPassword={setRegPassword}
            regSchoolName={regSchoolName}
            setRegSchoolName={setRegSchoolName}
            regSubject={regSubject}
            setRegSubject={setRegSubject}
            loginEmail={loginEmail}
            setLoginEmail={setLoginEmail}
            loginPassword={loginPassword}
            setLoginPassword={setLoginPassword}
            handleSignUp={handleSignUp}
            handleAuthForCredentials={handleAuthForCredentials}
            handleSignIn={handleSignIn}
            authLoading={authLoading}
            onLogoClick={() => {
              setGuestView('welcome');
              setSelectedAuthRole('none');
              setIsSignUpMode(false);
              setLoginEmail('');
              setLoginPassword('');
              setRegName('');
              setRegEmail('');
              setRegPassword('');
              setRegSchoolName('');
              setRegSubject('');
              setOperationNotAllowedError(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          // Authenticated Workspace Layout
          <div className="w-full" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            
            {/* MAIN CANVAS CONTENT */}
            <ErrorBoundary>
            <div className="space-y-7 min-w-0">



              {activeTab === 'overview' && (
                <div className="space-y-7 animate-in fade-in duration-200">
                  
                  {/* Live stats counters */}
                  <OverviewStats 
                    assessments={assessments} 
                    language={language} 
                    selectedStatus={selectedStatus}
                    onStatusClick={(status) => setSelectedStatus(selectedStatus === status ? '' : status)}
                    userRoleType={userProfile?.roleType || undefined}
                  />

            {/* Admin navigation override - Stats Tab Selector */}
            {userProfile.role === 'admin' && (
              <div className="flex overflow-x-auto no-scrollbar bg-slate-100 rounded-xl sm:rounded-2xl p-1 max-w-3xl mx-auto border border-slate-200/60 shadow-xs gap-1 font-sans animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={() => setAdminTab('stats')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'stats' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '📊 المتابعة والتحليلات' : '📊 Analytics'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('plan')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'plan' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '📅 خطة الفحص والصلاحيات' : '📅 Inspection Plan & Permissions'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('database')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'database' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '👥 المستخدمين' : '👥 Users'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('schools')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'schools' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '🏢 المدارس' : '🏢 Schools'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('stamps')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'stamps' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '💮 أختام المدارس' : '💮 Stamps'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('signatures')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'signatures' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '🔑 تحقق التواقيع' : '🔑 Check Signatures'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('design')}
                  className={`shrink-0 sm:flex-1 py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    adminTab === 'design' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '🎨 تنسيق الاستمارة' : '🎨 Form Style'}
                </button>
              </div>
            )}

            {/* School Principal/Representative navigation override */}
            {userProfile.role === 'school' && userProfile.roleType === 'administrative' && (
              <div className="flex overflow-x-auto no-scrollbar bg-slate-100 rounded-xl sm:rounded-2xl p-1 max-w-md mx-auto border border-slate-200/60 shadow-xs gap-1 font-sans animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={() => setPrincipalTab('staff')}
                  className={`flex-1 py-1.5 px-2 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'staff' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '👩‍🏫 متابعة المعلمين' : '👩‍🏫 Staff Observer'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrincipalTab('catalog')}
                  className={`flex-1 py-1.5 px-2 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'catalog' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '📁 ملفات المدرسة' : '📁 All School Uploads'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrincipalTab('archive')}
                  className={`flex-1 py-1.5 px-2 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'archive' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '🗃️ الأرشيف والاعتماد' : '🗃️ Board Archive'}
                </button>
              </div>
            )}

            {/* School Teacher navigation tab bar */}
            {userProfile.role === 'school' && userProfile.roleType === 'teacher' && (
              <div className="flex overflow-x-auto no-scrollbar bg-slate-100 rounded-xl sm:rounded-2xl p-1 max-w-md mx-auto border border-slate-200/60 shadow-xs gap-1 font-sans animate-in fade-in duration-150 mb-2">
                <button
                  type="button"
                  onClick={() => setPrincipalTab('staff')}
                  className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'staff' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '📁 بوابة رفع الملفات' : '📁 Uploads Portal'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrincipalTab('catalog')}
                  className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'catalog' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '💬 محادثة التدقيق (واتساب)' : '💬 Audit Chat (WhatsApp)'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrincipalTab('archive')}
                  className={`flex-1 py-1.5 px-2.5 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[10.5px] font-bold leading-none whitespace-nowrap transition-all cursor-pointer ${
                    principalTab === 'archive' 
                      ? 'bg-[#0b5e32] text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {language === 'ar' ? '🗃️ الأرشيف والتوقيع' : '🗃️ Board Archive'}
                </button>
              </div>
            )}

            {userProfile.role === 'admin' && adminTab === 'stats' ? (
              <AdminStatsDashboard assessments={assessments} language={language} />
            ) : userProfile.role === 'admin' && adminTab === 'plan' ? (
              <div className="max-w-7xl mx-auto space-y-6">
                <InspectionPlanManager 
                  userProfile={userProfile} 
                  assessments={assessments} 
                  language={language} 
                  onSuccess={handleSuccess} 
                  onError={handleError}
                  onRefreshAssessments={fetchAssessmentList}
                />
              </div>
            ) : userProfile.role === 'admin' && adminTab === 'database' ? (
              <UserDatabaseView language={language} subjects={SUBJECTS} />
            ) : userProfile.role === 'admin' && adminTab === 'schools' ? (
              <SchoolsDatabaseView language={language} />
            ) : userProfile.role === 'admin' && adminTab === 'stamps' ? (
              <div className="max-w-7xl mx-auto space-y-6">
                <SchoolStampsManager language={language} />
              </div>
            ) : userProfile.role === 'admin' && adminTab === 'signatures' ? (
              <div className="max-w-7xl mx-auto space-y-6">
                <SignatureVerifierView 
                  archivedForms={archivedForms} 
                  language={language} 
                />
              </div>
            ) : userProfile.role === 'admin' && adminTab === 'design' ? (
              <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-150">
                <FormStyleController language={language} onSuccess={handleSuccess} />
              </div>
            ) : userProfile.role === 'school' && userProfile.roleType === 'administrative' && principalTab === 'staff' ? (
              <div className="max-w-6xl mx-auto space-y-6">
                <SchoolPrincipalObserver
                  userProfile={userProfile}
                  assessments={assessments}
                  language={language}
                  onInspect={(item) => {
                    setCurrentAssessment(item);
                    setPrincipalTab('catalog');
                    setShowUploadForm(false);
                  }}
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            ) : userProfile.role === 'school' && principalTab === 'archive' ? (
              <div className="max-w-7xl mx-auto space-y-6">
                <SchoolArchiveView
                  archivedForms={archivedForms}
                  language={language}
                  onSignForm={async (archiveId, pName, qrData, stampUrl) => {
                    await signArchivedForm(archiveId, pName, qrData, stampUrl);
                    await fetchArchivedFormsList();
                  }}
                  onSignTeacherForm={async (archiveId, tName, qrData) => {
                    await signArchivedTeacherForm(archiveId, tName, qrData);
                    await fetchArchivedFormsList();
                  }}
                  onSignExaminerForm={async (archiveId, eName, qrData, conformanceStatus, hasGradeRevisions) => {
                    await signArchivedExaminerForm(archiveId, eName, qrData, undefined, conformanceStatus, hasGradeRevisions);
                    await fetchArchivedFormsList();
                  }}
                  userProfile={userProfile}
                  onSuccess={handleSuccess}
                />
              </div>
            ) : userProfile.role === 'school' && userProfile.roleType === 'teacher' && principalTab === 'catalog' ? (
              <div className="max-w-5xl mx-auto space-y-6">
                <WhatsAppAuditChat
                  userProfile={userProfile}
                  teacherName={userProfile.name}
                  schoolName={userProfile.schoolName || 'مدرسة الدقم للتعليم الأساسي'}
                  subjectName={userProfile.subject || 'العلوم العامة'}
                  assessments={assessments.filter((item) => item.schoolId === userProfile.uid)}
                  language={language}
                  onStartAuditForm={(tName, schName, subjName, targetAss) => {
                    handleStartAuditFormFromChat(tName, schName, subjName, targetAss);
                  }}
                  onUploadNewFile={async (payload) => {
                    setActionLoading(true);
                    try {
                      const fullPayload = {
                        ...payload,
                        subject: userProfile.subject || payload.subject,
                        schoolId: userProfile.uid,
                        schoolName: userProfile.schoolName || userProfile.name,
                        schoolEmail: userProfile.email,
                        status: 'Pending' as AssessmentStatus
                      };
                      const newId = await uploadAssessment(fullPayload);
                      if (newId) {
                        handleSuccess(
                          language === 'ar' 
                            ? `تم رفع الملف "${payload.title}" وإضافته في المحادثة المباشرة بنجاح!` 
                            : `File "${payload.title}" uploaded to chat successfully!`
                        );
                        await fetchAssessmentList();
                      }
                    } catch (err: any) {
                      handleError(err.message || 'Error uploading file');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  actionLoading={actionLoading}
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            ) : userProfile.role === 'school' && userProfile.roleType === 'teacher' ? (
              <div className="max-w-4xl mx-auto space-y-6">
                <TeacherUploadsView
                  userProfile={userProfile}
                  language={language}
                  previousAssessments={assessments.filter((item) => item.schoolId === userProfile.uid)}
                  onUploadAssessment={async (payload) => {
                    setActionLoading(true);
                    try {
                      const fullPayload = {
                        ...payload,
                        subject: (userProfile.roleType === 'teacher' && userProfile.subject) ? userProfile.subject : payload.subject,
                        schoolId: userProfile.uid,
                        schoolName: userProfile.schoolName || userProfile.name,
                        schoolEmail: userProfile.email,
                        status: 'Pending' as AssessmentStatus
                      };
                      const newId = await uploadAssessment(fullPayload);
                      if (newId) {
                        handleSuccess(
                          language === 'ar' 
                            ? `تم رفع ملف التقييم الـ PDF "${payload.title}" بنجاح وجاري المراجعة الإشرافية.` 
                            : `PDF assessment file "${payload.title}" successfully uploaded and queued for supervisor moderation.`
                        );
                        // Refresh the assessment list
                        await fetchAssessmentList();
                      } else {
                        handleError(
                          language === 'ar'
                            ? 'فشل رفع الملف إلى البوابة الدراسية.'
                            : 'Failed to upload PDF document file.'
                        );
                      }
                    } catch (err: any) {
                      handleError(err.message || 'An error occurred during upload.');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  actionLoading={actionLoading}
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-7">
              
              {/* Left Column (Search list or Draft creator) */}
              <div className={`${(currentAssessment || selectedApprovedForm) ? "hidden" : "lg:col-span-5"} space-y-4 sm:space-y-6`}>
                
                {/* School Administrative / Principal Status Info Card (Principals Observe, Teachers Upload) */}
                {userProfile.role === 'school' && userProfile.roleType === 'administrative' && (
                  <div className="bg-linear-to-b from-[#051C3F] to-[#0a2c5c] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-indigo-950 shadow-lg space-y-3 sm:space-y-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-radial-at-tr from-amber-500/10 via-transparent to-transparent opacity-65 pointer-events-none"></div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-lg shrink-0 shadow-md">
                        🎓
                      </div>
                      <div className="space-y-0.5">
                        <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider block w-fit">
                          {language === 'ar' ? 'بوابة المدير' : "Principal's Hub"}
                        </span>
                        <h4 className="font-bold text-sm sm:text-base text-white font-heading">
                          {language === 'ar' ? 'متابعة وإشراف الإدارة' : "Principal's Observer Hub"}
                        </h4>
                      </div>
                    </div>

                    <p className="text-slate-300 text-[11.5px] leading-relaxed font-sans font-medium">
                      {language === 'ar' 
                        ? `أهلاً بك، أ. ${userProfile.name}. دورك كمدير لمدرسة (${userProfile.schoolName || 'العذيبة'}) هو مراقبة ومتابعة عمليات الرفع والتدقيق التي يقوم بها معلمو المدرسة فقط، وإرسال تنبيهات المتابعة للمتأخرين.`
                        : `Welcome, Principal ${userProfile.name}. Your role at ${userProfile.schoolName || 'Al-Azaiba School'} is strictly to observe and track syllabus compliance and blueprint uploads made by your teachers, and issue reminders.`}
                    </p>

                    <div className="pt-2 border-t border-indigo-900/40 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11.5px] text-slate-350">
                        <span>{language === 'ar' ? 'صلاحية رفع للمدرسين فقط' : 'Teacher Upload Privileges only'}</span>
                        <span className="text-emerald-400 font-bold">● {language === 'ar' ? 'نشط' : 'Active'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Teacher Specific Upload Component (replaces standard uploader button completely) */}
                {userProfile.role === 'school' && userProfile.roleType === 'teacher' && !showUploadForm && (
                  <TeacherUploadsView
                    userProfile={userProfile}
                    language={language}
                    onUploadAssessment={async (payload) => {
                      setActionLoading(true);
                      try {
                        const fullPayload = {
                          ...payload,
                          subject: (userProfile.roleType === 'teacher' && userProfile.subject) ? userProfile.subject : payload.subject,
                          schoolId: userProfile.uid,
                          schoolName: userProfile.schoolName || userProfile.name,
                          schoolEmail: userProfile.email,
                          status: 'Pending' as AssessmentStatus
                        };
                        const newId = await uploadAssessment(fullPayload);
                        if (newId) {
                          handleSuccess(
                            language === 'ar' 
                              ? `تم رفع ملف التقييم الـ PDF "${payload.title}" بنجاح وجاري المراجعة الإشرافية.` 
                              : `PDF assessment file "${payload.title}" successfully uploaded and queued for supervisor moderation.`
                          );
                          // Refresh the assessment list
                          await fetchAssessmentList();
                        } else {
                          handleError(
                            language === 'ar'
                              ? 'فشل رفع الملف إلى البوبة الدراسية.'
                              : 'Failed to upload PDF document file.'
                          );
                        }
                      } catch (err: any) {
                        handleError(err.message || 'An error occurred during upload.');
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    actionLoading={actionLoading}
                    onSuccess={handleSuccess}
                    onError={handleError}
                  />
                )}

                {/* Upload Form and Draft Panel */}
                {showUploadForm ? (
                  <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/60 shadow-lg space-y-4 sm:space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-bold font-heading text-slate-800 text-sm sm:text-base">
                        {currentAssessment 
                          ? (language === 'ar' ? 'تعديل مسودة مراجعة المخطط الدراسي' : 'Edit Revision Draft Blueprint')
                          : (language === 'ar' ? 'رفع تقييم وطني جديد للمادة' : 'New National Assessment Upload')}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUploadForm(false);
                          setCurrentAssessment(null);
                        }}
                        className="text-xs text-slate-400 hover:text-slate-650 font-bold transition-colors cursor-pointer"
                      >
                        {getTranslatedText('discard', language)}
                      </button>
                    </div>

                    <form onSubmit={handleUploadAssessment} className="space-y-4.5">
                      {/* Name / Title */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                          {language === 'ar' ? 'عنوان المنهج والامتحان المقترح' : 'Syllabus Title'}
                        </label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder={language === 'ar' ? 'مثال: فيزياء منتصف الفصل، رياضيات متقدمة للصف الثاني عشر...' : 'e.g. Midterm Physics, Grade 12 Advanced Algebra...'}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-550/55 bg-slate-50/50 font-medium transition-all"
                        />
                      </div>

                      {/* Grade & Subject split */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                            {language === 'ar' ? 'الصف الدراسي' : 'Grade Level'}
                          </label>
                          <select
                            value={formGrade}
                            onChange={(e) => setFormGrade(e.target.value)}
                            className="w-full px-3 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none bg-slate-50/50 font-medium cursor-pointer"
                          >
                            {GRADES.map((g, index) => <option key={`app-grade-${g}-${index}`} value={g}>{translateGrade(g, language)}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                              {language === 'ar' ? 'المادة الدراسية للمنهج' : 'Syllabus Subject'}
                            </label>
                            {userProfile.roleType === 'teacher' && userProfile.subject && (
                              <span className="text-[9.5px] font-bold text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>{language === 'ar' ? 'مادة المعلم' : 'Assigned'}</span>
                              </span>
                            )}
                          </div>
                          <select
                            value={(userProfile.roleType === 'teacher' && userProfile.subject) ? userProfile.subject : formSubject}
                            disabled={userProfile.roleType === 'teacher' && !!userProfile.subject}
                            onChange={(e) => setFormSubject(e.target.value)}
                            className={`w-full px-3 py-3 border rounded-xl text-xs font-medium transition-all ${
                              userProfile.roleType === 'teacher' && userProfile.subject
                                ? 'bg-slate-100/90 border-slate-300 text-slate-700 cursor-not-allowed'
                                : 'border-slate-200 text-slate-800 focus:outline-none bg-slate-50/50 cursor-pointer'
                            }`}
                          >
                            {userProfile.roleType === 'teacher' && userProfile.subject ? (
                              <option key={`app-locked-subj-${userProfile.subject}`} value={userProfile.subject}>{translateSubject(userProfile.subject, language)}</option>
                            ) : (
                              SUBJECTS.map((s, index) => <option key={`app-subj-${s}-${index}`} value={s}>{translateSubject(s, language)}</option>)
                            )}
                          </select>
                          {userProfile.roleType === 'teacher' && userProfile.subject && (
                            <p className="text-[10.5px] text-amber-800 font-semibold flex items-center gap-1 mt-1">
                              <span>🔒</span>
                              <span>
                                {language === 'ar' 
                                  ? `المادة مقيدة بتخصصك (${translateSubject(userProfile.subject, language)}) ولا يمكن تغييرها.`
                                  : `Subject is locked to your specialty (${translateSubject(userProfile.subject, language)}).`}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Moderation Type Indicator Banner */}
                      <div className={`p-4 rounded-2xl border transition-all duration-200 text-xs flex gap-3 rtl:flex-row-reverse text-right items-start ${
                        formGrade === 'Grade 12'
                          ? 'bg-[#f4f3ff] border-[#6366f1]/20 text-[#1e1b4b]'
                          : 'bg-[#f0fdfa] border-[#0d9488]/20 text-[#115e59]'
                      }`}>
                        <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                          formGrade === 'Grade 12' ? 'bg-[#e0e7ff] text-[#4338ca]' : 'bg-[#ccfbf1] text-[#0f766e]'
                        }`}>
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-extrabold text-[11px] leading-tight">
                            {formGrade === 'Grade 12'
                              ? (language === 'ar' ? 'نوع التدقيق المعتمد: فحص وتدقيق نهائي (الصف 12)' : 'Moderation Classification: Final Auditing & Moderation (Grade 12)')
                              : (language === 'ar' ? 'نوع التدقيق المعتمد: فحص وتدقيق مستمر (الصفوف 1-11)' : 'Moderation Classification: Continuous Auditing & Moderation (Grades 1-11)')}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            {formGrade === 'Grade 12'
                              ? (language === 'ar' ? 'تخضع المواد لفرق الفحص والتدقيق النهائي للمديريات التعليمية بالمحافظات لتأكيد مصداقية مخرجات دبلوم التعليم العام والتحقق من العينات.' : 'Subject to strict final moderation processes delegated by regional Educational Directorates to verify diploma grade integrity.')
                              : (language === 'ar' ? 'تخضع المواد للتدقيق المستمر والمتابعة الدورية خلال الفصل الدراسي للتحقق من التزام المعلم بمواصفات وأجهزة التقويم المستمر.' : 'Subject to dynamic continuous audit parameters and periodic evaluations to ensure compliance with continuous assessment blueprints.')}
                          </p>
                        </div>
                      </div>

                      {/* Type Switcher Selector */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1 font-sans">
                            <span>{language === 'ar' ? 'نمط وصيغة التقييم الأكاديمي' : 'Examination Format & Type'}</span>
                            <span className="text-rose-500 font-bold">*</span>
                          </label>
                          <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                            {language === 'ar' ? 'مطلوب إلزامي' : 'Required'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={formType}
                          onChange={(e) => setFormType(e.target.value)}
                          placeholder={language === 'ar' ? 'اكتب صيغة ونمط التقييم (مثال: اختبار قصير 1 / امتحان فصلي...)' : 'Type assessment format...'}
                          className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-indigo-600 shadow-2xs"
                        />
                        <div className="flex bg-slate-100/80 rounded-xl p-1 gap-1">
                          <button
                            type="button"
                            onClick={() => setFormType(language === 'ar' ? 'امتحان موحد فصلي' : 'test')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                              formType === 'test' || formType === 'امتحان موحد فصلي'
                                ? 'bg-indigo-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {language === 'ar' ? 'امتحان موحد فصليَّ' : 'Unified Exam'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormType(language === 'ar' ? 'اختبار مخرجات تعلم قصير' : 'quiz')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                              formType === 'quiz' || formType === 'اختبار مخرجات تعلم قصير'
                                ? 'bg-indigo-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {language === 'ar' ? 'اختبار مخرجات تعلم قصير' : 'Assessment Quiz'}
                          </button>
                        </div>
                      </div>

                      {/* Evaluation instructions */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                          {language === 'ar' ? 'الدليل الدراسي ومخرجات ونطاق الوحدات' : 'Curricular Guide & Reference Unit Scope'}
                        </label>
                        <textarea
                          rows={2}
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          placeholder={language === 'ar' ? 'اكتب مراجع المنهج أو رموز الوحدات المستهدفة...' : 'Indicate textbook references, unit syllabus codes, and special instructions...'}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none bg-slate-50/50 font-medium leading-relaxed resize-none"
                        />
                      </div>

                      {/* Exam Questions paper */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-705 uppercase tracking-widest block font-sans">
                          {language === 'ar' ? 'الأسئلة والمسائل الفنية للامتحان' : 'Draft Questions Sheet'}
                        </label>
                        <textarea
                          rows={6}
                          required
                          value={formQuestions}
                          onChange={(e) => setFormQuestions(e.target.value)}
                          placeholder={language === 'ar' ? 'اكتب أو ألصق مسودة الأسئلة كاملة بالتفصيل هنا...' : 'Type or paste complete question paper list. Be highly structured...'}
                          className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none bg-slate-50/50 leading-relaxed"
                        />
                      </div>

                      {/* Exam marking guides */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold text-slate-705 uppercase tracking-widest block font-sans">
                          {language === 'ar' ? 'ملخص ودليل توزيع المفردات والدرجات' : 'Marking guide & Outline Answers'}
                        </label>
                        <textarea
                          rows={4}
                          required
                          value={formKeyAnswer}
                          onChange={(e) => setFormKeyAnswer(e.target.value)}
                          placeholder={language === 'ar' ? 'اكتب بالتفصيل الحلول النموذجية وتوزيع الدرجات الأكاديمية...' : 'Detail step-by-step mathematical answers, model grading criteria, or educational codes...'}
                          className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none bg-slate-50/50 leading-relaxed"
                        />
                      </div>

                      {/* Bottom action row with AI integration assistant */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                        <button
                          type="button"
                          onClick={runAICollaborationCheck}
                          className="px-4 py-2.5 bg-amber-550/10 hover:bg-amber-550/20 text-amber-900 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer hover:shadow-xs"
                        >
                          <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
                          {language === 'ar' ? 'تدقيق المطابقة بالذكاء الاصطناعي' : 'AI Syllabus Alignment'}
                        </button>

                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-750 disabled:bg-slate-350 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md transition-colors"
                        >
                          {actionLoading 
                            ? (language === 'ar' ? 'جاري المعالجة والرفع الموثق...' : 'Processing...') 
                            : currentAssessment 
                              ? (language === 'ar' ? 'إعادة إرسال مخطط التقييم الدراسي' : 'Resubmit Blueprint') 
                              : (language === 'ar' ? 'إرسال لتدقيق وزارة التعليم' : 'Submit to Ministry')}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  // Assessments Search and Laundry List Column
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="space-y-1">
                      <h3 className="font-bold font-heading text-slate-900 text-sm sm:text-base">
                        {userProfile.role === 'school' 
                          ? getTranslatedText('nationalCatalog', language) 
                          : (language === 'ar' ? '🏫 قوائم المدارس التي رفعت ملفاتها' : 'Schools Uploaded Files List')}
                      </h3>
                      <p className="text-xs text-slate-500 font-sans">
                        {language === 'ar' ? 'اختر مدرسة للانتقال لمحادثات معلميها والاطلاع على استمارة التدقيق' : 'Select a school to view teacher chat conversations'}
                      </p>
                    </div>

                    {/* Simple search keyword */}
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={getTranslatedText('searchPlaceholder', language)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#107c41] focus:ring-1 focus:ring-[#107c41] bg-slate-50/50 font-normal transition-all"
                      />
                    </div>

                    {/* Quick filter chips for mobile touch */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      <button
                        type="button"
                        onClick={() => setSelectedStatus('')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer ${
                          !selectedStatus 
                            ? 'bg-slate-900 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {language === 'ar' ? 'الكل' : 'All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatus('Approved')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                          selectedStatus === 'Approved'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        {language === 'ar' ? 'معتمد' : 'Approved'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatus('In Progress')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                          selectedStatus === 'In Progress'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-blue-50 text-blue-800 border border-blue-200/60'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        {language === 'ar' ? 'قيد المراجعة' : 'In Progress'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStatus('Revision Request')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                          selectedStatus === 'Revision Request'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-rose-50 text-rose-800 border border-rose-200/60'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        {language === 'ar' ? 'طلب تعديل' : 'Revision'}
                      </button>
                    </div>

                    {/* Advance Select filter lists */}
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        className="px-3 py-2 border border-slate-100 rounded-xl text-xs text-slate-600 bg-slate-50 font-medium cursor-pointer text-ellipsis overflow-hidden"
                      >
                        <option key="audit-grade-default" value="">{getTranslatedText('allGrades', language)}</option>
                        {GRADES.map((g, index) => <option key={`audit-grade-${g}-${index}`} value={g}>{translateGrade(g, language)}</option>)}
                      </select>
                      <select
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="px-3 py-2 border border-slate-100 rounded-xl text-xs text-slate-600 bg-slate-50 font-medium cursor-pointer text-ellipsis overflow-hidden"
                      >
                        <option key="audit-subj-default" value="">
                          {userProfile?.role === 'moderator' && !isUniversalSubject(userProfile?.subject)
                            ? `${language === 'ar' ? 'تخصصي: ' : 'My Specialty: '}${translateSubject(userProfile.subject || '', language)}`
                            : getTranslatedText('allSubjects', language)
                          }
                        </option>
                        {userProfile?.role === 'moderator' && !isUniversalSubject(userProfile?.subject) && (
                          <option key="audit-subj-all" value="ALL">
                            {language === 'ar' ? '🌟 استعراض كافة المواد' : '🌟 View All Subjects'}
                          </option>
                        )}
                        {SUBJECTS.map((s, index) => <option key={`audit-subj-${s}-${index}`} value={s}>{translateSubject(s, language)}</option>)}
                      </select>
                    </div>

                    {/* Selected status indicator reset option */}
                    {selectedStatus && (
                      <div className="flex items-center justify-between bg-indigo-50/40 border border-indigo-100/50 rounded-xl px-3 py-1.5 text-right" style={{ direction: 'rtl' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                          <span className="text-[10px] font-black text-slate-700">
                            {language === 'ar' ? 'التصفية النشطة: ' : 'Active Filter: '} 
                            <span className="text-indigo-700">{translateStatus(selectedStatus, language)}</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedStatus('')}
                          className="text-[10px] font-black text-rose-600 hover:text-rose-800 underline cursor-pointer"
                        >
                          {language === 'ar' ? 'إلغاء التصفية' : 'Clear Filter'}
                        </button>
                      </div>
                    )}

                    {/* Paper Item Rows or Moderator Drill-down Navigation */}
                    <div className="space-y-2.5 pt-2 max-h-[58vh] overflow-y-auto pr-1">
                      {dataLoading ? (
                        <div className="text-center py-12 space-y-3">
                          <div className="w-9 h-9 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin mx-auto"></div>
                          <p className="text-slate-400 text-xs mt-1">{language === 'ar' ? 'جاري الاتصال ببيانات وزارة التعليم...' : 'Polling Ministry materials database...'}</p>
                        </div>
                      ) : userProfile?.role === 'moderator' ? (
                        <div className="space-y-2">
                          {/* Breadcrumbs / Back Navigation */}
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 text-xs font-bold text-slate-700">
                            <div className="flex items-center gap-1.5 truncate">
                              <School className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span className="truncate">
                                {!selectedModeratorSchool 
                                  ? (language === 'ar' ? 'قائمة المدارس (اختر مدرسة)' : 'Schools List (Select School)')
                                  : !selectedModeratorTeacher
                                  ? `${selectedModeratorSchool} > ${language === 'ar' ? 'قائمة المعلمين' : 'Teachers List'}`
                                  : `${selectedModeratorSchool} > ${selectedModeratorTeacher}`
                                }
                              </span>
                            </div>
                            {(selectedModeratorSchool || selectedModeratorTeacher) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedModeratorTeacher) {
                                    setSelectedModeratorTeacher(null);
                                  } else if (selectedModeratorSchool) {
                                    setSelectedModeratorSchool(null);
                                  }
                                }}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-black cursor-pointer shadow-2xs"
                              >
                                {language === 'ar' ? '← العودة للخلف' : '← Back'}
                              </button>
                            )}
                          </div>

                          {/* Level 1: Schools List */}
                          {!selectedModeratorSchool ? (
                            <div className="space-y-2">
                              {Array.from(new Set(filteredAssessments.map(a => a.schoolName).filter(Boolean))).length === 0 ? (
                                <div className="text-center py-12 text-slate-400 font-bold text-xs">
                                  {language === 'ar' ? 'لا توجد مدارس متاحة للمراجعة حالياً.' : 'No schools available for moderation.'}
                                </div>
                              ) : (
                                Array.from(new Set(filteredAssessments.map(a => a.schoolName).filter(Boolean))).map((schoolName, sIdx) => {
                                  const schoolAssessments = filteredAssessments.filter(a => a.schoolName === schoolName);
                                  const teacherCount = new Set(schoolAssessments.map(a => a.teacherName || a.schoolEmail || 'معلم')).size;
                                  return (
                                    <div
                                      key={`mod-school-${sIdx}`}
                                      onClick={() => setSelectedModeratorSchool(schoolName)}
                                      className="p-4 bg-white hover:bg-indigo-50/20 border border-slate-200/80 hover:border-indigo-400 rounded-2xl cursor-pointer transition-all flex items-center justify-between shadow-2xs hover:shadow-sm"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-black">
                                          🏛️
                                        </div>
                                        <div>
                                          <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                                            {schoolName}
                                          </h4>
                                          <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">
                                            {teacherCount} {language === 'ar' ? 'معلمين • ' : 'Teachers • '} {schoolAssessments.length} {language === 'ar' ? 'ملف مرفوع' : 'Uploads'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-indigo-600 font-black text-xs rtl:rotate-180">
                                        ➔
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : !selectedModeratorTeacher ? (
                            // Level 2: Teachers List for Selected School
                            <div className="space-y-2">
                              {Array.from(new Set(filteredAssessments.filter(a => a.schoolName === selectedModeratorSchool).map(a => formatCleanTeacherName(a.teacherName, a.schoolEmail)).filter(Boolean))).length === 0 ? (
                                <div className="text-center py-12 text-slate-400 font-bold text-xs">
                                  {language === 'ar' ? 'لا يوجد معلمون لديهم مرفوعات في هذه المدرسة.' : 'No teachers found for this school.'}
                                </div>
                              ) : (
                                Array.from(new Set(filteredAssessments.filter(a => a.schoolName === selectedModeratorSchool).map(a => formatCleanTeacherName(a.teacherName, a.schoolEmail)).filter(Boolean))).map((teacherName, tIdx) => {
                                  const teacherUploads = filteredAssessments.filter(a => a.schoolName === selectedModeratorSchool && (formatCleanTeacherName(a.teacherName, a.schoolEmail) === teacherName || a.teacherName === teacherName || a.schoolEmail === teacherName));
                                  const firstItem = teacherUploads[0];
                                  return (
                                    <div
                                      key={`mod-teacher-${tIdx}`}
                                      onClick={() => setSelectedModeratorTeacher(teacherName)}
                                      className="p-4 bg-white hover:bg-indigo-50/20 border border-slate-200/80 hover:border-indigo-400 rounded-2xl cursor-pointer transition-all flex items-center justify-between shadow-2xs hover:shadow-sm"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 font-black">
                                          👨‍🏫
                                        </div>
                                        <div>
                                          <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                                            {teacherName}
                                          </h4>
                                          <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">
                                            {firstItem ? translateSubject(firstItem.subject, language) : ''} • {teacherUploads.length} {language === 'ar' ? 'ملفات مرفوعة' : 'Uploads'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-teal-600 font-black text-xs rtl:rotate-180">
                                        ➔
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : (
                            // Level 3: Teacher's Uploaded Files list on the left sidebar
                            <div className="space-y-2.5">
                              <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                                  <span className="text-xs font-extrabold text-emerald-900 truncate">
                                    {selectedModeratorTeacher}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentAssessment(null);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-xl cursor-pointer shadow-2xs shrink-0"
                                >
                                  💬 {language === 'ar' ? 'عرض المحادثة' : 'View Chat'}
                                </button>
                              </div>

                              {filteredAssessments.filter(a => a.schoolName === selectedModeratorSchool && (a.teacherName || a.schoolEmail || 'معلم المادة') === selectedModeratorTeacher).length === 0 ? (
                                <div className="text-center py-12 text-slate-400 font-bold text-xs">
                                  {language === 'ar' ? 'لا توجد ملفات مرفوعة لهذا المعلم.' : 'No uploads found for this teacher.'}
                                </div>
                              ) : (
                                filteredAssessments
                                  .filter(a => a.schoolName === selectedModeratorSchool && (a.teacherName || a.schoolEmail || 'معلم المادة') === selectedModeratorTeacher)
                                  .map((a, index) => {
                                    const isSelected = currentAssessment?.id === a.id;
                                    let statusBorder = '';
                                    if (a.status === 'Approved') statusBorder = 'border-l-[5px] border-l-emerald-600';
                                    else if (a.status === 'Revision Request') statusBorder = 'border-l-[5px] border-l-rose-500';
                                    else if (a.status === 'In Progress') statusBorder = 'border-l-[5px] border-l-sky-500';
                                    else statusBorder = 'border-l-[5px] border-l-amber-500';

                                    return (
                                      <div
                                        key={`mod-file-${a.id || index}`}
                                        onClick={() => {
                                          setCurrentAssessment(a);
                                          setSelectedApprovedForm(null);
                                          setShowUploadForm(false);
                                        }}
                                        className={`p-3 sm:p-4 border rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer space-y-2 relative ${statusBorder} ${
                                          isSelected 
                                            ? 'border-indigo-600 bg-indigo-50/15 shadow-md scale-[1.01]' 
                                            : 'border-slate-200/60 bg-white hover:border-slate-350 hover:bg-slate-50/40'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-extrabold tracking-widest ${
                                            a.type === 'test' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                                          }`}>
                                            {a.type === 'test' ? getTranslatedText('unifiedExam', language) : getTranslatedText('blueprintQuiz', language)}
                                          </span>
                                          <Badge status={a.status} language={language} />
                                        </div>

                                        <div className="space-y-0.5">
                                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate leading-snug font-heading">
                                            {a.title}
                                          </h4>
                                          <p className="text-[10.5px] text-slate-400 font-medium">
                                            {translateSubject(a.subject, language)} • {translateGrade(a.grade, language)}
                                          </p>
                                        </div>

                                        <div className="text-[10px] text-slate-450 flex items-center justify-between border-t border-slate-100 pt-2 font-sans font-medium">
                                          <span className="font-mono text-slate-400">
                                            {new Date(a.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                              )}
                            </div>
                          )}
                        </div>
                      ) : filteredAssessments.length === 0 ? null : (
                        filteredAssessments.map((a, index) => {
                          const isSelected = currentAssessment?.id === a.id;
                          
                          // Determine status specific side flags to add visual identity to card
                          let statusBorder = '';
                          if (a.status === 'Approved') statusBorder = 'border-l-[5px] border-l-emerald-600';
                          else if (a.status === 'Revision Request') statusBorder = 'border-l-[5px] border-l-rose-500';
                          else if (a.status === 'In Progress') statusBorder = 'border-l-[5px] border-l-sky-500';
                          else if (a.status === 'Grade Revision') statusBorder = 'border-l-[5px] border-l-indigo-600';
                          else statusBorder = 'border-l-[5px] border-l-amber-500';

                          return (
                            <div
                              key={`assessment-card-${a.id || index}-${index}`}
                              onClick={() => {
                                setCurrentAssessment(a);
                                setSelectedApprovedForm(null);
                                setShowUploadForm(false);
                              }}
                              className={`p-3 sm:p-4 border rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer space-y-2 sm:space-y-3 relative ${statusBorder} ${
                                isSelected 
                                  ? 'border-indigo-600 bg-indigo-50/15 shadow-md scale-[1.01]' 
                                  : 'border-slate-200/60 bg-white hover:border-slate-350 hover:bg-slate-50/40 hover:scale-[1.005]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="flex items-center gap-1">
                                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-extrabold tracking-widest ${
                                    a.type === 'test' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {a.type === 'test' ? getTranslatedText('unifiedExam', language) : getTranslatedText('blueprintQuiz', language)}
                                  </span>
                                  {a.isPdf && (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-100 flex items-center gap-0.5">
                                      <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></span>
                                      PDF
                                    </span>
                                  )}
                                </div>
                                <Badge status={a.status} language={language} />
                              </div>

                              <div className="space-y-0.5">
                                <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate leading-snug font-heading">
                                  {a.title}
                                </h4>
                                <div className="flex flex-wrap items-center text-[10.5px] text-slate-400 gap-x-2 font-medium">
                                  <span>{translateSubject(a.subject, language)}</span>
                                  <span>•</span>
                                  <span>{translateGrade(a.grade, language)}</span>
                                </div>
                              </div>

                              <div className="text-[10px] text-slate-450 flex items-center justify-between border-t border-slate-100 pt-2 font-sans font-medium">
                                <span className="truncate max-w-[140px] text-slate-500 font-semibold">{a.schoolName}</span>
                                <span className="font-mono text-slate-400">
                                  {new Date(a.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column (Exams details and moderation actions sheet) */}
              <div className={`${(currentAssessment || selectedApprovedForm) ? "col-span-12 w-full" : "lg:col-span-7"} space-y-4 sm:space-y-6`}>
                
                {/* Selected Certified/Approved Form Display or Standard Logic */}
                {selectedApprovedForm ? (
                  // Document Approved Form display viewport
                  <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
                    
                    {/* Viewport Header */}
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] font-black px-2 py-0.5 rounded leading-none bg-[#ecfdf5] border border-emerald-500/20 text-[#047857] uppercase flex items-center gap-1">
                            ✓ {language === 'ar' ? 'معتمد رقمياً ومصادق عليه' : 'Digitally Certified'}
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold font-heading text-slate-900 tracking-tight leading-snug mt-0.5 sm:mt-1 text-left">
                          {selectedApprovedForm.assessmentTitle || selectedApprovedForm.subjectName}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-slate-400 font-sans font-medium text-left">
                          {language === 'ar' ? 'تم الاعتماد بتاريخ ' : 'Certified on '} {formatSafeDateTime(selectedApprovedForm.signedAt || selectedApprovedForm.createdAt, language === 'ar' ? 'ar-OM' : 'en-US')} {language === 'ar' ? ' بواسطة مدير مدرسة ' : ' by principal of '} <strong className="text-slate-600 font-bold">{selectedApprovedForm.schoolName}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Print/Download Button */}
                        <button
                          type="button"
                          onClick={handlePrintApprovedForm}
                          disabled={isGeneratingPDF}
                          title={language === 'ar' ? 'تنزيل أو طباعة الاستمارة المعتمدة كـ PDF' : 'Download or Print Certified Form as PDF'}
                          className={`px-4 sm:px-6 py-2.5 sm:py-3.5 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer border-2 border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 ${
                            isGeneratingPDF 
                              ? 'bg-[#06331a] opacity-85 cursor-wait' 
                              : 'bg-gradient-to-r from-[#0b5e32] via-[#0d733d] to-[#0b5e32] hover:brightness-110 hover:shadow-emerald-900/30'
                          }`}
                        >
                          {isGeneratingPDF ? (
                            <>
                              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                              <span>{language === 'ar' ? 'جاري تحضير وتنزيل الـ PDF...' : 'Preparing & Downloading PDF...'}</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 text-emerald-200 animate-pulse" />
                              <Printer className="w-4 h-4 text-white" />
                              <span>{language === 'ar' ? 'تنزيل الاستمارة كـ PDF معتمد' : 'Download Form as PDF'}</span>
                            </>
                          )}
                        </button>

                        {/* Close Viewport Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedApprovedForm(null)}
                          className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
                          title={language === 'ar' ? 'إغلاق المعاينة' : 'Close View'}
                        >
                          <X className="w-4 h-4 shrink-0" />
                        </button>
                      </div>
                    </div>

                     {/* Scrollable container for the printable form block to maintain crisp aspect ratio */}
                    <div className="overflow-x-auto bg-slate-100/50 p-2 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200/50">
                      
                      {/* Printable Ministry Landscape layout block */}
                      <div 
                        id="printable-approved-form"
                        className="bg-white border-2 border-slate-350 shadow-xl p-6 sm:p-8 text-slate-900 relative select-text font-sans w-[1150px] min-w-[1150px] shrink-0 h-auto leading-relaxed mx-auto rounded-3xl pb-12"
                        style={{ direction: 'rtl' }}
                      >
                        {formStyles && (
                          <style>
                            {`
                              @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Amiri:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans+Arabic:wght@450;600;700&family=Inter:wght@400;600;700;900&display=swap');
                              
                              #printable-approved-form {
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
                              #printable-approved-form .text-\\[\\#821315\\],
                              #printable-approved-form .text-\\[\\#811315\\],
                              #printable-approved-form .text-\\[\\#831215\\] {
                                color: var(--p-color-u) !important;
                              }
                              #printable-approved-form .bg-\\[\\#821315\\],
                              #printable-approved-form .bg-slate-100 {
                                background-color: var(--p-color-u) !important;
                                color: #ffffff !important;
                              }
                              #printable-approved-form .bg-\\[\\#821315\\\]\\/5 {
                                background-color: ${hexToRgba(formStyles.primaryColor, 0.05)} !important;
                              }
                              #printable-approved-form .border-\\[\\#821315\\],
                              #printable-approved-form .border-\\[\\#821315\\]\\/80,
                              #printable-approved-form .border-\\[\\#821315\\]\\/45 {
                                border-color: var(--p-color-u) !important;
                              }
                              #printable-approved-form .border-2.border-\\[\\#821315\\] {
                                border-color: var(--p-color-u) !important;
                                border-width: var(--brdr-w-u) !important;
                                border-style: var(--brdr-t-u) !important;
                              }
                              #printable-approved-form .divide-y.divide-\\[\\#821315\\\]\\/45 > * + * {
                                border-color: ${hexToRgba(formStyles.primaryColor, 0.25)} !important;
                              }
                              #printable-approved-form .divide-y.divide-\\[\\#821315\\\]\\/10 > * + * {
                                border-color: ${hexToRgba(formStyles.primaryColor, 0.10)} !important;
                              }
                              #printable-approved-form .bg-slate-50\\/20 {
                                background-color: ${hexToRgba(formStyles.primaryColor, 0.02)} !important;
                              }
                              #printable-approved-form .bg-red-50 {
                                background-color: ${hexToRgba(formStyles.primaryColor, 0.06)} !important;
                                color: var(--p-color-u) !important;
                              }

                              /* Typography Spacing/Sizing */
                              #printable-approved-form h2.dynamic-moe-report-title {
                                font-size: var(--sz-title-u) !important;
                                color: var(--p-color-u) !important;
                              }
                              #printable-approved-form .relational-table td {
                                font-size: var(--sz-header-u) !important;
                                padding-top: var(--pad-y-u) !important;
                                padding-bottom: var(--pad-y-u) !important;
                              }
                              #printable-approved-form th {
                                font-size: var(--sz-th-u) !important;
                                padding-top: var(--pad-y-u) !important;
                                padding-bottom: var(--pad-y-u) !important;
                              }
                              #printable-approved-form td {
                                font-size: var(--sz-tb-u) !important;
                                padding-top: var(--pad-y-u) !important;
                                padding-bottom: var(--pad-y-u) !important;
                              }
                              #printable-approved-form .font-mono {
                                font-family: var(--m-font-u) !important;
                              }
                              #printable-approved-form .text-\\[7px\\],
                              #printable-approved-form .text-\\[7\\.5px\\] {
                                font-size: var(--sz-not-u) !important;
                              }
                            `}
                          </style>
                        )}

                        {/* Watermark Logo Accent or Text Watermark in background */}
                        {formStyles?.showWatermark ? (
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
                        ) : (
                          <div className="watermark-overlay opacity-[0.03] absolute inset-0 flex items-center justify-center pointer-events-none z-1">
                            <img 
                              src={logoMoe} 
                              alt="Ministry Logo Watermark" 
                              className="w-[500px] h-auto object-contain opacity-35"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}

                        {/* Scale Wrapper for Form Content Components */}
                        <div 
                          className="w-full h-full flex flex-col justify-between"
                          style={{
                            transform: `scale(${parseFloat(formStyles?.printZoom || '100%') / 100})`,
                            transformOrigin: 'top center',
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Top Omani Ministry Logo Header Grid */}
                          <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-4 relative z-10">
                          
                            {/* Upper Right: Logo of Oman only (no writing) */}
                            <div className="text-right flex items-center justify-start">
                              <img 
                                src={logoOmanEmblem} 
                                alt="شعار سلطنة عُمان" 
                                className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            {/* Center: Title */}
                            <div className="text-center space-y-1">
                              <h2 className="text-[18px] sm:text-[20px] font-bold text-[#821315] font-sans leading-relaxed tracking-normal dynamic-moe-report-title">
                                {language === 'ar' 
                                  ? 'استمارة الفحص و التدقيق المستمر'
                                  : (selectedApprovedForm.grade === 'Grade 12' ? 'Final School Assessment Moderation Ledger' : 'Continuous Assessment Auditing & Moderation Form')}
                              </h2>
                              <p className="text-[13px] sm:text-[14px] text-slate-500 font-medium leading-relaxed mt-1 font-sans">
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
                        <div className="space-y-4 relative z-10 text-right">
                          
                          {/* Row 1: Unified Metadata block stretching horizontally with side-by-side specs and target teacher details */}
                          <div className="grid grid-cols-12 gap-3.5 text-right" dir="rtl">
                            
                            {/* Form Specifications: col-span-5 */}
                            <div className="col-span-5 border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between">
                              <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                {language === 'ar' ? 'بيانات استمارة الفحص والتدقيق المستمر' : 'Specification of Alignment'}
                              </div>
                              <table className="w-full text-[16px] border-collapse h-full text-right" dir="rtl">
                                <tbody>
                                  <tr className="border-b border-[#821315]/45 bg-slate-50/50">
                                    <td className="font-extrabold font-sans text-[#821315] w-28 py-2 px-2 border-l border-[#821315]/45 text-right align-middle">المادة الدراسية:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 text-right align-middle">{selectedApprovedForm.subjectName || selectedApprovedForm.subject}</td>
                                  </tr>
                                  <tr className="border-b border-[#821315]/45">
                                    <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 text-right align-middle">العام الدراسي:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 font-mono text-right align-middle">{selectedApprovedForm.academicYear}</td>
                                  </tr>
                                  <tr className="bg-slate-50/50">
                                    <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 text-right align-middle">الفصل الدراسي:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 text-right align-middle">{selectedApprovedForm.semester}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Target Teacher Profile: col-span-7 */}
                            <div className="col-span-7 border-2 border-[#821315] rounded overflow-hidden bg-white text-right" dir="rtl">
                              <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                {language === 'ar' ? 'بيانات المعلم المستهدف بالفحص والمتابعة' : 'Target Teacher General Bio-data'}
                              </div>
                              <table className="w-full text-[16px] border-collapse relational-table text-right animate-none" dir="rtl">
                                <tbody>
                                  <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                                    <td className="font-extrabold text-[#821315] w-24 py-2 px-2 border-l border-[#821315]/45 text-right align-middle">الاسم:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 text-right whitespace-normal break-words align-middle" colSpan={3}>{selectedApprovedForm.teacherName}</td>
                                  </tr>
                                  <tr className="border-b border-[#821315]/45">
                                    <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans text-right align-middle">رقم الملف:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 font-mono text-right align-middle">{selectedApprovedForm.teacherFileNo}</td>
                                    <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 text-right font-sans align-middle">سنة التعيين:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 font-mono text-right align-middle">{selectedApprovedForm.appointmentYear}</td>
                                  </tr>
                                  <tr>
                                    <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans text-right align-middle">المديرية:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 text-right whitespace-normal break-words align-middle">{selectedApprovedForm.directorate}</td>
                                    <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans text-right align-middle">تاريخ الزيارة:</td>
                                    <td className="font-bold py-2 px-2 text-slate-800 font-mono text-right align-middle">{selectedApprovedForm.visitDate}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                          </div>

                          {/* Row 2: Audited Students Data table */}
                          <div className="border-2 border-black rounded overflow-hidden bg-white text-right font-sans mt-4" dir="rtl">
                            <table className="w-full text-[16px] border-collapse text-right leading-normal font-sans" dir="rtl">
                              <thead>
                                <tr className="bg-[#fcfbee] border-b-2 border-black text-[15px]">
                                  <th className="py-2 px-2 text-slate-905 border-l-2 border-black font-black text-right w-10">#</th>
                                  <th className="py-2 px-3 text-slate-905 border-l-2 border-black font-black text-right">{language === 'ar' ? 'اسم الطالب المستهدف بالفرز والتقصي' : 'Student Full Name'}</th>
                                  <th className="py-2 px-3 text-slate-905 border-l-2 border-black font-black text-center w-36">{language === 'ar' ? 'الأداة الفنية المفحوصة' : 'Assessment Tool'}</th>
                                  <th className="py-2 px-2 text-slate-905 border-l-2 border-black font-black text-center w-28">
                                    {selectedApprovedForm.grade === 'Grade 12' 
                                      ? (language === 'ar' ? 'الدرجة' : 'Mark') 
                                      : (language === 'ar' ? 'الدرجة المرصودة' : 'Recorded Mark')}
                                  </th>
                                  <th className="py-2 px-3 text-slate-905 font-black text-right border-l-2 border-black">
                                    {selectedApprovedForm.grade === 'Grade 12'
                                      ? (language === 'ar' ? 'سبب التعديل / ملاحظات التحقق' : 'Modification Reason / Audit Findings')
                                      : (language === 'ar' ? 'حالة فحص الأداة ومطابقتها للمواصفات' : 'Tool Verification & Compliance')}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedApprovedForm.students && selectedApprovedForm.students.length > 0 ? (
                                  selectedApprovedForm.students.map((st, index) => (
                                    <tr 
                                      key={`approved-view-student-${st.name || 'stud'}-${index}`} 
                                      className={`border-b-2 border-black ${index % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                                    >
                                      <td className="py-2.5 px-2 text-slate-805 text-center font-mono border-l-2 border-black">{index + 1}</td>
                                      <td className="py-2.5 px-3 text-slate-700 font-normal text-right border-l-2 border-black whitespace-normal break-words">{st.name}</td>
                                      <td className="py-2.5 px-3 text-slate-700 text-center font-normal border-l-2 border-black whitespace-normal break-words">{st.level}</td>
                                      <td className="py-2.5 px-2 text-slate-700 text-center font-mono font-black border-l-2 border-black">{st.mark}</td>
                                      <td className="py-2.5 px-3 text-center text-slate-800 font-bold whitespace-normal break-words border-l-2 border-black">
                                        {selectedApprovedForm.grade === 'Grade 12' && ['1', '2', '3', '4', '5', '6'].includes((st.notes || '').trim()) ? (
                                          <span className="font-mono text-[#821315] font-black text-sm bg-red-50/50 px-2 py-0.5 rounded">{st.notes}</span>
                                        ) : (
                                          <span className="text-slate-700 font-medium">
                                            {st.notes === 'لا يوجد' || !st.notes 
                                              ? (selectedApprovedForm.grade === 'Grade 12' ? (language === 'ar' ? 'لا يوجد' : 'None') : (language === 'ar' ? 'مستوفٍ ومطابق للمواصفات' : 'Compliant')) 
                                              : st.notes}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr key="approved-students-empty">
                                    <td colSpan={5} className="py-3 text-center text-slate-400 font-medium">{language === 'ar' ? 'لا توجد بيانات طلاب معروضة.' : 'No student audits listed.'}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Row 3: Classroom Observation & Technical Observations */}
                          <div className="grid grid-cols-12 gap-3 mt-4">
                            <div className="col-span-8 border-2 border-black rounded overflow-hidden bg-white text-right font-sans" dir="rtl" style={{ contentVisibility: 'auto' }}>
                              <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                {selectedApprovedForm.grade !== 'Grade 12'
                                  ? (language === 'ar' ? 'الملاحظات الفنية لأدوات التقويم المستمر (تُكتب بخط يد الفاحص)' : 'Technical Observations (Handwritten by Auditor)')
                                  : (language === 'ar' ? 'بنود المطابقة التفصيلية وجودة محاذاة الأسئلة مع مناهج وزارة التعليم لسلطنة عمان' : 'Syllabus Benchmarks')}
                              </div>

                              {selectedApprovedForm.grade !== 'Grade 12' ? (
                                /* Ruled Handwritten Observations View for Approved Continuous Audit */
                                <div className="p-3 bg-[#faf9f5]/60 flex flex-col justify-between min-h-[220px]">
                                  <div className="space-y-0 w-full font-sans">
                                    {(() => {
                                      const notesText = selectedApprovedForm.observations && selectedApprovedForm.observations.length > 0
                                        ? selectedApprovedForm.observations.map(o => o.notes).filter(Boolean).join('\n')
                                        : '• كراسات الطلاب وأعمالهم مصححة بانتظام وتتضمن تغذية راجعة هادفة.\n• الأسئلة صيغت بوضوح وتراعي المستويات المعرفية الثلاثية وجداول المواصفات.\n• رصد درجات أدوات التقويم المستمر متسق ومطابق للسجلات والبوابة التعليمية.';
                                      const rawLines = notesText.split('\n').filter(l => l.trim().length > 0);
                        const totalLines = Math.max(6, rawLines.length + 2);
                                      const linesArray = Array.from({ length: totalLines }, (_, i) => rawLines[i] || '');

                                      return linesArray.map((lineText, lineIdx) => (
                                        <div 
                                          key={`approved-ruled-line-${lineIdx}`}
                                          className="flex items-center min-h-[34px] border-b border-dashed border-[#821315]/35 px-2 text-[14px] leading-relaxed"
                                          style={{ minHeight: '34px' }}
                                        >
                                          {lineText ? (
                                            <span className="font-bold text-slate-850 tracking-wide font-sans">{lineText}</span>
                                          ) : (
                                            <span className="text-slate-300 text-xs italic select-none">........................................................................................................................................................................................................................</span>
                                          )}
                                        </div>
                                      ));
                                    })()}
                                  </div>

                                  <div className="mt-3 pt-2 border-t border-[#821315]/30 flex items-center justify-between text-[13px] font-bold text-[#821315]">
                                    <div>
                                      <span>اسم وتوقيع الفاحص بخط اليد: </span>
                                      <span className="font-mono text-slate-800 font-bold">{selectedApprovedForm.examinerSignedName || selectedApprovedForm.examinerName || '...........................................'}</span>
                                    </div>
                                    <div>
                                      <span>التاريخ: </span>
                                      <span className="font-mono text-slate-800 font-bold">{selectedApprovedForm.visitDate || '.... / .... / 2026م'}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Grade 12 Benchmarks Table */
                                <table className="w-full text-[16px] border-collapse text-right leading-normal font-sans" dir="rtl">
                                  <thead>
                                    <tr className="bg-slate-50 border-b-2 border-black text-[15px]">
                                      <th className="py-2 px-3 text-slate-705 font-extrabold text-right border-l-2 border-black">{language === 'ar' ? 'الصف' : 'Class'}</th>
                                      <th className="py-2 px-3 text-slate-705 font-extrabold text-center border-l-2 border-black">{language === 'ar' ? 'الأداة' : 'Tool'}</th>
                                      <th className="py-2 px-3 text-slate-705 font-extrabold text-center border-l-2 border-black">{language === 'ar' ? 'الحالة الفنية' : 'Verification Status'}</th>
                                      <th className="py-2 px-3 text-slate-705 font-extrabold text-right">{language === 'ar' ? 'ملاحظات التدقيق والمطابقة' : 'Detailed Findings'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedApprovedForm.observations && selectedApprovedForm.observations.length > 0 ? (
                                      selectedApprovedForm.observations.map((obs, idx) => (
                                        <tr key={`approved-view-obs-${obs.tool || 'obs'}-${idx}`} className="border-b-2 border-black last:border-0 hover:bg-slate-50/50">
                                          <td className="py-2.5 px-3 text-slate-700 text-right font-normal border-l-2 border-black">{translateGrade(obs.gradeClass, language)}</td>
                                          <td className="py-2.5 px-3 text-slate-705 text-center font-normal border-l-2 border-black whitespace-normal break-words">{obs.tool}</td>
                                          <td className="py-2.5 px-3 text-center border-l-2 border-black">
                                            <span className={`px-2.5 py-1 text-[13px] font-black rounded uppercase leading-none ${
                                              obs.status === 'غير مطابق' || obs.status === 'Non-conforming' 
                                                ? 'bg-rose-50 text-rose-800'
                                                : 'bg-emerald-50 text-emerald-800'
                                            }`}>
                                              {obs.status || (language === 'ar' ? 'مستوفٍ ومطابق' : 'Approved')}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-600 font-normal text-right whitespace-normal break-words leading-relaxed">{obs.notes || (language === 'ar' ? 'الأسئلة والمسافات مطابقة تماماً للمواصفة المعتمدة.' : 'Optimal assessment design.')}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr key="approved-obs-empty">
                                        <td colSpan={4} className="py-2 text-center text-slate-400">{language === 'ar' ? 'لا توجد ملاحظات تدقيق.' : 'No findings.'}</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              )}
                            </div>
                            {/* Digital Signatures area with stamped principal details */}
                            <div className="col-span-4 border-2 border-black rounded overflow-hidden bg-[#faf9f5] flex flex-col justify-between p-3.5 text-right font-sans relative" dir="rtl">
                               {selectedApprovedForm.isSigned && selectedApprovedForm.signatureStampUrl !== 'no_stamp' && (
                                 <DraggableStamp 
                                   src={getActiveStamp(selectedApprovedForm.schoolId || selectedApprovedForm.schoolName)} 
                                   language={language}
                                   className="left-3.5 bottom-12 w-20 h-20 opacity-95"
                                   defaultOffsetX={formStyles?.stampOffsetX || 0}
                                   defaultOffsetY={formStyles?.stampOffsetY || 0}
                                   storageKey={`oman_moe_stamp_pos_approved_${selectedApprovedForm.id}`}
                                 />
                               )}
                               <div>
                                 <h5 className="text-[14px] font-black text-[#821315] uppercase leading-none mb-2">{language === 'ar' ? 'اعتماد ومحاذاة التوقيع' : 'Signed Authority'}</h5>
                                 <p className="text-[12px] text-slate-400 font-mono leading-none">ID: {selectedApprovedForm.id.toUpperCase().substr(0, 10)}</p>
                               </div>

                               <div className="space-y-1.5 py-3 border-t-2 border-b-2 border-dashed border-black my-2">
                                 <p className="text-[13px] text-slate-500 font-bold leading-none">{language === 'ar' ? 'مدير المدرسة المعتمد:' : 'Certified Principal:'}</p>
                                 <p className="text-[15px] font-black text-slate-800 tracking-tight whitespace-normal break-words leading-tight">
                                   {selectedApprovedForm.signedByPrincipalName || selectedApprovedForm.principalName}
                                 </p>
                                 <p className="text-[11px] text-slate-400 leading-none">
                                   {formatSafeDate(selectedApprovedForm.signedAt || selectedApprovedForm.createdAt)}
                                 </p>
                               </div>

                               {/* Principal signature stamp - clean alphanumeric display underneath name */}
                               <div className="flex flex-col items-start pt-1">
                                 {selectedApprovedForm.signatureQrData ? (
                                   <div className="w-full text-right">
                                     <span className="text-[12px] font-bold text-emerald-800 leading-none block mb-1">{language === 'ar' ? 'توقيع إلكتروني معتمد ✓' : 'Verified E-Sign ✓'}</span>
                                     <span 
                                       className="font-mono text-[12.5px] text-[#821315] bg-amber-50 px-2 py-0.5 rounded font-black tracking-normal border-2 border-black shadow-xs select-all text-center inline-block whitespace-nowrap"
                                       style={{ whiteSpace: 'nowrap' }}
                                     >
                                       {selectedApprovedForm.signatureQrData}
                                     </span>
                                   </div>
                                 ) : (
                                   <div className="w-full text-center py-2 bg-slate-100/50 rounded border-2 border-dashed border-black">
                                     <span className="text-[12px] font-bold text-slate-400 animate-pulse">{language === 'ar' ? '⏱️ بانتظار التوقيع والاعتماد' : '⏱️ Awaiting Sign'}</span>
                                   </div>
                                 )}
                               </div>
                            </div>
                          </div>
                        </div>

                        </div>
                      </div>
                    </div>
                  </div>
                ) : selectedModeratorTeacher ? (
                  // 💬 FIXED PERSISTENT WHATSAPP AUDIT CHAT STREAM FOR AUDITOR
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <WhatsAppAuditChat
                      userProfile={userProfile}
                      teacherName={selectedModeratorTeacher}
                      schoolName={selectedModeratorSchool || ''}
                      subjectName={
                        (filteredAssessments.find(a => 
                          a.schoolName === selectedModeratorSchool && 
                          (formatCleanTeacherName(a.teacherName, a.schoolEmail) === selectedModeratorTeacher || a.teacherName === selectedModeratorTeacher || a.schoolEmail === selectedModeratorTeacher)
                        )?.subject) || (assessments.find(a => 
                          (formatCleanTeacherName(a.teacherName, a.schoolEmail) === selectedModeratorTeacher || a.teacherName === selectedModeratorTeacher || a.schoolEmail === selectedModeratorTeacher)
                        )?.subject) || 'الرياضيات'
                      }
                      assessments={filteredAssessments.filter(a => 
                        a.schoolName === selectedModeratorSchool && 
                        (formatCleanTeacherName(a.teacherName, a.schoolEmail) === selectedModeratorTeacher || a.teacherName === selectedModeratorTeacher || a.schoolEmail === selectedModeratorTeacher)
                      )}
                      language={language}
                      onBack={() => {
                        setSelectedModeratorTeacher(null);
                        setCurrentAssessment(null);
                      }}
                      onStartAuditForm={(tName, schName, subjName, targetAss) => {
                        handleStartAuditFormFromChat(tName, schName, subjName, targetAss);
                      }}
                      onUploadNewFile={async (payload) => {
                        setActionLoading(true);
                        try {
                          const fullPayload = {
                            ...payload,
                            teacherName: selectedModeratorTeacher,
                            schoolId: userProfile.uid,
                            schoolName: selectedModeratorSchool || userProfile.schoolName || userProfile.name,
                            schoolEmail: userProfile.email,
                            status: 'Pending' as AssessmentStatus
                          };
                          await uploadAssessment(fullPayload);
                          handleSuccess(
                            language === 'ar' 
                              ? `تم إضافة الملف "${payload.title}" في محادثة المعلم بنجاح!` 
                              : `File "${payload.title}" added to teacher chat!`
                          );
                          await fetchAssessmentList();
                        } catch (err: any) {
                          handleError(err.message || 'Error uploading file');
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                      actionLoading={actionLoading}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />

                    {/* Inspection panel & Ministry Audit Form rendered under the fixed chat when a file is inspected */}
                    {currentAssessment && (
                      <div className="space-y-6 pt-6 border-t-2 border-indigo-200/80" id="auditor-inspection-panel">
                        {/* Viewport Header */}
                        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded leading-none border border-slate-100">
                            {translateSubject(currentAssessment.subject, language)} • {translateGrade(currentAssessment.grade, language)}
                          </span>
                          {currentAssessment.grade === 'Grade 12' ? (
                            <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded leading-none bg-[#f4f3ff] border border-[#6366f1]/20 text-[#4338ca] uppercase tracking-wide">
                              🛡️ {language === 'ar' ? 'فحص وتدقيق نهائي' : 'Final Audit'}
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded leading-none bg-[#f0fdfa] border border-[#0d9488]/20 text-[#0f766e] uppercase tracking-wide">
                              🔄 {language === 'ar' ? 'فحص وتدقيق مستمر' : 'Continuous Audit'}
                            </span>
                          )}
                          <Badge status={currentAssessment.status} language={language} />
                        </div>
                        <h2 className="text-lg font-bold font-heading text-slate-900 tracking-tight leading-snug mt-1 text-left">
                          {currentAssessment.title}
                        </h2>
                        <p className="text-xs text-slate-400 font-sans font-medium text-left">
                          {language === 'ar' ? 'تم الرفع بتاريخ ' : 'Uploaded on '} {new Date(currentAssessment.createdAt).toLocaleString(language === 'ar' ? 'ar-OM' : 'en-US')} {language === 'ar' ? ' بواسطة ' : ' by '} <strong className="text-slate-600 font-bold">{currentAssessment.schoolName}</strong>
                        </p>
                      </div>

                      {/* Action buttons (Claim, Edit state depends on roles) */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentAssessment(null);
                            setSelectedApprovedForm(null);
                          }}
                          className="px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                          title={language === "ar" ? "العودة إلى القائمة الرئيسية" : "Return to Queue"}
                        >
                          <span>{language === "ar" ? "← العودة للقائمة" : "← Back to Queue"}</span>
                        </button>
                        {/* School Representative: Trigger revision edit */}
                        {userProfile.role === 'school' && currentAssessment.status === 'Revision Request' && (
                          <button
                            type="button"
                            onClick={handleStartRevisionEdit}
                            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.01]"
                          >
                            {language === 'ar' ? 'تعديل وتصحيح المادة المعادة' : 'Revise Draft Material'}
                          </button>
                        )}

                        {/* Moderator Representative: Claim option */}
                        {(userProfile.role === 'moderator' || userProfile.role === 'admin') && currentAssessment.status === 'Pending' && (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleClaimAssessment(currentAssessment.id)}
                            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-755 disabled:bg-slate-200 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.01] border border-indigo-505"
                          >
                            {language === 'ar' ? 'بدء استلام ومراجعة هذا الاختبار' : 'Claim Assigned Review'}
                          </button>
                        )}
                        
                        {/* Assigned moderator badge notifier */}
                        {currentAssessment.moderatorId && (
                          <div className="text-xs p-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-sans font-medium text-[10.5px]">
                            {language === 'ar' ? 'مشرف المادة: ' : 'Moderator: '} <strong className="text-indigo-600 font-bold">{currentAssessment.moderatorName}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Examination Core Sheet (Designed like an authentic paper catalog) */}
                    <div className="bg-white rounded-3xl border border-slate-200/50 shadow-md p-6 sm:p-8 space-y-7 relative overflow-hidden assessment-paper">
                      
                      {/* Authentic official watermark stamp badge */}
                      <div className="absolute right-[-45px] top-[-30px] select-none opacity-[0.03] pointer-events-none transform rotate-12">
                        <School className="w-72 h-72 text-indigo-500" />
                      </div>

                      {/* Traditional crest visual header and paper margins */}
                      <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4 text-slate-400">
                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest block font-mono text-indigo-650">
                            {language === 'ar' ? 'مخطط ومواصفات الامتحان الوزاري' : 'Ministry Examination Blueprint'}
                          </span>
                          <span className="text-[10px] font-bold block font-sans">
                            {language === 'ar' ? 'وزارة التعليم، سلطنة عُمان' : 'Ministry of Education, Oman'}
                          </span>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="text-[9px] font-extrabold font-mono tracking-wider block bg-rose-50 border border-rose-100 px-2 py-0.5 rounded text-rose-600 uppercase">
                            {language === 'ar' ? 'سري وعاجل للغاية' : 'CONFIDENTIAL'}
                          </span>
                          <span className="text-[9.5px] block font-sans font-medium">
                            {language === 'ar' ? 'معرف الوثيقة: ' : 'Doc ID: '}{currentAssessment.id.substring(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Description summary block */}
                      {currentAssessment.description && (
                        <div className="space-y-1.5 bg-slate-50/80 p-4.5 rounded-2xl border border-slate-200/60">
                          <h4 className="text-[10px] font-bold text-indigo-650 uppercase tracking-widest font-sans">
                            {language === 'ar' ? 'مرجع المنهج الدراسي وتوجيهات الامتحان' : 'Syllabus Reference / Exam Guidelines'}
                          </h4>
                          <p className="text-xs text-slate-650 leading-relaxed font-sans mt-1">
                            {currentAssessment.description}
                          </p>
                        </div>
                      )}

                      {currentAssessment.isPdf ? (
                        /* --- PREMIUM PDF VIEWER GATEWAY & DOWNLOAD HUB --- */
                        <div className="space-y-6">
                          
                          {/* Live Embedded PDF/Document Viewport inside the App */}
                          {currentAssessment.pdfData && (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10.5px] font-extrabold text-[#051C3F] uppercase tracking-widest block font-sans text-left">
                                  {language === 'ar' ? 'معاينة المستند المرفوع مباشرة' : 'Live Document Preview'}
                                </h4>
                                <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                                  currentAssessment.pdfData.startsWith('data:') ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-teal-800'
                                }`}>
                                  {currentAssessment.pdfData.startsWith('data:') ? (language === 'ar' ? 'ملف مرفوع كـ Base64' : 'Local Attachment') : (language === 'ar' ? 'رابط سحابي معتمد' : 'Cloud Storage File')}
                                </span>
                              </div>
                              
                              <div className="border border-slate-200 rounded-3xl overflow-hidden bg-slate-50 relative shadow-inner">
                                {currentAssessment.pdfData.startsWith('data:image') || 
                                 currentAssessment.pdfName?.toLowerCase().endsWith('.png') || 
                                 currentAssessment.pdfName?.toLowerCase().endsWith('.jpg') || 
                                 currentAssessment.pdfName?.toLowerCase().endsWith('.jpeg') ? (
                                  <div className="flex justify-center p-4 max-h-[500px] overflow-auto">
                                    <img 
                                      src={currentAssessment.pdfData} 
                                      alt={currentAssessment.pdfName || 'Uploaded document preview'} 
                                      className="max-w-full h-auto rounded-xl shadow-md"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-full h-[550px] relative">
                                    <object
                                      data={currentAssessment.pdfData}
                                      type="application/pdf"
                                      className="w-full h-full border-0 rounded-2xl"
                                    >
                                      <iframe
                                        src={currentAssessment.pdfData}
                                        title="PDF Preview Frame"
                                        className="w-full h-full border-0 rounded-2xl"
                                        sandbox="allow-scripts allow-same-origin allow-popups"
                                      >
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-4">
                                          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg shadow-sm border border-amber-200/50">
                                            ⚠️
                                          </div>
                                          <div className="max-w-md">
                                            <p className="text-slate-800 text-xs font-black">
                                              {language === 'ar' ? 'التحميل المباشر لمعاينة ملف الـ PDF' : 'Live PDF Preview Active'}
                                            </p>
                                            <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">
                                              {language === 'ar' 
                                                ? 'رابط المعاينة المباشرة متاح للمشرف. يمكنك تنزيل ملف الـ PDF كاملاً وعرضه بأعلى دقة عبر تطبيق التشغيل المحلي لديكم بالقرص الأخضر أدناه.' 
                                                : "The browser's default PDF viewer will render this file. If it doesn't display, click the green download button below to open in your system's PDF viewer."}
                                            </p>
                                          </div>
                                        </div>
                                      </iframe>
                                    </object>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* File download box styled in Emerald conforming to green download rule */}
                          <div className="bg-emerald-500/5 border border-emerald-600/10 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                            <div className="flex items-center gap-3.5 text-right rtl:flex-row-reverse ltr:text-left">
                              <div className="p-3 bg-emerald-650 text-white rounded-2xl shadow-md shrink-0">
                                <FileText className="w-6 h-6 text-white" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] bg-emerald-600/10 text-emerald-800 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-widest">
                                  {language === 'ar' ? 'مستند PDF معتمد' : 'Verified PDF Attachment'}
                                </span>
                                <p className="text-xs font-black text-slate-905 truncate max-w-[250px] sm:max-w-xs leading-none mt-1 text-left">
                                  {currentAssessment.pdfName || (language === 'ar' ? 'نموذج_التقييم_المستمر.pdf' : 'continuous_assessment.pdf')}
                                </p>
                                <p className="text-[10.5px] text-slate-500 font-bold font-mono text-left">
                                  {currentAssessment.pdfSize || '1.8 MB'}
                                </p>
                              </div>
                            </div>

                            {/* Direct Download PDF Button (Emerald Green) */}
                            <button
                              type="button"
                              onClick={() => {
                                if (currentAssessment.pdfData) {
                                  if (currentAssessment.pdfData.startsWith('data:')) {
                                    const link = document.createElement('a');
                                    link.href = currentAssessment.pdfData;
                                    link.download = currentAssessment.pdfName || 'assessment_document.pdf';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  } else {
                                    window.open(currentAssessment.pdfData, '_blank', 'noopener,noreferrer');
                                  }
                                } else {
                                  // Fallback simulation download
                                  const blob = new Blob([currentAssessment.questions], { type: 'application/pdf' });
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = currentAssessment.pdfName || `${currentAssessment.title}.pdf`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  URL.revokeObjectURL(url);
                                }
                              }}
                              className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black font-heading text-xs rounded-xl shadow-md hover:shadow-lg hover:scale-[1.01] transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-500/10"
                            >
                              <Download className="w-4 h-4 text-white" />
                              <span>{language === 'ar' ? 'تحميل ملف الـ PDF مفرغاً' : 'Download Document PDF'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Exam Questions paper sheet */}
                          <div className="space-y-2.5">
                            <h4 className="text-[10.5px] font-extrabold text-slate-450 uppercase tracking-widest block font-sans text-left">
                              {language === 'ar' ? 'نسخة مسودة الأسئلة الفنية للامتحان' : 'Official Curriculum Question Sheet list'}
                            </h4>
                            <div className="relative">
                              <div className="bg-[#FAFBFD] rounded-2xl p-5 sm:p-6 border border-slate-150 font-mono text-xs sm:text-[12.5px] text-slate-805 whitespace-pre-wrap leading-relaxed shadow-inner max-h-[35vh] overflow-y-auto font-medium text-left">
                                {currentAssessment.questions}
                              </div>
                            </div>
                          </div>

                          {/* Answer marking key sheet */}
                          <div className="space-y-2.5">
                            <h4 className="text-[10.5px] font-extrabold text-slate-450 uppercase tracking-widest block font-sans text-left">
                              {language === 'ar' ? 'دليل ونموذج توزيع الدرجات الرسمي ومفاتيح الحل' : 'Official Marking Scheme & Assessment Guide'}
                            </h4>
                            <div className="relative">
                              <div className="bg-[#FAFBFD] rounded-2xl p-5 sm:p-6 border border-slate-150 font-mono text-xs sm:text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner max-h-[35vh] overflow-y-auto font-medium text-left">
                                {currentAssessment.keyAnswer}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* --- OFFICIAL OMAN MOE CONTINUOUS MODERATION FORM GENERATOR & BLUEPRINT --- */}
                    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-8 shadow-md space-y-4 sm:space-y-6 animate-in fade-in duration-200 w-full" dir="rtl">
                      
                      {/* Form Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-4 sm:pb-5">
                        <div className="space-y-1 sm:space-y-1.5 text-right sm:text-right rtl:ml-auto">
                          <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-[#821315]/10 text-[#821315] rounded-full text-[10px] sm:text-[10.5px] font-black uppercase">
                            🖋️ {language === 'ar' ? 'النموذج الرسمي المعتمد للبوابة التعليمية' : 'Official Portal Auditing Form'}
                          </span>
                          <h3 className="text-base sm:text-lg font-bold font-heading text-[#051C3F]">
                            {language === 'ar' 
                              ? 'استمارة الفحص و التدقيق المستمر' 
                              : (currentAssessment?.grade === 'Grade 12' ? 'Final School Assessment Moderation Audit Ledger' : 'Continuous Assessment Moderation Audit Ledger')}
                          </h3>
                          <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed font-sans font-medium">
                            {language === 'ar' 
                              ? 'صمم هذا النظام لتوليد وثيقة التدقيق الرسمي الصادرة عن وزارة التعليم تلقائياً بعد الفحص والمطابقة لعينات صفوف النقل.' 
                              : 'Automatically generates the official Omani Ministry appraisal form upon verifying student continuous assessment metrics.'}
                          </p>
                        </div>

                        {/* Action buttons (Direct Landscape Print & Archive Integration) */}
                        {(() => {
                          const isCurrentFormArchived = currentAssessment 
                            ? (archivedForms.some(f => f.assessmentId === currentAssessment.id) || archivedAssessmentIds.includes(currentAssessment.id))
                            : archivedAssessmentIds.includes('temp_current');
                          return (
                            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
                              <button
                                type="button"
                                onClick={handleArchiveForm}
                                disabled={isArchiving || isCurrentFormArchived}
                                className={`w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-4 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                  isCurrentFormArchived
                                    ? 'bg-emerald-600 cursor-not-allowed opacity-95 shadow-none hover:bg-emerald-600'
                                    : isArchiving 
                                      ? 'bg-emerald-800 opacity-80 cursor-wait' 
                                      : 'bg-emerald-700 hover:bg-emerald-800'
                                }`}
                              >
                                {isCurrentFormArchived ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 text-white animate-pulse" />
                                    <span>{language === 'ar' ? 'تم توقيع المدقق وأُرسلت للمعلم' : 'Auditor Signed & Sent'}</span>
                                  </>
                                ) : isArchiving ? (
                                  <>
                                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                                    <span>{language === 'ar' ? 'جاري تجهيز وتوقيع الاستمارة...' : 'Signing & Forwarding...'}</span>
                                  </>
                                ) : (
                                  <>
                                    <FileSpreadsheet className="w-4 h-4 text-white" />
                                    <span>{language === 'ar' ? 'توقيع المدقق وإرسالها للمعلم' : 'Sign by Auditor & Send to Teacher'}</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={handleDownloadPDF}
                                disabled={isGeneratingPDF}
                                className={`w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-4 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                  isGeneratingPDF 
                                    ? 'bg-[#06331a] opacity-80 cursor-wait' 
                                    : 'bg-[#0b5e32] hover:bg-[#0a4d29]'
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
                          );
                        })()}
                      </div>

                      {/* Info Alert Callout */}
                      <div className="bg-[#FAF9F5] rounded-2xl p-4.5 border border-[#821315]/10 text-xs text-slate-700 leading-relaxed flex gap-3 text-right rtl:flex-row-reverse items-start">
                        <div className="p-2 bg-[#821315]/5 rounded-xl text-[#821315] shrink-0 mt-0.5">
                          <Scale className="w-4 h-4" />
                        </div>
                        <div className="space-y-1 font-medium text-right">
                          <p className="font-extrabold text-[#821310] text-[11px]">
                            {language === 'ar' ? 'إخطار المطابقة والمراجعة الفنية لقسم التقويم بمحافظة الوسطى' : 'Technical Compliance Alert'}
                          </p>
                          <p className="text-[10.5px] text-slate-500 leading-relaxed">
                            {language === 'ar' 
                              ? 'يرجى ملء عينة درجات الطلاب الستة (مستويات توازنية: 2 ممتاز، 2 متوسط، 2 متدني) ثم تدوين الملاحظات التقييمية التفصيلية. تظهر المعاينة الرسمية في الأسفل بالهوية البصرية والختم وتتم طباعتها أفقياً (A4 Landscape) بدقة متناهية.' 
                              : 'Input student marks for the 6-student balance sampling, specify continuous tool names and technical observations. The live printable sheet updates instantly.'}
                          </p>
                        </div>
                      </div>

                      {/* Interactive Edit Form Panels (Visible to claims moderators and admins only, view allowed to schools as well) */}
                      <div className="space-y-6 bg-slate-50/60 p-6 sm:p-8 rounded-3xl border border-slate-200/80 no-print text-right w-full max-w-none shadow-sm" dir="rtl">
                        
                        <div className="border-b border-slate-200 pb-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <h4 className="text-xs sm:text-sm font-black text-[#821315] uppercase tracking-wider flex items-center gap-2">
                              <span>🛠️ {language === 'ar' ? 'لوحة تحرير وتعبئة بيانات الاستمارة الوزارية' : 'Ministry Auditing Form Editor'}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isGrade12 ? 'bg-indigo-100 text-indigo-900 border border-indigo-200' : 'bg-teal-100 text-teal-900 border border-teal-200'
                              }`}>
                                {isGrade12 ? (language === 'ar' ? 'دبلوم التعليم العام (الصف 12)' : 'Grade 12 Diploma') : (language === 'ar' ? 'فحص مستمر (الصفوف 1 - 11)' : 'Continuous (Grades 1-11)')}
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {isGrade12 
                                ? (language === 'ar' ? 'نموذج دبلوم التعليم العام (الصف 12): يتضمن رصد الدرجات قبل وبعد مع تحديد رموز التعديل 1 إلى 6.' : 'Diploma format (Grade 12): Includes before/after score tracking & reason codes 1-6.')
                                : (language === 'ar' ? 'نموذج الفحص والتدقيق المستمر (الصفوف 1 - 11): تم إلغاء خانات تعديل الدرجات قبل/بعد، والملاحظات الفنية يكتبها الفاحص بخط يده.' : 'Continuous format (Grades 1-11): Grade alteration removed; technical remarks are handwritten by the examiner.')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                            <button
                              type="button"
                              onClick={() => setAuditGradeMode('continuous')}
                              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                                !isGrade12 
                                  ? 'bg-[#0d9488] text-white shadow-xs' 
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              🔄 {language === 'ar' ? 'صفوف النقل (1 - 11)' : 'Grades 1-11'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAuditGradeMode('grade12')}
                              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                                isGrade12 
                                  ? 'bg-[#4338ca] text-white shadow-xs' 
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              🛡️ {language === 'ar' ? 'الصف 12 (دبلوم)' : 'Grade 12 (Diploma)'}
                            </button>
                          </div>
                        </div>

                        {/* Grid 1: Teacher metadata */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'اسم المعلم المسؤول' : 'Teacher Name'}</label>
                            <input
                              type="text"
                              value={auditTeacherName}
                              onChange={(e) => setAuditTeacherName(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'رقم الملف المالي/الوظيفي' : 'File Number'}</label>
                            <input
                              type="text"
                              value={auditTeacherFileNo}
                              onChange={(e) => setAuditTeacherFileNo(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'سنة التعيين' : 'Appointment Year'}</label>
                            <input
                              type="text"
                              value={auditAppointmentYear}
                              onChange={(e) => setAuditAppointmentYear(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'تاريخ الزيارة' : 'Visit Date'}</label>
                            <input
                              type="date"
                              value={auditVisitDate}
                              onChange={(e) => setAuditVisitDate(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-1">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'المديرية العامة بمحافظة' : 'General Directorate'}</label>
                            <input
                              type="text"
                              value={auditDirectorate}
                              onChange={(e) => setAuditDirectorate(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'المدرسة' : 'School'}</label>
                            <input
                              type="text"
                              value={auditSchool}
                              onChange={(e) => setAuditSchool(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'التخصص الدراسي' : 'Specialization'}</label>
                            <input
                              type="text"
                              value={auditSpecialization}
                              onChange={(e) => setAuditSpecialization(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'المادة الدراسية بالاستمارة' : 'Form Subject'}</label>
                            <input
                              type="text"
                              value={auditSubjectName}
                              onChange={(e) => setAuditSubjectName(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'العام الدراسي' : 'Academic Year'}</label>
                            <input
                              type="text"
                              value={auditAcademicYear}
                              onChange={(e) => setAuditAcademicYear(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-slate-700 block">{language === 'ar' ? 'الفصل الدراسي' : 'Semester'}</label>
                            <input
                              type="text"
                              value={auditSemester}
                              onChange={(e) => setAuditSemester(e.target.value)}
                              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-bold shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Assessment Sample & Observations Editing */}
                        {!isGrade12 ? (
                          /* Continuous Assessment (Grades 1-11): Exact layout matching reference image */
                          <div className="space-y-4 pt-3">
                            {/* Direction Banner */}
                            <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-xl text-xs text-teal-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-start gap-2.5">
                                <span className="text-xl shrink-0">📋</span>
                                <div>
                                  <h5 className="font-black text-teal-950 text-xs">
                                    {language === 'ar' ? 'نموذج الفحص والتدقيق المستمر (الصفوف 1 - 11):' : 'Continuous Assessment Form (Grades 1-11):'}
                                  </h5>
                                  <p className="text-[11px] text-teal-900 leading-relaxed mt-0.5">
                                    {language === 'ar' 
                                      ? 'تم إلغاء خانات تعديل الدرجات قبل/بعد وفق اللائحة الوزارية. تشتمل الاستمارة على جدولين متجاورين: عينة أسماء الطلاب (يمين)، وأدوات التقويم المستمر مع خانات الملاحظات الفنية وجوانب التطوير (يسار) التي يكتبها الفاحص بخط اليد أو يطبعها جاهزة.'
                                      : 'Grade modification columns removed. The audit comprises two side-by-side tables: Student sample names (right) and Continuous assessment tools with Technical notes & development remarks (left).'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAuditObservations([
                                      { id: 1, gradeClass: 'الصف العاشر', tool: 'اختبار قصير 1', notes: 'الأسئلة مصاغة بدقة وتراعي المستويات المعرفية الثلاثية وجداول المواصفات، مع تصحيح دوري وتغذية راجعة هادفة للطلبة.' },
                                      { id: 2, gradeClass: 'الصف العاشر', tool: 'عرض شفوي', notes: 'الأعمال والأنشطة مكتملة وموثقة بكشوف رصد ملحقة ومطابقة للأدلة والمعايير المعتمدة من الوزارة.' },
                                      { id: 3, gradeClass: 'الصف العاشر', tool: 'سؤال قصير', notes: 'أسئلة قصيرة هادفة ومصححة أولاً بأول مع وجود نوعية توجيهات هادفة وداعمة للمستوى المعرفي.' },
                                      { id: 4, gradeClass: 'الصف العاشر', tool: 'واجب منزلي', notes: 'كراسات الطلاب منتظمة ورصد الدرجات متسق ومطابق للسجلات والبوابة التعليمية دون وجود أية فروقات.' },
                                    ]);
                                  }}
                                  className="text-[11px] font-black text-teal-900 hover:text-teal-950 bg-teal-100 hover:bg-teal-200 px-3 py-1.5 rounded-lg border border-teal-300 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  🎯 {language === 'ar' ? 'أدوات الأستاذ: اختبار قصير 1 • عرض شفوي • سؤال قصير • واجب منزلي' : 'Standard Tools: Quiz 1, Oral, Question, HW'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAuditObservations([
                                      { id: 1, gradeClass: 'الصف العاشر', tool: 'الاختبارات القصيرة', notes: 'الأسئلة مصاغة بدقة وتراعي المستويات المعرفية الثلاثية وجداول المواصفات، مع تصحيح دوري وتغذية راجعة هادفة للطلبة.' },
                                      { id: 2, gradeClass: 'الصف العاشر', tool: 'الأنشطة العملية / المشاريع', notes: 'الأعمال والأنشطة مكتملة وموثقة بكشوف رصد ملحقة ومطابقة للأدلة والمعايير المعتمدة من الوزارة.' },
                                      { id: 3, gradeClass: 'الصف العاشر', tool: 'الواجبات والمهام التعليمية', notes: 'كراسات الطلاب منتظمة والواجبات مصححة أولاً بأول مع وجود نوعية توجيهات هادفة وداعمة للمستوى المعرفي.' },
                                      { id: 4, gradeClass: 'الصف العاشر', tool: 'الملاحظة الصفية ودفتر الطالب', notes: 'رصد درجات أدوات التقويم المستمر متسق ومطابق للسجلات والبوابة التعليمية دون وجود أية فروقات.' },
                                    ]);
                                  }}
                                  className="text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  📚 {language === 'ar' ? 'أدوات اللائحة العامة' : 'General Tools'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAuditObservations(prev => prev.map(o => ({ ...o, notes: '' })));
                                  }}
                                  className="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg border border-rose-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  🗑️ {language === 'ar' ? 'تفريغ الملاحظات للكتابة باليد' : 'Clear Notes'}
                                </button>
                              </div>
                            </div>

                            {/* Dual Side-by-Side Editing Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                              {/* Right: Student Sample (6 Students) */}
                              <div className="lg:col-span-5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                    <span>👥</span>
                                    <span>{language === 'ar' ? '1. عينة الطلاب الستة (2 ممتاز، 2 متوسط، 2 متدني):' : '1. Student Sample (6 Students):'}</span>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const defaults = [
                                        'سالم بن أحمد الجنيبي',
                                        'منى بنت عبدالله الوهيبية',
                                        'سليمان بن علي الجنيبي',
                                        'فاطمة بنت حميد المهرية',
                                        'أحمد بن سعيد الوهيبي',
                                        'مريم بنت حمد الجنيبية'
                                      ];
                                      setAuditStudents(prev => prev.map((s, idx) => ({ ...s, name: defaults[idx] || s.name })));
                                    }}
                                    className="text-[10px] font-bold text-teal-700 hover:text-teal-900"
                                  >
                                    {language === 'ar' ? 'ملء أسماء نموذجية' : 'Fill Sample Names'}
                                  </button>
                                </div>

                                <div className="rounded-xl border-2 border-black bg-white shadow-xs overflow-hidden">
                                  <table className="w-full text-right text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-200 text-black font-black border-b-2 border-black">
                                        <th className="py-2.5 px-3 text-center border-l-2 border-black w-14 bg-slate-200">م</th>
                                        <th className="py-2.5 px-3 text-center bg-slate-200">{language === 'ar' ? 'اسم الطالب' : 'Student Name'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y-2 divide-black">
                                      {auditStudents.slice(0, 6).map((stud, idx) => (
                                        <tr key={`audit-cont-student-${stud.id || idx}-${idx}`} className="border-b-2 border-black last:border-0">
                                          <td className="py-2 px-3 text-center font-black border-l-2 border-black bg-slate-200 text-black">
                                            {stud.id || idx + 1}
                                          </td>
                                          <td className="py-1 px-2 bg-white">
                                            <input
                                              type="text"
                                              value={stud.name}
                                              onChange={(e) => {
                                                const copy = [...auditStudents];
                                                copy[idx].name = e.target.value;
                                                setAuditStudents(copy);
                                              }}
                                              placeholder={language === 'ar' ? `اسم الطالب رقم (${idx + 1})` : `Student Name (${idx + 1})`}
                                              className="w-full px-2.5 py-1.5 text-xs border border-transparent hover:border-slate-300 focus:border-teal-500 rounded bg-transparent font-bold text-slate-800"
                                            />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Left: Continuous Assessment Tools & Technical Observations */}
                              <div className="lg:col-span-7 space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                    <span>📝</span>
                                    <span>{language === 'ar' ? '2. أدوات التقويم والملاحظات الفنية وجوانب التطوير (يكتبها الأستاذ أو يختارها):' : '2. Assessment Tools & Technical Observations:'}</span>
                                  </label>
                                  <span className="text-[10px] font-bold text-teal-700">
                                    ✍️ {language === 'ar' ? 'اكتب أداتك بنفسك أو اختر من المقترحات' : 'Custom tools editable directly'}
                                  </span>
                                </div>

                                <div className="rounded-xl border-2 border-black bg-white shadow-xs overflow-hidden">
                                  <table className="w-full text-right text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-200 text-black font-black border-b-2 border-black">
                                        <th className="py-2.5 px-3 text-center border-l-2 border-black w-48 bg-slate-200 leading-tight">
                                          {language === 'ar' ? 'أدوات التقويم المستمر' : 'Assessment Tool'}
                                        </th>
                                        <th className="py-2.5 px-3 text-center bg-slate-200">
                                          {language === 'ar' ? 'الملاحظات الفنية وجوانب التطوير' : 'Technical Notes & Development Aspects'}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y-2 divide-black">
                                      {auditObservations.slice(0, 4).map((obs, idx) => (
                                        <tr key={`audit-cont-obs-${obs.id || idx}-${idx}`} className="border-b-2 border-black last:border-0">
                                          <td className="p-2 text-center font-black border-l-2 border-black bg-slate-200 text-slate-900 text-xs align-top">
                                            <div className="space-y-1.5">
                                              <input
                                                type="text"
                                                value={obs.tool}
                                                onChange={(e) => {
                                                  const copy = [...auditObservations];
                                                  copy[idx].tool = e.target.value;
                                                  setAuditObservations(copy);
                                                }}
                                                placeholder={language === 'ar' ? 'اكتب اسم الأداة...' : 'Tool name...'}
                                                className="w-full text-center font-black text-slate-950 bg-white border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-500 rounded px-2 py-1.5 text-xs shadow-2xs"
                                              />
                                              {/* Quick tool selector chips */}
                                              <div className="flex flex-wrap items-center justify-center gap-1">
                                                {[
                                                  'اختبار قصير 1',
                                                  'عرض شفوي',
                                                  'سؤال قصير',
                                                  'واجب منزلي',
                                                  'اختبار قصير 2',
                                                  'مشروع عملي',
                                                  'مهمة تعليمية',
                                                  'دفتر الطالب'
                                                ].map((toolOption) => (
                                                  <button
                                                    key={`tool-chip-${idx}-${toolOption}`}
                                                    type="button"
                                                    onClick={() => {
                                                      const copy = [...auditObservations];
                                                      copy[idx].tool = toolOption;
                                                      setAuditObservations(copy);
                                                    }}
                                                    className={`text-[9.5px] px-1.5 py-0.5 rounded transition-all cursor-pointer font-bold ${
                                                      obs.tool === toolOption
                                                        ? 'bg-teal-700 text-white shadow-2xs'
                                                        : 'bg-white/80 hover:bg-white text-slate-700 border border-slate-300/80'
                                                    }`}
                                                  >
                                                    {toolOption}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="p-2 bg-white space-y-1.5 align-top">
                                            <textarea
                                              rows={2}
                                              value={obs.notes}
                                              onChange={(e) => {
                                                const copy = [...auditObservations];
                                                copy[idx].notes = e.target.value;
                                                setAuditObservations(copy);
                                              }}
                                              placeholder={language === 'ar' ? 'اكتب الملاحظات الفنية وجوانب التطوير لهذه الأداة، أو اتركها فارغة للكتابة اليدوية بالقلم الجاف عند الطباعة...' : 'Enter technical observations or leave blank for pen writing...'}
                                              className="w-full px-2.5 py-1.5 text-xs text-slate-800 leading-relaxed font-sans border border-slate-200 focus:border-teal-500 rounded-lg resize-none"
                                            />
                                            {/* Quick suggestion chips */}
                                            <div className="flex flex-wrap items-center gap-1">
                                              {[
                                                idx === 0 ? 'الأسئلة مصاغة بدقة وتراعي جداول المواصفات' : idx === 1 ? 'الأنشطة مكتملة وموثقة بكشوف رصد معتمدة' : idx === 2 ? 'كراسات الطلاب منتظمة ومصححة بانتظام' : 'رصد درجات أدوات التقويم مطابق للسجلات',
                                                'مستوفٍ للمعايير والشروط الفنية'
                                              ].map((phrase, pIdx) => (
                                                <button
                                                  key={`obs-phrase-${idx}-${pIdx}`}
                                                  type="button"
                                                  onClick={() => {
                                                    const copy = [...auditObservations];
                                                    const cur = copy[idx].notes.trim();
                                                    copy[idx].notes = cur ? `${cur} • ${phrase}` : phrase;
                                                    setAuditObservations(copy);
                                                  }}
                                                  className="text-[9.5px] bg-slate-100 hover:bg-teal-50 hover:text-teal-900 text-slate-600 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
                                                >
                                                  + {phrase}
                                                </button>
                                              ))}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Grade 12 (Diploma): Moderation Table with Before/After + Reason Codes 1-6 & Observation Table */
                          <div className="space-y-4 pt-3">
                            <div className="space-y-2">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">
                                  {language === 'ar' ? '1. جدول عينة درجات ومطابقة الطلاب الستة - 2 ممتاز، 2 متوسط، 2 متدني (دبلوم التعليم العام)' : '1. Six-Student Sample Allocation Table (Grade 12)'}
                                </label>
                                <span className="text-[10.5px] font-bold text-indigo-700">
                                  🛡️ {language === 'ar' ? 'يتضمن رصد التعديل وأسبابه لشهادة الدبلوم' : 'Grade moderation enabled for Diploma'}
                                </span>
                              </div>

                              <div className="w-full rounded-xl border-2 border-black bg-white shadow-xs overflow-hidden">
                                <table className="w-full text-right text-xs border-collapse">
                                  <thead className="bg-slate-50 text-slate-600 font-black border-b-2 border-black">
                                    <tr>
                                      <th className="py-2.5 px-3 text-center border-l-2 border-black w-12 mr-0">م</th>
                                      <th className="py-2.5 px-3 border-l-2 border-black">{language === 'ar' ? 'اسم الطالب/ة' : 'Student Name'}</th>
                                      <th className="py-2.5 px-3 border-l-2 border-black w-16 text-center">{language === 'ar' ? 'الصف' : 'Class'}</th>
                                      <th className="py-2.5 px-3 border-l-2 border-black w-32">{language === 'ar' ? 'أداة التقييم' : 'Assessment Tool'}</th>
                                      <th className="py-1 px-1 border-l-2 border-black w-28 text-center bg-slate-100/70" colSpan={2}>
                                        <div className="flex items-center justify-center w-full font-black text-[13px] text-slate-800 py-0.5">{language === 'ar' ? 'الدرجة' : 'Grade'}</div>
                                        <div className="grid grid-cols-2 text-[11px] border-t border-black/40 pt-0.5 font-black divide-x divide-x-reverse divide-black/40 bg-white/70">
                                          <span className="text-slate-900 px-1 font-black">{language === 'ar' ? 'قبل' : 'Before'}</span>
                                          <span className="text-slate-900 px-1 font-black">{language === 'ar' ? 'بعد' : 'After'}</span>
                                        </div>
                                      </th>
                                      <th className="py-2.5 px-3 text-center font-black">{language === 'ar' ? 'سبب التعديل' : 'Modification Reason'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y-2 divide-black">
                                    {auditStudents.map((stud, idx) => (
                                      <tr key={`audit-edit-student-${stud.id || idx}-${idx}`} className="hover:bg-slate-50/50 border-b-2 border-black last:border-0">
                                        <td className="py-2 px-3 text-center font-bold border-l-2 border-black">{stud.id}</td>
                                        <td className="py-1 px-2 border-l-2 border-black">
                                          <input
                                            type="text"
                                            value={stud.name}
                                            onChange={(e) => {
                                              const copy = [...auditStudents];
                                              copy[idx].name = e.target.value;
                                              setAuditStudents(copy);
                                            }}
                                            className="w-full px-2 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-medium"
                                          />
                                        </td>
                                        <td className="py-1 px-2 border-l-2 border-black text-center">
                                          <input
                                            type="text"
                                            value={stud.gradeClass}
                                            onChange={(e) => {
                                              const copy = [...auditStudents];
                                              copy[idx].gradeClass = e.target.value;
                                              setAuditStudents(copy);
                                            }}
                                            className="w-full px-1 py-1 text-center text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-medium"
                                          />
                                        </td>
                                        <td className="py-1 px-2 border-l-2 border-black">
                                          <input
                                            type="text"
                                            value={stud.tool}
                                            onChange={(e) => {
                                              const copy = [...auditStudents];
                                              copy[idx].tool = e.target.value;
                                              setAuditStudents(copy);
                                            }}
                                            className="w-full px-2 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-medium"
                                          />
                                        </td>
                                        <td className="py-1 px-2 border-l-2 border-black text-center">
                                          <input
                                            type="text"
                                            value={stud.scoreBefore}
                                            onChange={(e) => {
                                              const copy = [...auditStudents];
                                              const nextVal = e.target.value;
                                              copy[idx].scoreBefore = nextVal;
                                              if (nextVal.trim() === copy[idx].scoreAfter.trim()) {
                                                copy[idx].reason = 'لا يوجد';
                                              } else {
                                                if (copy[idx].reason === 'لا يوجد' || !['1', '2', '3', '4', '5', '6'].includes(copy[idx].reason)) {
                                                  copy[idx].reason = '1';
                                                }
                                              }
                                              setAuditStudents(copy);
                                            }}
                                            className="w-full px-1 py-1 text-center text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-semibold text-slate-700"
                                          />
                                        </td>
                                        <td className="py-1 px-2 border-l-2 border-black text-center">
                                          <input
                                            type="text"
                                            value={stud.scoreAfter}
                                            onChange={(e) => {
                                              const copy = [...auditStudents];
                                              const nextVal = e.target.value;
                                              copy[idx].scoreAfter = nextVal;
                                              if (copy[idx].scoreBefore.trim() === nextVal.trim()) {
                                                copy[idx].reason = 'لا يوجد';
                                              } else {
                                                if (copy[idx].reason === 'لا يوجد' || !['1', '2', '3', '4', '5', '6'].includes(copy[idx].reason)) {
                                                  copy[idx].reason = '1';
                                                }
                                              }
                                              setAuditStudents(copy);
                                            }}
                                            className="w-full px-1 py-1 text-center text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-semibold text-[#821315]"
                                          />
                                        </td>
                                        <td className="py-1 px-2">
                                          {stud.scoreBefore.trim() === stud.scoreAfter.trim() ? (
                                            <div className="w-full px-2 py-1 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded font-medium text-center font-sans">
                                              {language === 'ar' ? 'لا يوجد تعديل (لا يوجد)' : 'No modification'}
                                            </div>
                                          ) : (
                                            <select
                                              value={['1', '2', '3', '4', '5', '6'].includes(stud.reason) ? stud.reason : '1'}
                                              onChange={(e) => {
                                                const copy = [...auditStudents];
                                                copy[idx].reason = e.target.value;
                                                setAuditStudents(copy);
                                              }}
                                              className="w-full px-2 py-1 text-xs border border-slate-200 focus:border-red-600 rounded bg-white text-slate-800 cursor-pointer font-sans font-medium"
                                              style={{ direction: 'rtl' }}
                                            >
                                              <option value="1">1 - {language === 'ar' ? 'وجود خطأ في نقل درجة الطالب من أداة التقويم إلى سجل درجات المعلم' : '1 - Transfer error'}</option>
                                              <option value="2">2 - {language === 'ar' ? 'وجود خطأ في رصد الدرجة في البوابة التعليمية' : '2 - Entry in portal error'}</option>
                                              <option value="3">3 - {language === 'ar' ? 'وجود خطأ في التصحيح التقديري' : '3 - Underestimation error'}</option>
                                              <option value="4">4 - {language === 'ar' ? 'وجود خطأ في جمع الدرجات سواءً كانت لأداة التقويم أو سجل درجات المعلم' : '4 - Row calculations/sum error'}</option>
                                              <option value="5">5 - {language === 'ar' ? 'وجود خطأ في جبر درجة المجموع' : '5 - Rounding adjustment error'}</option>
                                              <option value="6">6 - {language === 'ar' ? 'عدم توفر الدليل على أعمال الطلبة' : '6 - Absence of student work evidence'}</option>
                                            </select>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Grade 12 Technical Observations Table */}
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">
                                {language === 'ar' ? '2. الملاحظات الفنية الأساسية على كراسات وأدوات الفحص والتقويم (دبلوم التعليم العام)' : '2. Technical Remarks on Continuous Assessment Instruments (Grade 12)'}
                              </label>
                              <div className="overflow-x-auto rounded-xl border-2 border-black bg-white shadow-xs">
                                <table className="w-full text-right text-xs">
                                  <thead className="bg-slate-50 text-slate-800 font-bold border-b-2 border-black">
                                    <tr>
                                      <th className="py-2.5 px-3 border-l-2 border-black w-24 text-center">{language === 'ar' ? 'الصف' : 'Class'}</th>
                                      <th className="py-2.5 px-3 border-l-2 border-black w-36">{language === 'ar' ? 'أداة التقويم المعنية' : 'Assessment Tool'}</th>
                                      <th className="py-2.5 px-4">{language === 'ar' ? 'الملاحظات الفنية التفصيلية' : 'Technical Observations / Detailed Remarks'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y-2 divide-black">
                                    {auditObservations.map((obs, idx) => (
                                      <tr key={`audit-edit-obs-${obs.id || idx}-${idx}`} className="hover:bg-slate-50/50 border-b-2 border-black last:border-0">
                                        <td className="py-1.5 px-2 text-center border-l-2 border-black">
                                          <input
                                            type="text"
                                            value={obs.gradeClass}
                                            onChange={(e) => {
                                              const copy = [...auditObservations];
                                              copy[idx].gradeClass = e.target.value;
                                              setAuditObservations(copy);
                                            }}
                                            className="w-full px-1.5 py-1 text-center text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-bold"
                                          />
                                        </td>
                                        <td className="py-1.5 px-2 border-l-2 border-black">
                                          <input
                                            type="text"
                                            value={obs.tool}
                                            onChange={(e) => {
                                              const copy = [...auditObservations];
                                              copy[idx].tool = e.target.value;
                                              setAuditObservations(copy);
                                            }}
                                            className="w-full px-2 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-medium"
                                          />
                                        </td>
                                        <td className="py-1.5 px-3">
                                          <input
                                            type="text"
                                            value={obs.notes}
                                            onChange={(e) => {
                                              const copy = [...auditObservations];
                                              copy[idx].notes = e.target.value;
                                              setAuditObservations(copy);
                                            }}
                                            className="w-full px-2 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded bg-transparent font-medium"
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Footer Signatures editing */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-450 mr-1 block">{language === 'ar' ? 'برامج الإنماء والتمكين المهني المقترحة بالتقرير' : 'Suggested Development Program'}</label>
                            <input
                              type="text"
                              value={auditSuggestedDevelopment}
                              onChange={(e) => setAuditSuggestedDevelopment(e.target.value)}
                              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-800 font-semibold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-450 mr-1 block">{language === 'ar' ? 'اسم الفاحص / المدقق الفني بالوزارة' : 'Inspector / Examiner Name'}</label>
                            <input
                              type="text"
                              value={auditExaminerName}
                              onChange={(e) => setAuditExaminerName(e.target.value)}
                              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-800 font-semibold"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-[#821315] mr-1 block">{language === 'ar' ? 'اسم مدير المدرسة المصادق على الاستمارة' : 'School Principal Approved'}</label>
                            <input
                              type="text"
                              value={auditPrincipalName}
                              onChange={(e) => setAuditPrincipalName(e.target.value)}
                              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-800 font-semibold"
                            />
                          </div>
                        </div>

                        {/* Conformance Status Selection */}
                        <div className="pt-4 border-t border-slate-200">
                          <label className="block text-[11px] font-black text-slate-600 mb-2">
                            {language === 'ar' ? 'قرار الفاحص وحالة المطابقة:' : 'Examiner Conformance Decision:'} <span className="text-red-500 font-bold">*</span>
                          </label>
                          <div className="mb-3 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 flex gap-2">
                            <span className="shrink-0 text-slate-400">💡</span>
                            <span>{language === 'ar' ? 'ملاحظة: سواء كانت الاستمارة مطابقة أم لا. يوقع الفاحص ثم يوقع المعلم ثم يوقع المدير.' : 'Note: Whether the form is conforming or not, the Examiner signs, then the Teacher signs, then the Principal signs.'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setAuditConformanceStatus('conforming')}
                              className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                                auditConformanceStatus === 'conforming'
                                  ? 'border-emerald-500 bg-emerald-50/20 text-emerald-950 font-black ring-2 ring-emerald-500/10'
                                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-700 font-semibold'
                              }`}
                            >
                              <span className="text-lg">🟢</span>
                              <span className="text-xs">{language === 'ar' ? 'مطابقة المعايير' : 'Conforming'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setAuditConformanceStatus('non-conforming')}
                              className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                                auditConformanceStatus === 'non-conforming'
                                  ? 'border-rose-500 bg-rose-50/20 text-rose-950 font-black ring-2 ring-rose-500/10'
                                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-700 font-semibold'
                              }`}
                            >
                              <span className="text-lg">🔴</span>
                              <span className="text-xs">{language === 'ar' ? 'غير مطابقة المعايير' : 'Non-conforming'}</span>
                            </button>
                          </div>
                        </div>


                      </div>

                      {/* --- HIGH FIDELITY LANDSCAPE INTERACTIVE LIVE PREVIEW RENDER --- */}
                      <div className="space-y-3.5 pt-4">
                        <h4 className="text-[10.5px] font-extrabold text-[#821315] uppercase tracking-widest block font-sans text-right">
                          {language === 'ar' ? '👁️ معاينة حية بالهوية البصرية الرسمية (قبل الطباعة/التنزيل)' : '👁️ Official Ministry Visual Preview Layout'}
                        </h4>
                        
                        {/* Live paper container mimics actual printed A4 aspect ratio and styles */}
                        <div className="w-full overflow-x-auto rounded-3xl border border-slate-300 bg-slate-900/5 p-4 sm:p-6 shadow-inner block text-center" dir="rtl">
                          <div 
                            id="ministry-audit-form-preview"
                            className="bg-white border-2 border-slate-350 shadow-xl p-6 sm:p-8 text-[#000] relative select-none font-sans w-full max-w-full mx-auto leading-relaxed text-right"
                            style={{ direction: 'rtl' }}
                          >
                            {/* Inner elements */}
                            <div 
                              className="space-y-4"
                              style={{
                                transform: `scale(${parseFloat(formStyles?.printZoom || '100%') / 100})`,
                                transformOrigin: 'top center',
                                width: '100%',
                                height: '100%'
                              }}
                            >
                              
                              {/* Top Omani Ministry Logo Header Grid */}
                              <div className="flex items-center justify-between border-b border-slate-300 pb-3 mb-4 relative z-10">
                                
                                {/* Upper Right: Logo of Oman only (no writing) */}
                                <div className="text-right flex items-center justify-start">
                                  <img 
                                    src={logoOmanEmblem} 
                                    alt="شعار سلطنة عُمان" 
                                    className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>

                                {/* Center: Title */}
                                <div className="text-center space-y-1">
                                  <h2 className="text-[19px] sm:text-[21px] font-bold text-[#821315] font-sans leading-relaxed tracking-normal dynamic-moe-report-title">
                                    {language === 'ar' 
                                      ? 'استمارة الفحص و التدقيق المستمر'
                                      : (currentAssessment?.grade === 'Grade 12' ? 'Final School Assessment Moderation Ledger' : 'Continuous Assessment Auditing & Moderation Form')}
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
                              <div className="flex flex-col space-y-4">
                                
                                {/* Row 1: Unified Metadata block stretching horizontally with side-by-side specs and target teacher details */}
                                <div className="grid grid-cols-12 gap-3.5" style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '14px' }}>
                                  
                                  {/* Form Specifications: col-span-5 */}
                                  <div className="col-span-5 border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between" style={{ width: '40%', flex: '0 0 40%', boxSizing: 'border-box' }}>
                                    <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                      {language === 'ar' ? 'بيانات استمارة الفحص والتدقيق المستمر' : 'Specification of Alignment'}
                                    </div>
                                    <table className="w-full text-[16px] border-collapse h-full" style={{ tableLayout: 'fixed', width: '100%' }}>
                                      <tbody>
                                        <tr className="border-b border-[#821315]/45 bg-slate-50/50">
                                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>المادة الدراسية:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{auditSubjectName}</td>
                                        </tr>
                                        <tr className="border-b border-[#821315]/45">
                                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>العام الدراسي:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '65%' }}>{auditAcademicYear}</td>
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>الفصل الدراسي:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{auditSemester}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Target Teacher Profile: col-span-7 */}
                                  <div className="col-span-7 border-2 border-[#821315] rounded overflow-hidden bg-white" style={{ width: '60%', flex: '0 0 60%', boxSizing: 'border-box' }}>
                                    <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                      {language === 'ar' ? 'بيانات المعلم المستهدف بالفحص والمتابعة' : 'Target Teacher General Bio-data'}
                                    </div>
                                    <table className="w-full text-[16px] border-collapse relational-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                                      <tbody>
                                        <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>الاسم:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{auditTeacherName}</td>
                                        </tr>
                                        <tr className="border-b border-[#821315]/45">
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>رقم الملف:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{auditTeacherFileNo}</td>
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>سنة التعيين:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{auditAppointmentYear}</td>
                                        </tr>
                                        <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المديرية:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 leading-normal whitespace-normal break-words text-[16px] align-middle" colSpan={3} style={{ width: '78%' }}>{auditDirectorate}</td>
                                        </tr>
                                        <tr className="border-b border-[#821315]/45">
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المدرسة:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{auditSchool}</td>
                                        </tr>
                                        <tr className="bg-slate-50/20">
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>التخصص:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 font-sans whitespace-normal break-words align-middle" style={{ width: '28%' }}>{auditSpecialization}</td>
                                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>تاريخ الزيارة:</td>
                                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{auditVisitDate}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>

                                </div>

                                {/* Row 2: Continuous Assessment Sample Tables (Grades 1-11) or Grade 12 Moderation Ledger */}
                                {!isGrade12 ? (
                                  /* Continuous Assessment (Grades 1-11): Side-by-Side Dual Tables matching official template */
                                  <div className="flex flex-row gap-3.5 w-full my-1" dir="rtl" style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '14px' }}>
                                    
                                    {/* Right Table: Sample Students (6 rows) */}
                                    <div style={{ width: '42%', flex: '0 0 42%', boxSizing: 'border-box' }} className="flex flex-col">
                                      <table className="w-full text-right border-collapse border-2 border-black h-full" style={{ border: '2px solid black', width: '100%' }}>
                                        <thead>
                                          <tr className="bg-slate-200 text-black font-black text-center" style={{ backgroundColor: '#d1d5db', borderBottom: '2px solid black' }}>
                                            <th className="py-2.5 px-2 border-l-2 border-black text-center text-[15px]" style={{ width: '15%', borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>م</th>
                                            <th className="py-2.5 px-3 text-center text-[15px] font-black" style={{ backgroundColor: '#d1d5db' }}>اسم الطالب</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y-2 divide-black">
                                          {auditStudents.slice(0, 6).map((s, idx) => (
                                            <tr key={`audit-view-sample-${idx}`} className="border-b-2 border-black last:border-b-0 h-[46px]" style={{ borderBottom: '2px solid black' }}>
                                              <td className="py-2 px-2 text-center font-black text-[15px] text-black" style={{ borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>
                                                {s.id || idx + 1}
                                              </td>
                                              <td className="py-2 px-3 bg-white font-bold text-slate-900 text-[15px]">
                                                {s.name || ''}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Left Table: Continuous Assessment Tools & Technical Notes (4 rows) */}
                                    <div style={{ width: '58%', flex: '0 0 58%', boxSizing: 'border-box' }} className="flex flex-col">
                                      <table className="w-full text-right border-collapse border-2 border-black h-full" style={{ border: '2px solid black', width: '100%' }}>
                                        <thead>
                                          <tr className="bg-slate-200 text-black font-black text-center" style={{ backgroundColor: '#d1d5db', borderBottom: '2px solid black' }}>
                                            <th className="py-2 px-2 border-l-2 border-black text-center text-[14px] leading-tight font-black" style={{ width: '28%', borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>
                                              أدوات<br />التقويم<br />المستمر
                                            </th>
                                            <th className="py-2 px-3 text-center text-[15px] font-black" style={{ backgroundColor: '#d1d5db' }}>
                                              الملاحظات الفنية وجوانب التطوير
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y-2 divide-black">
                                          {auditObservations.slice(0, 4).map((obs, idx) => (
                                            <tr key={`audit-view-obs-${idx}`} className="border-b-2 border-black last:border-b-0 h-[69px]" style={{ borderBottom: '2px solid black' }}>
                                              <td className="py-2 px-2 text-center font-black text-[13px] text-slate-950 leading-snug" style={{ borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>
                                                {obs.tool}
                                              </td>
                                              <td className="py-2.5 px-3 bg-white text-slate-900 text-[13.5px] leading-relaxed align-top font-medium">
                                                {obs.notes ? (
                                                  <div className="font-semibold text-slate-850 leading-relaxed whitespace-pre-wrap">{obs.notes}</div>
                                                ) : (
                                                  <div className="h-full min-h-[48px] flex items-center justify-center text-slate-300 text-xs italic select-none">
                                                    {/* Blank space for handwritten notes */}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                  </div>
                                ) : (
                                  /* Grade 12 (Diploma): Dual Ledger and Observations Table */
                                  <div className="grid grid-cols-12 gap-3.5" style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '14px' }}>
                                    
                                    {/* Right col-span-5: Grade 12 Moderation Ledger */}
                                    <div className="col-span-5 flex flex-col border-2 border-[#821315] rounded overflow-hidden bg-white" style={{ width: '100%', flex: '0 0 100%', boxSizing: 'border-box' }}>
                                      <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                                        {language === 'ar' ? 'جدول رصد ومطابقة عينة درجات الطلاب والمشغولات الدراسية (دبلوم التعليم العام)' : 'Student Sample Grades Moderation Ledger (Grade 12)'}
                                      </div>
                                      <table className="w-full text-right text-[16px] border-collapse leading-normal" style={{ tableLayout: 'fixed', width: '100%' }}>
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
                                          {auditStudents.map((s, idx) => (
                                            <tr key={`audit-view-student-${s.id || idx}-${idx}`} className="hover:bg-slate-50/20">
                                              <td className="py-2 px-1.5 border-l border-[#821315]/45 text-center font-bold bg-[#821315]/5 text-[#821315] align-middle">{s.id}</td>
                                              <td className="py-2.5 px-3 border-l border-[#821315]/45 font-bold whitespace-normal break-words text-slate-800 align-middle">{s.name || '---'}</td>
                                              <td className="py-2.5 px-2 border-l border-[#821315]/45 text-center font-semibold font-mono align-middle">{s.gradeClass}</td>
                                              <td className="py-2.5 px-3 border-l border-[#821315]/45 whitespace-normal break-words font-bold text-slate-700 align-middle">{s.tool}</td>
                                              <td className="py-2.5 px-1.5 border-l border-dashed border-[#821315]/45 text-center font-mono font-black text-black text-[15px] bg-slate-50 align-middle">{s.scoreBefore}</td>
                                              <td className="py-2.5 px-1.5 border-l border-[#821315]/45 text-center font-mono font-black text-red-900 text-[15px] bg-red-50 align-middle">{s.scoreAfter}</td>
                                              <td className="py-2.5 px-3 text-center font-bold whitespace-normal break-words text-[13px] text-slate-800 align-middle">
                                                {['1', '2', '3', '4', '5', '6'].includes(s.reason?.trim() || '') ? (
                                                  <span className="font-mono text-[#821315] font-black text-[13px] bg-red-50/50 px-2 py-0.5 rounded">{s.reason}</span>
                                                ) : (
                                                  <span className="text-black font-black block text-center text-[14px]">{s.reason === 'لا يوجد' || !s.reason ? (language === 'ar' ? 'لا يوجد' : 'None') : s.reason}</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Left col-span-7: Grade 12 Technical Observations Table */}
                                    <div className="col-span-7 border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between" style={{ width: '100%', flex: '0 0 100%', boxSizing: 'border-box' }}>
                                      <div className="bg-[#821315]/5 text-[#821315] px-3 py-1.5 text-[15px] font-black text-center border-b-2 border-[#821315] font-sans">
                                        {language === 'ar' ? 'الملاحظات الفنية على أدوات التقويم المستمر - التقرير المعتمد للجنة' : 'Technical Observations / Audit Comments (Grade 12)'}
                                      </div>
                                      <table className="w-full text-right text-[16px] border-collapse leading-normal flex-1" style={{ tableLayout: 'fixed', width: '100%' }}>
                                        <thead>
                                          <tr className="bg-slate-50 text-slate-600 font-black text-[15px] border-b-2 border-[#821315]/45">
                                            <th className="py-2 px-3 border-l border-[#821315]/45 text-center align-middle" style={{ width: '15%' }}>الصف</th>
                                            <th className="py-2 px-3 border-l border-[#821315]/45 align-middle" style={{ width: '30%' }}>أداة التقويم</th>
                                            <th className="py-2 px-3 align-middle" style={{ width: '55%' }}>موجز الملاحظات الفنية والوزارية</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#821315]/45 text-slate-700">
                                          {auditObservations.map((obs, idx) => (
                                            <tr key={`audit-view-obs-${obs.id || idx}-${idx}`} className="hover:bg-slate-50/20">
                                              <td className="py-2.5 px-3 border-l border-[#821315]/45 text-center font-bold bg-[#821315]/5 text-[#821315] align-middle">{obs.gradeClass}</td>
                                              <td className="py-2.5 px-3 border-l border-[#821315]/45 font-bold whitespace-normal break-words align-middle">{obs.tool}</td>
                                              <td className="py-2.5 px-3 text-slate-950 font-black text-center whitespace-normal break-words leading-relaxed text-[15px] align-middle">{language === 'ar' ? `ملاحظة رقم ${obs.id}` : `Observation No. (${obs.id})`}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                  </div>
                                )}
                                {/* Beautiful Bottom Footer Bar with Suggested Program and sequential signatures */}
                                <div className="border border-[#821315] rounded bg-white">
                                  <div className="flex w-full text-[16px]" dir="rtl" style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
                                    
                                    {/* Professional development space */}
                                    <div className="p-3 text-right flex flex-col justify-center" style={{ width: '37%', flex: '0 0 37%', boxSizing: 'border-box' }}>
                                      <span className="font-extrabold text-[#821315] block text-[15px]">برامج الإنماء والتمكين المهني المقترحة بالتقرير:</span>
                                      <p className="text-slate-700 font-bold leading-relaxed text-[15px] mt-1">{auditSuggestedDevelopment}</p>
                                    </div>

                                    {/* 1. Examiner details */}
                                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                                      <span className="font-extrabold text-[#821315] block text-[15px]">1. مشرف فحص وتدقيق المادة:</span>
                                      <p className="text-slate-800 font-black text-[15px] mt-1 leading-tight">{auditExaminerName}</p>
                                      <div className="pt-1.5 text-[12px] text-slate-400">توقيع المدقق: <span className="font-mono text-indigo-600 font-bold">/ {auditExaminerName.substring(0, 7)} /</span></div>
                                    </div>

                                    {/* 2. Teacher details */}
                                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                                      <span className="font-extrabold text-[#821315] block text-[15px]">2. معلم المادة (بالعلم والمراجعة):</span>
                                      <p className="text-slate-800 font-black text-[15px] mt-1 leading-tight">{auditTeacherName || 'أ. معلم المادة'}</p>
                                      <div className="pt-1.5 text-[12px] text-slate-400">توقيع المعلم: <span className="font-mono text-sky-600 font-bold">/ {(auditTeacherName || 'المعلم').substring(0, 7)} /</span></div>
                                    </div>

                                    {/* 3. Principal and Stamp */}
                                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                                      <div className="font-extrabold text-[#821315] block text-[15px] w-full">3. مدير المدرسة والختم:</div>
                                      <div className="text-slate-800 font-black text-[15px] mt-1 block w-full leading-tight">{auditPrincipalName || 'أ. محمد بن راشد الجنيبي'}</div>
                                      <div className="text-[12px] text-slate-400 mt-1.5 block w-full">
                                        <span className="font-mono text-[#821315] font-extrabold block w-full" style={{ direction: 'ltr' }}>
                                          OM-SIG-1XCT85
                                        </span>
                                      </div>
                                    </div>

                                </div>
                              </div>

                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {currentAssessment.feedback && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-2.5 animate-in fade-in">
                        <h4 className="text-xs font-bold text-amber-900 flex items-center gap-2 font-heading">
                          <span className="text-lg">📌</span>
                          <span>{language === 'ar' ? 'ملاحظات وتوجيهات مشرف المادة بوزارة التعليم' : 'Ministry Subject Supervisor Evaluation Feedback'}</span>
                        </h4>
                        <div className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans whitespace-pre-wrap bg-white/50 p-4 rounded-xl border border-slate-200 italic text-left">
                          "{currentAssessment.feedback}"
                        </div>
                      </div>
                    )}

                    {/* Moderator Submission review control box */}
                    {(userProfile.role === 'moderator' || userProfile.role === 'admin') && currentAssessment.status === 'In Progress' && currentAssessment.moderatorId === userProfile.uid && (
                      <div className="bg-white rounded-3xl border border-slate-200/50 p-6 shadow-md space-y-5">
                        <div className="border-b border-slate-100 pb-2.5">
                          <h3 className="font-extrabold font-heading text-indigo-650 text-sm uppercase tracking-wider block">
                            {language === 'ar' ? 'ملخص تقييم المنهج والامتحان الوطني المعتمد' : 'Accredited Curriculum Evaluation Summary'}
                          </h3>
                        </div>

                        <form onSubmit={handleSubmittingReview} className="space-y-5">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                              {language === 'ar' ? 'قرار اعتماد المخطط الدراسي' : 'Syllabus Decision'}
                            </label>
                            <div className="flex bg-slate-100 rounded-xl p-1 gap-1.5 flex-col sm:flex-row">
                              <button
                                type="button"
                                onClick={() => setReviewStatus('Approved')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                                  reviewStatus === 'Approved' 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {language === 'ar' ? 'استمارات مطابقة' : 'Conforming Forms'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setReviewStatus('Grade Revision')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                                  reviewStatus === 'Grade Revision' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {language === 'ar' ? 'تعديل درجات' : 'Grade Revisions'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setReviewStatus('Revision Request')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                                  reviewStatus === 'Revision Request' 
                                    ? 'bg-rose-500 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {language === 'ar' ? 'استمارات غير مطابقة' : 'Non-compliant Forms'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                              {language === 'ar' ? 'تعليمات وتوجيهات مشرف تدقيق المادة الأكاديمية' : 'Supervision Audit Notes / Guidelines'}
                            </label>
                            <textarea
                              rows={3}
                              required
                              value={reviewFeedback}
                              onChange={(e) => setReviewFeedback(e.target.value)}
                              placeholder={language === 'ar' ? 'يرجى تقديم تفاصيل دقيقة وتوجيهات كتابية واضحة للمديرية أو المدرسة لتعديل الاختبار الفني...' : 'Please describe textbook discrepancies, syllabus mismatch corrections, or mandatory item-writing updates...'}
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-600 bg-slate-50/50 font-medium leading-relaxed resize-none"
                            />
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="submit"
                              disabled={actionLoading}
                              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-750 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md transition-colors"
                            >
                              {actionLoading 
                                ? (language === 'ar' ? 'جاري الحفظ والنشر الوزاري المعتمد...' : 'Submitting...') 
                                : (language === 'ar' ? 'نشر وإصدار القرار الرسمي للمادة' : 'Publish Official Review Decision')}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Timeline logs */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-200/50 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h4 className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
                          {getTranslatedText('logsTimelineHeader', language)}
                        </h4>
                        {activityLogs.length > 0 && (
                          <button
                            type="button"
                            onClick={handleExportCSV}
                            className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#0B2C1A] hover:bg-[#153e27] text-white text-[10.5px] font-bold rounded-lg cursor-pointer transition-all shadow-xs border border-[#0B2C1A]/10 active:scale-95 ${
                              language === 'ar' ? 'flex-row-reverse' : ''
                            }`}
                            title={language === 'ar' ? 'تصدير سجل الأنشطة كملف CSV' : 'Export activity log as CSV'}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2]" />
                            <span>{language === 'ar' ? 'تصدير CSV' : 'Export CSV'}</span>
                          </button>
                        )}
                      </div>
                      <LogsTimeline logs={activityLogs} language={language} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md space-y-6 animate-in fade-in duration-200" dir="rtl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-150 pb-4">
                  <div className="space-y-1 text-right">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full text-[10.5px] font-black uppercase">
                      💬 {language === 'ar' ? 'قوائم المحادثات المباشرة' : 'Live Teacher Audit Chats'}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold font-heading text-slate-900">
                      {language === 'ar' 
                        ? `قائمة المحادثات مع المعلمين - ${selectedModeratorSchool || 'كافة المدارس'}` 
                        : `Teachers Chat List - ${selectedModeratorSchool || 'All Schools'}`}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium font-sans">
                      {language === 'ar' 
                        ? 'اختر المعلم لبدء محادثة الواتساب المباشرة واستعراض الملفات المرفوعة واستمارة التدقيق المعتمدة' 
                        : 'Select a teacher to open direct WhatsApp audit chat and review continuous appraisal forms'}
                    </p>
                  </div>
                </div>

                {/* Teachers list for selected school */}
                <div className="space-y-3">
                  {(() => {
                    const targetSchoolAssessments = filteredAssessments.filter(a => !selectedModeratorSchool || a.schoolName === selectedModeratorSchool);
                    const teacherNames = Array.from(new Set(targetSchoolAssessments.map(a => formatCleanTeacherName(a.teacherName, a.schoolEmail)).filter(Boolean)));

                    if (teacherNames.length === 0) {
                      return (
                        <div className="text-center py-16 space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto text-slate-300 shadow-xs border border-slate-100">
                            <ClipboardList className="w-7 h-7 stroke-[1.2]" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-700 text-sm">
                              {language === 'ar' ? 'لا توجد محادثات معلمين متوفرة حالياً' : 'No teacher conversations found'}
                            </h4>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                              {language === 'ar' 
                                ? 'يرجى اختيار مدرسة أخرى من قائمة المدارس على اليمين لرؤية معلّميها ومحادثاتهم المباشرة.' 
                                : 'Please select another school from the right column list.'}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return teacherNames.map((tName, tIdx) => {
                      const tUploads = targetSchoolAssessments.filter(a => formatCleanTeacherName(a.teacherName, a.schoolEmail) === tName || a.teacherName === tName || a.schoolEmail === tName);
                      const firstItem = tUploads[0];
                      const subjDisplay = firstItem ? translateSubject(firstItem.subject, language) : (userProfile.subject || 'الرياضيات');

                      return (
                        <div
                          key={`teacher-chat-card-${tIdx}`}
                          onClick={() => setSelectedModeratorTeacher(tName)}
                          className="p-4.5 bg-gradient-to-r from-white to-slate-50/40 hover:from-emerald-50/30 hover:to-white border border-slate-200/90 hover:border-emerald-500/80 rounded-2xl cursor-pointer transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs hover:shadow-md hover:scale-[1.005] group"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 border border-emerald-200/80 flex items-center justify-center text-emerald-900 text-xl font-black shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                              👨‍🏫
                            </div>
                            <div className="space-y-1 text-right">
                              <h4 className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-emerald-950 transition-colors">
                                {tName}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium flex-wrap">
                                <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-bold text-[10.5px]">
                                  {subjDisplay}
                                </span>
                                <span>•</span>
                                <span className="text-slate-600 font-bold">
                                  {tUploads.length} {language === 'ar' ? 'ملفات مرفوعة' : 'Uploaded Files'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModeratorTeacher(tName);
                            }}
                            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
                          >
                            <span>💬 {language === 'ar' ? 'فتح المحادثة والملفات' : 'Open WhatsApp Chat'}</span>
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            </div>
          </div>
        )}
        </div>
        )}

          {/* OTHER PORTAL VIEW TABS */}
          {activeTab === 'databases' && (
            <DatabasesHubView
              language={language}
              subjects={SUBJECTS}
            />
          )}

          {activeTab === 'results' && (
            <ResultsView
              assessments={assessments}
              language={language}
              userProfile={userProfile}
            />
          )}

          {activeTab === 'standards' && (
            <StandardsView
              language={language}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              userProfile={userProfile}
              language={language}
              onUpdateSubject={handleUpdateSubject}
              sandboxActive={sandbox}
              onToggleSandbox={handleToggleSandbox}
              subjects={SUBJECTS}
            />
          )}

          {activeTab === 'archive' && (
            <div className="max-w-7xl mx-auto space-y-6">
              <SchoolArchiveView
                archivedForms={archivedForms}
                language={language}
                onSignForm={async (archiveId, pName, qrData, stampUrl) => {
                  await signArchivedForm(archiveId, pName, qrData, stampUrl);
                  await fetchArchivedFormsList();
                }}
                onSignTeacherForm={async (archiveId, tName, qrData) => {
                  await signArchivedTeacherForm(archiveId, tName, qrData);
                  await fetchArchivedFormsList();
                }}
                onSignExaminerForm={async (archiveId, eName, qrData, conformanceStatus, hasGradeRevisions) => {
                  await signArchivedExaminerForm(archiveId, eName, qrData, undefined, conformanceStatus, hasGradeRevisions);
                  await fetchArchivedFormsList();
                }}
                userProfile={userProfile}
                onSuccess={handleSuccess}
                certifiedOnly={true}
              />
            </div>
          )}

            </div>
            </ErrorBoundary>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-850 py-8 mt-16 text-slate-405 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-at-b from-indigo-950/20 to-transparent opacity-50 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-4 text-center space-y-3 relative z-10">
          <p className="text-xs font-mono font-bold uppercase tracking-[0.25em] text-amber-400">
            {language === 'ar' ? 'منصة مرصد © الرقمية' : 'Marsad Digital Platform ©'}
          </p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            {language === 'ar' 
              ? 'إن جميع مخططات المنهج الدراسي، ومواد الامتحانات، وأدلة التصحيح هي ملكية وطنية محمية بموجب قوانين أمن التعليم الوطني بالسلطنة.'
              : 'All curriculum blueprints, exam materials, and marking guidelines are restricted national property protected under national educational safety laws.'}
          </p>
        </div>
      </footer>

      {/* --- MOE Profile Registration Onboarding Modal (Firebase Live First-Login only) --- */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div 
            key="app-onboarding-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-150 w-full max-w-md p-6.5 overflow-hidden space-y-5"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-white border border-amber-300/40 rounded-2xl flex items-center justify-center mx-auto shadow-md p-1.5 select-none">
                  <img 
                    src={logoMoe} 
                    alt={language === 'ar' ? 'سلطنة عمان' : 'Sultanate of Oman'}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h3 className="font-bold font-heading text-slate-800 text-lg tracking-tight">
                  {language === 'ar' ? 'تسجيل الملف التعريفي بوزارة التعليم' : 'Register MOE Oman Profile'}
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed font-sans">
                  {language === 'ar' 
                    ? 'تم التحقق بنجاح من بريدك الإلكتروني المعتمد @moe.om. يرجى ربط هويتك الوطنية على البوابة أدناه.'
                    : 'Your certified @moe.om email has been authenticated. Please associate your national profile credentials below.'}
                </p>
              </div>

              <form onSubmit={handleCompleteOnboarding} className="space-y-4 text-left">
                {/* Onboard Role buttons */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                    {language === 'ar' ? 'الدور والصفة بالبوابة' : 'Assigned Portal Role'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-100">
                    <button
                      type="button"
                      onClick={() => setOnboardRole('school')}
                      className={`py-2 px-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                        onboardRole === 'school' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {language === 'ar' ? '🏫 ممثل المدرسة' : '🏫 School Rep'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnboardRole('moderator')}
                      className={`py-2 px-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                        onboardRole === 'moderator' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {language === 'ar' ? '🔍 مشرف اختصاصي' : '🔍 Supervisor'}
                    </button>
                  </div>
                </div>

                {/* Onboard Name Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                    {language === 'ar' ? 'الاسم الكامل بالثلاثي' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={onboardName}
                    onChange={(e) => setOnboardName(e.target.value)}
                    placeholder={language === 'ar' ? 'أدخل اسمك الكامل المسجل في السجل المدني...' : 'Enter your complete civil registry name...'}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-600 font-medium"
                  />
                </div>

                {/* Onboard conditional school name */}
                {onboardRole === 'school' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-1 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-right" dir="rtl">
                    <span className="text-[10px] font-black text-indigo-850 uppercase tracking-widest block font-sans">
                      {language === 'ar' ? '🏫 تحديد المدرسة والولاية' : '🏫 Affiliated School / Wilayat'}
                    </span>
                    
                    <div className="space-y-2 text-right">
                      <label className="text-[10px] font-extrabold text-slate-400 block">
                        {language === 'ar' ? 'الولاية بمحافظة الوسطى:' : 'Wilayat (Al Wusta Region):'}
                      </label>
                      <select
                        required
                        value={onboardSchoolWilaya}
                        onChange={(e) => {
                          const wId = e.target.value;
                          setOnboardSchoolWilaya(wId);
                          if (wId && wId !== 'custom') {
                            const wilaya = OMAN_WUSTA_SCHOOLS.find(w => w.id === wId);
                            if (wilaya && wilaya.schools.length > 0) {
                              setOnboardSchoolName(wilaya.schools[0].nameAr);
                            } else {
                              setOnboardSchoolName('');
                            }
                          } else {
                            setOnboardSchoolName('');
                          }
                        }}
                        className="w-full px-3 py-2 border border-slate-205 rounded-xl text-xs text-slate-805 bg-white focus:outline-none font-bold cursor-pointer"
                      >
                        <option key="onboard-wilaya-default" value="">{language === 'ar' ? '-- اختر الولاية --' : '-- Select Wilayat --'}</option>
                        {OMAN_WUSTA_SCHOOLS.map(w => (
                          <option key={`onboard-wilaya-opt-${w.id}`} value={w.id}>{language === 'ar' ? w.nameAr : w.nameEn}</option>
                        ))}
                        <option key="onboard-wilaya-custom" value="custom">{language === 'ar' ? '✍️ كتابة يدوية أخرى' : '✍️ Other/Custom School'}</option>
                      </select>
                    </div>

                    <div className="space-y-2 text-right">
                      <label className="text-[10px] font-extrabold text-slate-400 block">
                        {language === 'ar' ? 'المدرسة التابعة:' : 'Select School Name:'}
                      </label>
                      {onboardSchoolWilaya && onboardSchoolWilaya !== 'custom' ? (
                        <select
                          required
                          value={onboardSchoolName}
                          onChange={(e) => setOnboardSchoolName(e.target.value)}
                           className="w-full px-3 py-2 border border-slate-205 rounded-xl text-xs text-indigo-950 bg-white focus:outline-none font-black cursor-pointer"
                        >
                          {OMAN_WUSTA_SCHOOLS.find(w => w.id === onboardSchoolWilaya)?.schools.map((s, index) => (
                            <option key={`onboard-sch-${s.nameAr}-${index}`} value={s.nameAr}>{language === 'ar' ? s.nameAr : s.nameEn}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          value={onboardSchoolName}
                          onChange={(e) => setOnboardSchoolName(e.target.value)}
                          placeholder={language === 'ar' ? 'أدخل اسم المدرسة المعتمد المسمى تالياً...' : 'Type certified school name manually...'}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none font-semibold bg-white"
                        />
                      )}
                    </div>
                  </div>
                )}

                {onboardRole === 'moderator' && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">
                      {language === 'ar' ? 'التخصص الأكاديمي لمشرف المادة' : 'Academic Specialty Subject'}
                    </label>
                    <select
                      value={onboardSubject}
                      onChange={(e) => setOnboardSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-205 rounded-xl text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-650 font-medium cursor-pointer"
                    >
                      {SUBJECTS.map((s, index) => <option key={`onboard-subj-${s}-${index}`} value={s}>{translateSubject(s, language)}</option>)}
                    </select>
                    <p className="text-[10px] text-amber-600 font-semibold leading-snug">
                      {language === 'ar' 
                        ? '⚠️ تنبيه: بمجرد التسجيل، سيتم قفل مادتك الأكاديمية المختارة ولا يمكن تعديلها لاحقاً.' 
                        : '⚠️ Note: Once registered, your designated specialty subject is locked and cannot be changed later.'}
                    </p>
                  </div>
                )}

                <div className="pt-2.5">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-750 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                  >
                    {actionLoading 
                      ? (language === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing Up...') 
                      : (language === 'ar' ? 'إكمال عملية التسجيل للبوابة الوطنية' : 'Complete Portal Onboarding')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Dynamic Subject Specialty Required Form (O(1) Lock check - Removed as administrator determines subjects in the database) --- */}

      {/* --- AI Syllabus Guidance Modal View --- */}
      <AIPrecheckModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        result={aiPrecheckResult}
        loading={aiPrecheckLoading}
        language={language}
      />

      {/* --- User Self-Service Change Password Modal --- */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        userEmail={userProfile?.email || ''}
        userName={userProfile?.name || ''}
        language={language}
        onSuccess={() => {
          handleSuccess(language === 'ar' ? 'تم تحديث كلمة المرور الخاصة بك بنجاح.' : 'Your password has been successfully updated.');
        }}
      />

      {/* --- Microsoft SSO Authentication Transition overlay --- */}
      {mssAuthenticating && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl border border-slate-150 animate-in zoom-in-95 duration-200">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-xl">
                🔄
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold font-heading text-slate-800 text-base">
                {language === 'ar' ? 'جاري إكمال تسجيل الدخول الموحد (Microsoft SSO)' : 'Completing Microsoft SSO'}
              </h3>
              <p className="text-slate-500 text-xs leading-relaxed font-sans">
                {language === 'ar' 
                  ? 'جاري التحقق وسحب تصاريحك الرسمية ومزامنتها بوزارة التعليم بسلطنة عُمان...'
                  : 'Retrieving your Ministry of Education Oman credential clearance and syncing national registry...'}
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 rounded-full text-[10px] text-amber-700 font-bold uppercase tracking-wider animate-pulse font-mono">
                {language === 'ar' ? 'الرابط الآمن نشط' : 'Secure Link Active'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* --- PRINT ONLY SECTOR FOR A4 LANDSCAPE MINISTERIAL PRINTOUT --- */}
      <div className="print-only">
        <div className="print-only-inner w-full h-full bg-white p-1 text-[#000] relative select-none font-sans flex flex-col justify-between" style={{ direction: 'rtl' }}>
          
          {/* Top Omani Ministry Logo Header Grid */}
          <div className="flex items-center justify-between border-b border-slate-400 pb-1.5">
            
            {/* Upper Right: Logo of Oman only (no writing) */}
            <div className="text-right flex items-center justify-start">
              <img 
                src={logoOmanEmblem} 
                alt="شعار سلطنة عُمان" 
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="text-center space-y-0.5">
              <h2 className="text-[13px] font-bold text-[#821315] font-sans leading-relaxed tracking-normal">
                {language === 'ar' 
                  ? 'استمارة الفحص و التدقيق المستمر' 
                  : (currentAssessment?.grade === 'Grade 12' ? 'Final School Assessment Moderation Ledger' : 'Continuous Assessment Auditing & Moderation Form')}
              </h2>
              <p className="text-[8px] sm:text-[8.5px] text-slate-650 font-medium leading-relaxed mt-0.5">
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
                className="w-16 h-12 sm:w-20 sm:h-14 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

          </div>

          {/* Wide Horizontal-Stack bands for perfect high-fidelity aesthetic alignment and legibility on A4 paper */}
          <div className="space-y-3 mt-3 w-full">
            
            {/* Row 1: Unified Metadata block stretching horizontally with side-by-side specs and target teacher details */}
            <div className="grid grid-cols-12 gap-3.5">
              
              {/* Form Specifications: col-span-5 */}
              <div className="col-span-5 border border-slate-400 rounded overflow-hidden bg-white flex flex-col justify-between">
                <div className="bg-[#821315] text-white px-2 py-0.5 text-[9.5px] font-black text-center">
                  {language === 'ar' ? 'بيانات استمارة الفحص والتدقيق المستمر' : 'Specification of Alignment'}
                </div>
                <table className="w-full text-[9px] border-collapse h-full">
                  <tbody>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="font-extrabold text-[#821315] w-24 py-1 px-2 border-l border-slate-300">المادة الدراسية:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 whitespace-normal break-words">{auditSubjectName}</td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">العــــــام الدراسي:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 font-mono whitespace-normal break-words">{auditAcademicYear}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">الفصل الدراسي:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 whitespace-normal break-words">{auditSemester}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Target Teacher Profile: col-span-7 */}
              <div className="col-span-7 border border-slate-400 rounded overflow-hidden bg-white">
                <div className="bg-[#821315] text-white px-2 py-0.5 text-[9.5px] font-black text-center">
                  {language === 'ar' ? 'بيانات المعلم المستهدف بالفحص والمتابعة' : 'Target Teacher General Bio-data'}
                </div>
                <table className="w-full text-[8.5px] border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="font-extrabold text-[#821315] w-24 py-1 px-2 border-l border-slate-300">الاســــــــــم:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 whitespace-normal break-words" colSpan={3}>{auditTeacherName}</td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">رقم الملف الوظيفي:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 font-mono whitespace-normal break-words">{auditTeacherFileNo}</td>
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-r border-slate-300">سنة التعيين:</td>
                      <td className="font-normal py-1 px-2 text-slate-705 font-mono whitespace-normal break-words">{auditAppointmentYear}</td>
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">المديريـــــــــة:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 text-[8.5px] leading-tight whitespace-normal break-words" colSpan={3}>{auditDirectorate}</td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">المدرســــــــــة:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 whitespace-normal break-words" colSpan={3}>{auditSchool}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-slate-300">التخصـــــــــص:</td>
                      <td className="font-normal py-1 px-2 text-slate-705 font-sans whitespace-normal break-words">{auditSpecialization}</td>
                      <td className="font-extrabold text-[#821315] py-1 px-2 border-l border-r border-slate-300">تاريخ الزيارة:</td>
                      <td className="font-normal py-1 px-2 text-slate-700 font-mono whitespace-normal break-words">{auditVisitDate}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* Row 2: Side-by-side Grades Audit Ledger (Right col-span-5) & Technical Observations (Left col-span-7) */}
            <div className="grid grid-cols-12 gap-3.5 flex-1">
              
              {/* Right col-span-5: Grades Audit Ledger */}
              <div className="col-span-5 flex flex-col border border-black rounded overflow-hidden font-sans">
                {!isGrade12 ? (
                  /* Grades 1-11: Official Student Sample Table (م and اسم الطالب) */
                  <table className="w-full text-right text-[9px] border-collapse leading-tight flex-1" style={{ border: '1.5px solid black' }}>
                    <thead>
                      <tr className="bg-slate-200 text-black font-black text-center" style={{ backgroundColor: '#d1d5db', borderBottom: '1.5px solid black' }}>
                        <th className="py-1 px-1 border-l border-black text-center text-[9px] font-black" style={{ width: '15%', borderLeft: '1.5px solid black', backgroundColor: '#d1d5db' }}>م</th>
                        <th className="py-1 px-2 text-center text-[9.5px] font-black" style={{ backgroundColor: '#d1d5db' }}>اسم الطالب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditStudents.slice(0, 6).map((s, idx) => (
                        <tr key={`audit-print-cont-student-${idx}`} style={{ borderBottom: '1px solid black', height: '23px' }}>
                          <td className="py-0.5 px-1 text-center font-black text-[9px] text-black" style={{ borderLeft: '1.5px solid black', backgroundColor: '#d1d5db' }}>
                            {s.id || idx + 1}
                          </td>
                          <td className="py-0.5 px-2 bg-white font-bold text-slate-900 text-[9px]">
                            {s.name || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  /* Grade 12 Table */
                  <table className="w-full text-right text-[8.5px] border-collapse leading-tight flex-1">
                    <thead>
                      <tr className="bg-slate-100 text-[#821315] font-black text-[8.5px] border-b border-[#000]">
                        <th className="py-1 px-1 border-l border-slate-300 text-center w-8 align-middle">م</th>
                        <th className="py-1 px-2 border-l border-slate-300 text-right w-36 align-middle">{language === 'ar' ? 'اسم الطالب/ة' : 'Student Name'}</th>
                        <th className="py-1 px-1.5 border-l border-slate-300 text-center w-12 align-middle">الصف</th>
                        <th className="py-1 px-2 border-l border-slate-300 w-18 align-middle">الأداة</th>
                        <th className="p-0 border-l border-slate-300 text-center w-24 align-top" colSpan={2}>
                          <div className="flex flex-col w-full h-full bg-slate-200">
                            <div className="flex items-center justify-center w-full font-black text-[12px] text-black py-0.5 border-b border-slate-300">
                              {language === 'ar' ? 'الدرجة' : 'Grade'}
                            </div>
                            <div className="grid grid-cols-2 text-[10px] font-black h-full">
                              <div className="flex items-center justify-center border-l border-slate-300 px-1 py-0.5">
                                {language === 'ar' ? 'قبل' : 'Before'}
                              </div>
                              <div className="flex items-center justify-center px-1 py-0.5">
                                {language === 'ar' ? 'بعد' : 'After'}
                              </div>
                            </div>
                          </div>
                        </th>
                        <th className="py-1 px-2 text-center border-l border-slate-300 font-black text-[11px] text-[#821315] align-middle">{language === 'ar' ? 'سبب التعديل' : 'Modification Reason'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#000] text-slate-900">
                      {auditStudents.map((s, idx) => (
                        <tr key={`audit-print-student-${s.id || idx}-${idx}`} className="bg-white">
                          <td className="py-1 px-1 border-l border-slate-300 text-center font-normal bg-slate-50 text-[#821315]">{s.id}</td>
                          <td className="py-1 px-2 border-l border-slate-300 font-normal whitespace-normal break-words text-slate-700">{s.name || '---'}</td>
                          <td className="py-1 px-1.5 border-l border-slate-300 text-center font-normal font-mono text-slate-600">{s.gradeClass}</td>
                          <td className="py-1 px-2 border-l border-slate-300 whitespace-normal break-words font-normal text-slate-700">{s.tool}</td>
                          <td className="py-1 px-0.5 border-l border-dashed border-slate-300 text-center font-mono font-black text-black text-[9px] bg-slate-50 w-12">{s.scoreBefore}</td>
                          <td className="py-1 px-0.5 border-l border-slate-300 text-center font-mono font-black text-red-900 text-[9.5px] bg-red-100/30 w-12">{s.scoreAfter}</td>
                          <td className="py-1 px-2 text-center border-l border-slate-300 font-bold whitespace-normal break-words text-[9.5px] text-slate-800">
                            {['1', '2', '3', '4', '5', '6'].includes(s.reason?.trim() || '') ? (
                              <span className="font-mono text-[#821315] font-black text-[11.5px] bg-slate-100 px-1 py-0.5 rounded">{s.reason}</span>
                            ) : (
                              <span className="text-black font-black block text-center text-[9.5px]">{s.reason === 'لا يوجد' || !s.reason ? (language === 'ar' ? 'لا يوجد' : 'None') : s.reason}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Left col-span-7: Technical Observations & Continuous Assessment Tools */}
              <div className="col-span-7 border border-black rounded overflow-hidden flex flex-col justify-between">
                {!isGrade12 ? (
                  /* Grades 1-11 Print: Assessment Tools & Technical Observations Table */
                  <table className="w-full text-right text-[9px] border-collapse leading-tight flex-1" style={{ border: '1.5px solid black' }}>
                    <thead>
                      <tr className="bg-slate-200 text-black font-black text-center" style={{ backgroundColor: '#d1d5db', borderBottom: '1.5px solid black' }}>
                        <th className="py-1 px-1 border-l border-black text-center text-[8.5px] leading-tight font-black" style={{ width: '28%', borderLeft: '1.5px solid black', backgroundColor: '#d1d5db' }}>
                          أدوات<br />التقويم<br />المستمر
                        </th>
                        <th className="py-1 px-2 text-center text-[9.5px] font-black" style={{ backgroundColor: '#d1d5db' }}>
                          الملاحظات الفنية وجوانب التطوير
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditObservations.slice(0, 4).map((obs, idx) => (
                        <tr key={`audit-print-cont-obs-${idx}`} style={{ borderBottom: '1px solid black', height: '34.5px' }}>
                          <td className="py-1 px-1 text-center font-black text-[8px] text-slate-950 leading-snug" style={{ borderLeft: '1.5px solid black', backgroundColor: '#d1d5db' }}>
                            {obs.tool}
                          </td>
                          <td className="py-1 px-2 bg-white text-slate-900 text-[8.5px] leading-snug align-top">
                            {obs.notes ? (
                              <div className="font-semibold text-slate-850 leading-tight whitespace-pre-wrap">{obs.notes}</div>
                            ) : (
                              <div className="h-full min-h-[24px]">
                                {/* Space for handwriting */}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  /* Grade 12 Table */
                  <>
                    <div className="bg-slate-100 text-[#821315] px-2 py-0.5 text-[8.5px] font-black text-center border-b border-slate-300">
                      {language === 'ar' ? 'الملاحظات الفنية على أدوات التقويم المستمر - التقرير المعتمد للجنة الوزارية' : 'Technical Observations / Audit Comments (Grade 12)'}
                    </div>
                    <table className="w-full text-right text-[8.5px] border-collapse leading-tight flex-1">
                      <thead>
                        <tr className="bg-slate-50 text-slate-650 font-black text-[8px] border-b border-slate-300">
                          <th className="py-1 px-2 border-l border-slate-300 text-center w-20">الصف</th>
                          <th className="py-1 px-2 border-l border-slate-300 w-48">أداة التقويم</th>
                          <th className="py-1 px-2">موجز الملاحظات الوزارية والفنية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 text-slate-900 bg-white">
                        {auditObservations.map((obs, idx) => (
                          <tr key={`audit-print-obs-${obs.id || idx}-${idx}`}>
                            <td className="py-1 px-2 border-l border-slate-300 text-center font-normal bg-slate-50 text-[#831215]">{obs.gradeClass}</td>
                            <td className="py-1 px-2 border-l border-slate-300 font-normal whitespace-normal break-words text-slate-700">{obs.tool}</td>
                            <td className="py-1 px-2 text-slate-950 font-black text-center whitespace-normal break-words leading-relaxed text-[11px]">{language === 'ar' ? `ملاحظة رقم ${obs.id}` : `Observation No. (${obs.id})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

            </div>
          </div>

          {/* Beautiful Bottom Footer Bar */}
          <div className="border border-slate-400 rounded bg-white mt-3">
            <div className="flex w-full text-[9px]" dir="rtl" style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
              
              <div className="p-1.5 px-2.5 space-y-0.5 bg-white text-right" style={{ width: '50%', flex: '0 0 50%', boxSizing: 'border-box' }}>
                <span className="font-extrabold text-[#821315] block">برامج الإنماء والتمكين المهني المقترحة بالتقرير:</span>
                <p className="text-slate-800 font-bold leading-normal text-[8px]">{auditSuggestedDevelopment}</p>
              </div>

              <div className="p-1.5 px-2.5 space-y-0.5 border-r border-[#821315]/80 text-right" style={{ width: '18%', flex: '0 0 18%', boxSizing: 'border-box' }}>
                
                <span className="font-extrabold text-[#821315] block">مشرف فحص ومطابقة المادة:</span>
                <p className="text-slate-900 font-black text-[9px]">{auditExaminerName}</p>
                <div className="pt-1.5 text-[7.5px] text-slate-400">التوقيع الرسمي: ____________________</div>

              </div>

              <div className="p-1.5 px-2.5 border-r border-[#821315]/80 text-right" style={{ width: '32%', flex: '0 0 32%', boxSizing: 'border-box' }}>
                <div className="font-extrabold text-[#821315] block text-[8px] w-full">مدير المدرسة المصادق:</div>
                <div className="text-slate-800 font-bold text-[8px] mt-0.5 block w-full">{auditPrincipalName || 'أ. محمد بن راشد الجنيبي'}</div>
                <div className="text-[7px] text-slate-400 mt-1 block w-full">
                  <span className="font-mono text-[#821315] font-extrabold block w-full" style={{ direction: 'ltr' }}>
                    OM-SIG-1XCT85
                  </span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* --- IFRAME PRINT MODE EXPOSITION MODAL --- */}
      <AnimatePresence>
        {showIframePrintHelp && (
          <motion.div 
            key="app-iframe-print-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full text-right relative shadow-2xl border border-slate-150 space-y-6"
              style={{ direction: 'rtl' }}
            >
              <button
                onClick={() => setShowIframePrintHelp(false)}
                className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 animate-pulse" />
              </button>

              <div className="space-y-2 text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#821315]/10 text-[#821315] rounded-full text-[10.5px] font-black uppercase">
                  🖨️ {language === 'ar' ? 'دليل الطباعة والـ PDF المعتمد' : 'Printing & PDF Guide'}
                </span>
                <h3 className="text-lg font-black font-heading text-[#051C3F]">
                  {language === 'ar' ? 'طريقة طباعة وحفظ الاستمارة الرسمية كـ PDF' : 'How to print & save the official form as PDF'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {language === 'ar'
                    ? 'بسبب حماية متصفحات الويب لنظام الإطارات المضمنة (Iframe Sandbox) في موقع المعاينة، فإن واجهة الطباعة تتطلب تشغيل التطبيق في نافذة مستقلة أولاً باتباع الخطوات البسيطة التالية:'
                    : 'Due to secure browser sandboxing limitations within embedded iframes, please follow these steps to download your official ledger:'}
                </p>
              </div>

              {/* Numbered Steps */}
              <div className="space-y-4 pt-2 text-right">
                <div className="flex gap-3 items-start rtl:flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-[#821315] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-sm">
                    1
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs font-bold text-slate-800">
                      {language === 'ar' ? 'افتح التطبيق في نافذة مستقلة' : 'Open in a new separate browser tab'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                      {language === 'ar'
                        ? 'انقر على أيقونة "النافذة الخارجية" (مربع به سهم للأعلى أو Open in New Tab) المتواجدة في أعلى الطرف اليسار أو اليمين من شريط المعاينة بجوار صندوق عنوان الويب لفتح التطبيق في علامة تبويب كاملة.'
                        : 'Click the "Open in new tab" icon (square with an up-right arrow) at the top of the developer preview panel next to the URL bar.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start rtl:flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-[#821315] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-sm">
                    2
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs font-bold text-slate-800">
                      {language === 'ar' ? 'اضغط زر الطباعة المعتمد' : 'Click the print button again'}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                      {language === 'ar'
                        ? 'في الصفحة المستقلة الجديدة، اذهب إلى نفس لوحة "استمارة الفحص" واضغط نفس هذا الزر مجدداً "طباعة وحفظ كـ PDF رسمي معتمد" لتفتح لك شاشة الطباعة فوراً!'
                        : 'Inside your newly opened separate browser window, click this "Print & Save Certified PDF" button again to launch the native browser print window immediately!'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start rtl:flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-sm">
                    3
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs font-bold text-emerald-850 font-sans">
                      {language === 'ar' ? 'ضبط إعدادات الحفظ غاية في الأهمية' : 'Configure Print Settings (Crucial for MOE Design Specs)'}
                    </p>
                    <p className="text-[11px] text-slate-550 leading-relaxed font-sans">
                      {language === 'ar'
                        ? 'يرجى تغيير الاتجاه في نافذة الطباعة إلى الاتجاه الأفقي (Landscape) والتأكد من تفعيل مربع خيار "طباعة الخلفيات والرسومات الملونه" (Background Graphics) للحصول على التصميم البصري بالختم الرسمي لسلطنة عُمان.'
                        : 'Ensure page layout is set to A4 Landscape, and check "Background Graphics" in your browser print options to capture our full high-fidelity colors, headers, and seals.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIframePrintHelp(false)}
                  className="w-full py-3 bg-[#0b5e32] hover:bg-[#0a4d29] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm text-center"
                >
                  {language === 'ar' ? 'فهمت التعليمات، شكراً لك' : 'I understand, thank you'}
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile-Friendly Fixed Bottom Navigation Bar for Smart Phones */}
      {userProfile && (
        <MobileBottomNav
          userProfile={userProfile}
          language={language}
          activeTab={activeTab}
          adminTab={adminTab}
          principalTab={principalTab}
          showUploadForm={showUploadForm}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setCurrentAssessment(null);
            setSelectedApprovedForm(null);
            setShowUploadForm(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onSelectAdminTab={(tab) => {
            setAdminTab(tab);
            setCurrentAssessment(null);
            setSelectedApprovedForm(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onSelectPrincipalTab={(tab) => {
            setPrincipalTab(tab);
            setCurrentAssessment(null);
            setSelectedApprovedForm(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onToggleUploadForm={(show) => {
            setShowUploadForm(show);
            setCurrentAssessment(null);
            setSelectedApprovedForm(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onLogout={handleSignOut}
        />
      )}

    </div>
  );
}


