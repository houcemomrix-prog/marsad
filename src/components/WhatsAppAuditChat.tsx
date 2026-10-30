import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  FileText, 
  Download, 
  CheckCheck, 
  ArrowRight, 
  Sparkles, 
  User, 
  School as SchoolIcon, 
  BookOpen, 
  ClipboardCheck,
  MoreVertical,
  Plus,
  FileUp,
  X,
  CheckCircle2,
  Clock,
  Eye,
  PenTool,
  ShieldCheck,
  Printer,
  QrCode
} from 'lucide-react';
import { UserProfile, Assessment, ArchivedForm } from '../types';
import { Language, translateGrade, translateSubject } from '../lib/translations';
import { 
  getSchoolUploadPermissionStatus, 
  transferArchivedFormToPrincipal, 
  signArchivedForm, 
  signArchivedTeacherForm 
} from '../services/db';
import { LOGO_OMAN_EMBLEM_B64 as logoOmanEmblem, LOGO_MOE_B64 as logoMoe, LOGO_VISION_B64 as logoVision } from '../data/logoDataUrls';
import { getActiveStamp } from './OmanPrincipalStamp';
import { printElementInIframe } from '../utils/pdfDownload';

export interface ChatMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'teacher' | 'moderator' | 'admin' | 'school' | 'system';
  text?: string;
  assessment?: Assessment;
  archivedForm?: ArchivedForm;
  isReadReceipt?: boolean;
  isArchivedFormCard?: boolean;
  createdAt: string;
}

interface WhatsAppAuditChatProps {
  userProfile: UserProfile;
  teacherName: string;
  schoolName: string;
  subjectName: string;
  assessments: Assessment[];
  archivedForms?: ArchivedForm[];
  language: Language;
  onBack?: () => void;
  onStartAuditForm: (teacherName: string, schoolName: string, subjectName: string, assessment: Assessment | null) => void;
  onUploadNewFile?: (payload: {
    title: string;
    type: string;
    grade: string;
    subject: string;
    description: string;
    questions: string;
    keyAnswer: string;
    isPdf: boolean;
    pdfName?: string;
    pdfSize?: string;
    pdfData?: string;
  }) => Promise<void>;
  onTeacherSignAndForward?: (archiveId: string, teacherName: string, qrData: string) => Promise<void>;
  onAdminForwardToTeacher?: (archiveId: string, adminName: string) => Promise<void>;
  onAdminForwardToPrincipal?: (archiveId: string, adminName: string) => Promise<void>;
  onPrincipalSign?: (archiveId: string, principalName: string, qrData: string, stampUrl?: string) => Promise<void>;
  onMarkReadByExaminer?: (assessmentId: string, examinerName: string) => Promise<void>;
  onPreviewForm?: (form: ArchivedForm) => void;
  onDownloadForm?: (form: ArchivedForm) => void;
  actionLoading?: boolean;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export function WhatsAppAuditChat({
  userProfile,
  teacherName,
  schoolName,
  subjectName,
  assessments,
  archivedForms = [],
  language,
  onBack,
  onStartAuditForm,
  onUploadNewFile,
  onTeacherSignAndForward,
  onAdminForwardToTeacher,
  onAdminForwardToPrincipal,
  onPrincipalSign,
  onMarkReadByExaminer,
  onPreviewForm,
  onDownloadForm,
  actionLoading = false,
  onSuccess,
  onError
}: WhatsAppAuditChatProps) {
  const isAuditor = userProfile.role === 'moderator' || (userProfile.role === 'admin' && userProfile.jobTitle?.includes('مدقق'));
  const isPrincipal = Boolean(
    userProfile.role === 'school' &&
    (userProfile.roleType === 'administrative' ||
      userProfile.jobTitle?.includes('مدير') ||
      userProfile.email === 'school@moe.om' ||
      userProfile.roleType !== 'teacher')
  );
  const isTeacher = Boolean(userProfile.role === 'school' && !isPrincipal);
  const isAdmin = userProfile.role === 'admin';

  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewFormModal, setPreviewFormModal] = useState<ArchivedForm | null>(null);
  const [signingInProgressId, setSigningInProgressId] = useState<string | null>(null);

  // Quick File Upload state inside chat
  const [fileTitle, setFileTitle] = useState('');
  const [fileDocType, setFileDocType] = useState('اختبار قصير 1');
  const [fileGrade, setFileGrade] = useState('Grade 10');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const cleanName = (raw?: string): string => {
    if (!raw) return '';
    let name = raw.trim();
    name = name.replace(/^أ\.\s*/, '').replace(/^د\.\s*/, '').replace(/\s*\(.*?\)/g, '');
    if (name.includes('@')) {
      name = name.split('@')[0].replace(/[._-]/g, ' ');
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    return name;
  };

  const cleanExaminerName = (raw?: string): string => {
    const cleaned = cleanName(raw);
    return cleaned || 'مشرف المادة';
  };

  const cleanTeacherName = (raw?: string): string => {
    const cleaned = cleanName(raw);
    return cleaned || 'معلم المادة';
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Step 1: When Examiner/Auditor opens the chat, automatically register the Read Receipt
  useEffect(() => {
    if (userProfile.role === 'moderator' && onMarkReadByExaminer) {
      assessments.forEach((ass) => {
        if (!ass.readByExaminer && !ass.examinerReadReceiptLogged) {
          onMarkReadByExaminer(ass.id, userProfile.name);
        }
      });
    }
  }, [userProfile, assessments, onMarkReadByExaminer]);

  // Convert assessments, receipts, forms and comments into timeline chat messages
  useEffect(() => {
    const list: ChatMessageItem[] = [];

    // Add initial greeting message
    list.push({
      id: 'system_welcome',
      senderId: 'system',
      senderName: 'نظام المتابعة والتدقيق التربوي',
      senderRole: 'system',
      text: language === 'ar'
        ? `مرحباً بك في غرفة المحادثة المباشرة المعتمدة للتدقيق الفني والمتابعة الإشرافية الخاصة بمادة ${subjectName || 'المادة الأكاديمية'}. جميع الملفات والملاحظات والاستمارات موثقة في سجل التدقيق المعتمد.`
        : `Welcome to the official accredited auditing stream for ${subjectName || 'Subject'}. All documents, receipts and moderation forms are logged in the national ledger.`,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
    });

    // Sort assessments chronologically for chat flow
    const sortedAssessments = [...assessments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    sortedAssessments.forEach((ass) => {
      // 1. Teacher uploaded file message
      list.push({
        id: `ass_msg_${ass.id}`,
        senderId: ass.schoolId || 'teacher_uid',
        senderName: ass.teacherName || ass.schoolName || teacherName,
        senderRole: 'teacher',
        text: ass.description || (language === 'ar' ? 'تم رفع ملف التقييم المعتمد للتدقيق والمطابقة.' : 'Uploaded assessment document for audit.'),
        assessment: ass,
        createdAt: ass.createdAt
      });

      // 2. Read Receipt message: "تمت القراءة من قبل : المدقق أ. [اسم المدقق]"
      if (ass.readByExaminer || ass.examinerReadReceiptLogged) {
        const examinerDisplayName = ass.readByExaminer?.name || (userProfile.role === 'moderator' ? userProfile.name : 'سالم الحارثي');
        list.push({
          id: `read_receipt_${ass.id}`,
          senderId: 'examiner_receipt',
          senderName: examinerDisplayName,
          senderRole: 'moderator',
          isReadReceipt: true,
          text: language === 'ar'
            ? `تمت القراءة من قبل : المدقق أ. ${cleanExaminerName(examinerDisplayName)}`
            : `Read receipt confirmed by Examiner: ${examinerDisplayName}`,
          createdAt: ass.readByExaminer?.timestamp || new Date(new Date(ass.createdAt).getTime() + 1000 * 60 * 15).toISOString()
        });
      }

      // 3. Feedback message if any
      if (ass.feedback) {
        list.push({
          id: `feedback_msg_${ass.id}`,
          senderId: ass.moderatorId || 'mod_uid',
          senderName: ass.moderatorName || 'أ. مشرف المادة',
          senderRole: 'moderator',
          text: `[ملاحظات التدقيق على "${ass.title}"]:\n${ass.feedback}`,
          createdAt: ass.updatedAt || ass.createdAt
        });
      }
    });

    // 4. Matching Archived Forms (Strictly 1 Form per Teacher: "استمارة أ. [اسم المعلم]")
    const strictMatches = archivedForms.filter((f) => {
      const tClean = cleanTeacherName(teacherName).toLowerCase();
      const formTClean = cleanTeacherName(f.teacherName).toLowerCase();
      if (tClean && formTClean && (tClean === formTClean || tClean.includes(formTClean) || formTClean.includes(tClean))) return true;
      if (f.assessmentId && assessments.some((a) => a.id === f.assessmentId)) return true;
      return false;
    });

    const matchingForms = strictMatches.slice(0, 1);

    matchingForms.forEach((form) => {
      list.push({
        id: `form_card_${form.id}`,
        senderId: form.examinerName || 'examiner_uid',
        senderName: form.examinerName || 'المدقق التربوي',
        senderRole: 'moderator',
        isArchivedFormCard: true,
        archivedForm: form,
        createdAt: form.examinerSignedAt || form.updatedAt || form.createdAt
      });
    });

    setChatMessages(list);
    setPreviewFormModal((prev) => {
      if (!prev) return null;
      return archivedForms.find((f) => f.id === prev.id) || prev;
    });
  }, [assessments, archivedForms, teacherName, schoolName, subjectName, language, userProfile]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSendTextMessage = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessageItem = {
      id: `text_${Date.now()}`,
      senderId: userProfile.uid,
      senderName: userProfile.name,
      senderRole: userProfile.role === 'moderator' ? 'moderator' : (userProfile.roleType === 'teacher' ? 'teacher' : 'school'),
      text: inputText.trim(),
      createdAt: new Date().toISOString()
    };

    setChatMessages((prev) => [...prev, newMsg]);
    setInputText('');
    if (onSuccess) {
      onSuccess(language === 'ar' ? 'تم إرسال الرسالة بنجاح' : 'Message sent');
    }
  };

  const handleProcessFileSelect = (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      if (onError) onError(language === 'ar' ? 'الملف يجب أن يكون بصيغة PDF فقط.' : 'Only PDF files allowed.');
      return;
    }
    const rawClean = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setFileTitle(rawClean);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setFileBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmFileUpload = async () => {
    if (!selectedFile || !fileTitle.trim()) {
      if (onError) onError(language === 'ar' ? 'يرجى اختيار ملف وكتابة عنوان التقييم' : 'Please select file and title');
      return;
    }

    if (!onUploadNewFile) return;

    if (userProfile.schoolName) {
      const perm = await getSchoolUploadPermissionStatus(userProfile.schoolName);
      if (!perm.canTeacherUpload) {
        if (onError) {
          onError(
            language === 'ar'
              ? 'عذراً، صلاحية رفع الملفات مغلقة لمدرستك. يجب أولاً فتح الصلاحية من مدير النظام ثم مدير المدرسة وفق خطة الفحص.'
              : 'Upload permission is currently locked for your school.'
          );
        }
        return;
      }
    }

    try {
      const formatBytes = (bytes: number) => {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      };

      await onUploadNewFile({
        title: fileTitle.trim(),
        type: fileDocType,
        grade: fileGrade,
        subject: subjectName || userProfile.subject || 'الرياضيات',
        description: language === 'ar' ? 'تم الرفع عبر محادثة التدقيق المباشرة.' : 'Uploaded via audit conversation stream.',
        questions: `[مرفق PDF في المحادثة]: ${selectedFile.name}`,
        keyAnswer: `[نموذج الإجابة والدرجات متضمن في الملف المرفق]`,
        isPdf: true,
        pdfName: selectedFile.name,
        pdfSize: formatBytes(selectedFile.size),
        pdfData: fileBase64
      });

      setShowUploadModal(false);
      setSelectedFile(null);
      setFileTitle('');
      setFileBase64('');
    } catch (err: any) {
      if (onError) onError(err.message || 'Error uploading file');
    }
  };

  // Action: Teacher signs and forwards to school principal (Strictly Teacher only)
  const handleTeacherSign = async (form: ArchivedForm) => {
    if (!isTeacher) return;
    setSigningInProgressId(form.id);
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let b1 = '';
      let b2 = '';
      for (let i = 0; i < 4; i++) {
        b1 += chars.charAt(Math.floor(Math.random() * chars.length));
        b2 += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const secureToken = `OM-TCH-${b1}-${b2}`;
      const signName = form.teacherName || userProfile.name || 'أ. معلم المادة';

      if (onTeacherSignAndForward) {
        await onTeacherSignAndForward(form.id, signName, secureToken);
      } else {
        await signArchivedTeacherForm(form.id, signName, secureToken);
      }

      // Add success chat message
      const ackMsg: ChatMessageItem = {
        id: `ack_msg_${Date.now()}`,
        senderId: userProfile.uid,
        senderName: signName,
        senderRole: 'teacher',
        text: language === 'ar'
          ? `✓ تم التوقيع بالعلم من قبل أ. ${cleanTeacherName(signName)}، وتم تحويل الاستمارة مباشرة لمدير المدرسة للاعتماد والختم.`
          : `Signed and acknowledged by Teacher ${cleanTeacherName(signName)}. Transferred to School Principal for final seal & sign-off.`,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, ackMsg]);

      if (onSuccess) {
        onSuccess(
          language === 'ar'
            ? '✓ تم توقيع الاستمارة بالعلم وتحويلها لمدير المدرسة بنجاح!'
            : 'Form signed and forwarded to School Principal successfully!'
        );
      }
    } catch (err: any) {
      if (onError) onError(err.message || 'Error signing form');
    } finally {
      setSigningInProgressId(null);
    }
  };

  // Action: Admin forwards form to School Principal for signature & seal (Strictly Admin only)
  const handleAdminForward = async (form: ArchivedForm) => {
    if (!isAdmin) return;
    const fwdHandler = onAdminForwardToPrincipal || onAdminForwardToTeacher;
    setSigningInProgressId(form.id);
    try {
      if (fwdHandler) {
        await fwdHandler(form.id, userProfile.name);
      } else {
        await transferArchivedFormToPrincipal(form.id, userProfile.name || 'مدير النظام');
      }
      const fwdMsg: ChatMessageItem = {
        id: `fwd_msg_${Date.now()}`,
        senderId: userProfile.uid,
        senderName: userProfile.name || 'مدير النظام',
        senderRole: 'admin',
        text: language === 'ar'
          ? `تم الاطلاع على الاستمارة من قبل مدير النظام، وتحويلها لمدير المدرسة للاعتماد والختم.`
          : `Reviewed by System Admin and transferred to School Principal for certification and seal.`,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, fwdMsg]);
      if (onSuccess) {
        onSuccess(language === 'ar' ? '✓ تم تحويل الاستمارة لمدير المدرسة بنجاح!' : 'Transferred to School Principal successfully!');
      }
    } catch (err: any) {
      if (onError) onError(err.message || 'Error forwarding form');
    } finally {
      setSigningInProgressId(null);
    }
  };

  // Action: Principal signs and stamps form (Strictly Principal only)
  const handlePrincipalSign = async (form: ArchivedForm) => {
    if (!isPrincipal) return;
    setSigningInProgressId(form.id);
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let b1 = '';
      let b2 = '';
      for (let i = 0; i < 4; i++) {
        b1 += chars.charAt(Math.floor(Math.random() * chars.length));
        b2 += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const secureToken = `OM-DIR-${b1}-${b2}`;
      const pName = form.principalName || userProfile.name || 'أ. مدير المدرسة';

      if (onPrincipalSign) {
        await onPrincipalSign(form.id, pName, secureToken, 'official_moe_stamp');
      } else {
        await signArchivedForm(form.id, pName, secureToken, 'official_moe_stamp');
      }

      const approvedMsg: ChatMessageItem = {
        id: `p_appr_msg_${Date.now()}`,
        senderId: userProfile.uid,
        senderName: pName,
        senderRole: 'school',
        text: language === 'ar'
          ? `✓ تم اعتماد وختم الاستمارة رسمياً من قبل مدير المدرسة أ. ${cleanName(pName)}.`
          : `Officially certified and stamped by School Principal ${cleanName(pName)}.`,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, approvedMsg]);
      if (onSuccess) {
        onSuccess(language === 'ar' ? '✓ تم اعتماد وختم الاستمارة من قبل مدير المدرسة بنجاح!' : 'Certified and stamped successfully!');
      }
    } catch (err: any) {
      if (onError) onError(err.message || 'Error signing form');
    } finally {
      setSigningInProgressId(null);
    }
  };

  const handleDownloadForm = (form: ArchivedForm) => {
    if (onDownloadForm) {
      onDownloadForm(form);
      return;
    }
    // Fallback: opens preview and triggers print dialog
    setPreviewFormModal(form);
    setTimeout(() => {
      printElementInIframe('chat-form-preview-document');
    }, 450);
  };

  const latestAssessment = assessments[0] || null;
  const displayTeacherName = cleanTeacherName(teacherName);

  return (
    <div className="flex flex-col w-full h-[84vh] sm:h-[86vh] min-h-[620px] max-h-[calc(100vh-95px)] bg-[#efeae2] dark:bg-[#0b141a] rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden font-sans relative" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* 🟢 WHATSAPP HEADER */}
      <div className="bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 sm:px-5 py-3 flex items-center justify-between shrink-0 shadow-md z-20 sticky top-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white shrink-0 cursor-pointer"
              title={language === 'ar' ? 'العودة' : 'Back'}
            >
              <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
            </button>
          )}

          {/* Teacher Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-700 text-white font-extrabold flex items-center justify-center text-sm border-2 border-white/30 shadow-xs">
              {displayTeacherName ? displayTeacherName.charAt(0) : 'م'}
            </div>
            <span className="w-3.5 h-3.5 bg-emerald-400 border-2 border-[#075e54] rounded-full absolute bottom-0 left-0"></span>
          </div>

          {/* Teacher & Subject Title */}
          <div className="min-w-0 text-right rtl:text-right ltr:text-left">
            <h3 className="font-extrabold text-xs sm:text-sm text-white truncate leading-tight font-heading">
              أ. {displayTeacherName}
            </h3>
            <p className="text-[10.5px] text-emerald-100/90 truncate flex items-center gap-1 mt-0.5">
              <span>{schoolName}</span>
              <span>•</span>
              <span className="font-bold">{translateSubject(subjectName, language)}</span>
            </p>
          </div>
        </div>

        {/* Header Right Action Tools */}
        <div className="flex items-center gap-1 sm:gap-2 text-emerald-100 shrink-0">
          <span className="text-[10px] bg-emerald-800/80 text-emerald-100 px-2.5 py-1 rounded-full font-bold">
            💬 {language === 'ar' ? 'محادثة التدقيق المعتمدة' : 'Official Audit Chat'}
          </span>
        </div>
      </div>

      {/* 💬 CHAT MESSAGES CANVAS AREA */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 bg-repeat"
        style={{
          backgroundImage: `radial-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 0)`,
          backgroundSize: '16px 16px',
          overscrollBehavior: 'contain'
        }}
      >
        {chatMessages.map((msg, index) => {
          // 1. Read Receipt Banner: "تمت القراءة من قبل : المدقق أ. .........."
          if (msg.isReadReceipt) {
            return (
              <div key={msg.id || `receipt_${index}`} className="flex justify-center my-3 animate-in fade-in duration-200">
                <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-100 px-4 py-2 rounded-2xl shadow-xs flex items-center gap-2.5 text-xs font-bold leading-normal">
                  <div className="p-1 bg-emerald-600 text-white rounded-full">
                    <CheckCheck className="w-3.5 h-3.5" />
                  </div>
                  <span>{msg.text}</span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          }

          // 2. System Announcement Message
          if (msg.senderRole === 'system' || msg.senderId === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-amber-100/90 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 text-amber-900 dark:text-amber-200 text-[10.5px] font-medium px-4 py-2 rounded-2xl max-w-lg text-center shadow-2xs leading-relaxed">
                  <span className="font-extrabold block text-amber-950 dark:text-amber-100 mb-0.5">ℹ️ {msg.senderName}</span>
                  {msg.text}
                </div>
              </div>
            );
          }

          // 3. Form Card in Chat: "استمارة أ. [اسم المعلم]" with 3 action buttons
          if (msg.isArchivedFormCard && msg.archivedForm) {
            const form = msg.archivedForm;
            const formTeacher = cleanTeacherName(form.teacherName);
            const formExaminer = cleanExaminerName(form.examinerName);

            // Workflow Stage Badge
            let stageBadge = {
              text: 'بانتظار المتابعة',
              classes: 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300'
            };
            if (form.workflowStage === 'completed' || (form.isSigned && form.isTeacherSigned)) {
              stageBadge = {
                text: '✓ معتمدة ومكتملة بجميع التوقيعات والختم',
                classes: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-400 font-black'
              };
            } else if (form.workflowStage === 'principal_signed_transferred_to_teacher' || form.isSigned) {
              stageBadge = {
                text: 'محالة لـ: 4. توقيع المعلم',
                classes: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 border-indigo-400 font-bold'
              };
            } else if (form.workflowStage === 'admin_transferred_to_principal') {
              stageBadge = {
                text: 'محالة لـ: 3. توقيع وختم مدير المدرسة وتحويل للمعلم',
                classes: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-400 font-bold'
              };
            } else if (form.workflowStage === 'examiner_submitted_to_admin' || !form.workflowStage) {
              stageBadge = {
                text: 'محالة لـ: 2. تحويل لمدير المدرسة',
                classes: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-400 font-bold'
              };
            }

            return (
              <div key={msg.id || `form_card_${index}`} className="flex justify-center my-3 w-full">
                <div className="w-full max-w-xl bg-gradient-to-br from-amber-50 via-white to-amber-50/50 dark:from-slate-900 dark:via-[#1c272e] dark:to-slate-900 border-2 border-amber-400/80 dark:border-amber-500/50 rounded-2xl p-4 shadow-lg space-y-3 text-right rtl:text-right ltr:text-left">
                  
                  {/* Header of Form Card: "استمارة أ. [اسم المعلم]" */}
                  <div className="flex items-start justify-between gap-2 border-b border-amber-200 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl shadow-xs">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 font-heading">
                          استمارة أ. {formTeacher}
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          {form.subjectName || form.subject} • {translateGrade(form.grade, language)}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (form.workflowStage === 'examiner_submitted_to_admin' || !form.workflowStage) && !form.isSigned && !form.isTeacherSigned ? (
                      <button
                        type="button"
                        onClick={() => handleAdminForward(form)}
                        disabled={signingInProgressId === form.id}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 hover:scale-[1.02]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري التحويل...' : 'Transferring...'}</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'تحويل لمدير المدرسة' : 'Forward to Principal'}</span>
                          </>
                        )}
                      </button>
                    ) : isPrincipal && !form.isSigned ? (
                      <button
                        type="button"
                        onClick={() => handlePrincipalSign(form)}
                        disabled={signingInProgressId === form.id}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 hover:scale-[1.02]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري الاعتماد...' : 'Signing...'}</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                            <span>{language === 'ar' ? 'توقيع وختم مدير المدرسة وتحويل للمعلم' : 'Principal Sign, Stamp & Forward'}</span>
                          </>
                        )}
                      </button>
                    ) : isTeacher && (form.workflowStage === 'principal_signed_transferred_to_teacher' || (form.isSigned && !form.isTeacherSigned)) && form.workflowStage !== 'completed' ? (
                      <button
                        type="button"
                        onClick={() => handleTeacherSign(form)}
                        disabled={signingInProgressId === form.id}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 hover:scale-[1.02]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري التوقيع...' : 'Signing...'}</span>
                          </>
                        ) : (
                          <>
                            <PenTool className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'توقيع المعلم' : 'Teacher Signature'}</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold shrink-0 ${stageBadge.classes}`}>
                        {stageBadge.text}
                      </span>
                    )}
                  </div>

                  {/* Form Audit Metadata Overview */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-amber-200/50 dark:border-slate-700/50">
                    <div>
                      <span className="text-slate-400 dark:text-slate-400 block text-[9.5px]">المفحوص / المعلم:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">أ. {formTeacher}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-400 block text-[9.5px]">المدقق الفاحص:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">أ. {formExaminer}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-400 block text-[9.5px]">تاريخ الزيارة / التدقيق:</span>
                      <span className="font-mono font-bold">{form.visitDate || new Date(form.createdAt).toLocaleDateString('ar-OM')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-400 block text-[9.5px]">حالة المطابقة:</span>
                      <span className={`font-bold ${form.conformanceStatus === 'conforming' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {form.conformanceStatus === 'conforming' ? '✓ مطابقة للمعايير' : 'تحت التدقيق'}
                      </span>
                    </div>
                  </div>

                  {/* 🌟 ACTION BUTTONS: تحميل / معاينة / [الزر الثالث بحسب مرحلة المعالجة ودور المستخدم] */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/50 dark:border-slate-800">
                    
                    {/* 1. تحميل */}
                    <button
                      type="button"
                      onClick={() => handleDownloadForm(form)}
                      className="flex-1 min-w-[90px] py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs border border-slate-300/80 dark:border-slate-700"
                    >
                      <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{language === 'ar' ? 'تحميل' : 'Download'}</span>
                    </button>

                    {/* 2. معاينة */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onPreviewForm) onPreviewForm(form);
                        setPreviewFormModal(form);
                      }}
                      className="flex-1 min-w-[90px] py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs border border-slate-300/80 dark:border-slate-700"
                    >
                      <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>{language === 'ar' ? 'معاينة' : 'Preview'}</span>
                    </button>

                    {/* 3. Stage Action Button for Stage 2: تحويل لمدير المدرسة (للمدير النظام فقط) */}
                    {isAdmin && (form.workflowStage === 'examiner_submitted_to_admin' || !form.workflowStage) && !form.isSigned && !form.isTeacherSigned && (
                      <button
                        type="button"
                        onClick={() => handleAdminForward(form)}
                        disabled={signingInProgressId === form.id}
                        className="flex-[1.5] min-w-[170px] py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs hover:scale-[1.01]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري التحويل...' : 'Transferring...'}</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-4 h-4" />
                            <span>{language === 'ar' ? 'تحويل لمدير المدرسة' : 'Forward to Principal'}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Stage Action Button for Stage 3: توقيع وختم مدير المدرسة وتحويل للمعلم (لمدير المدرسة فقط) */}
                    {isPrincipal && !form.isSigned && (
                      <button
                        type="button"
                        onClick={() => handlePrincipalSign(form)}
                        disabled={signingInProgressId === form.id}
                        className="flex-[1.5] min-w-[170px] py-2 px-3 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs hover:scale-[1.01]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري الاعتماد والختم...' : 'Signing...'}</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4 text-amber-300" />
                            <span>{language === 'ar' ? 'توقيع وختم مدير المدرسة وتحويل للمعلم' : 'Principal Sign, Stamp & Forward to Teacher'}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Stage Action Button for Stage 4: توقيع المعلم (للمعلم فقط) */}
                    {isTeacher && (form.workflowStage === 'principal_signed_transferred_to_teacher' || (form.isSigned && !form.isTeacherSigned)) && form.workflowStage !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleTeacherSign(form)}
                        disabled={signingInProgressId === form.id}
                        className="flex-[1.5] min-w-[170px] py-2 px-3 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs hover:scale-[1.01]"
                      >
                        {signingInProgressId === form.id ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full font-bold"></span>
                            <span>{language === 'ar' ? 'جاري التوقيع...' : 'Signing...'}</span>
                          </>
                        ) : (
                          <>
                            <PenTool className="w-4 h-4" />
                            <span>{language === 'ar' ? 'توقيع المعلم' : 'Teacher Signature'}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Stage Completed Status Badge */}
                    {(form.workflowStage === 'completed' || (form.isSigned && form.isTeacherSigned)) && (
                      <div className="flex-1 min-w-[140px] py-2 px-3 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border border-emerald-300 dark:border-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{language === 'ar' ? '✓ مكتملة ومعتمدة' : '✓ Completed'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // 4. Standard Chat Message Bubble
          const isMe = msg.senderId === userProfile.uid || (isAuditor && msg.senderRole === 'moderator') || (isTeacher && msg.senderRole === 'teacher');

          return (
            <div 
              key={msg.id || `msg_${index}`}
              className={`flex flex-col ${isMe ? 'items-start rtl:items-start ltr:items-end' : 'items-end rtl:items-end ltr:items-start'} my-1`}
            >
              <div 
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-xs relative text-right rtl:text-right ltr:text-left ${
                  isMe 
                    ? 'bg-[#dcf8c6] dark:bg-[#005c4b] text-slate-900 dark:text-slate-100 rounded-tr-none rtl:rounded-tr-2xl rtl:rounded-tl-none' 
                    : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 rounded-tl-none rtl:rounded-tl-2xl rtl:rounded-tr-none'
                }`}
              >
                {/* Sender Name Header */}
                <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/10 pb-1 mb-2">
                  <span className={`text-[10px] font-extrabold ${isMe ? 'text-emerald-800 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                    أ. {cleanName(msg.senderName)} ({msg.senderRole === 'teacher' ? (language === 'ar' ? 'المعلم' : 'Teacher') : (language === 'ar' ? 'المدقق' : 'Auditor')})
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Optional Message Text */}
                {msg.text && (
                  <p className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-line font-medium mb-2">
                    {msg.text}
                  </p>
                )}

                {/* 📄 FILE ATTACHMENT CARD */}
                {msg.assessment && (
                  <div className="bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 mt-1 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl shrink-0 border border-rose-200/60">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {msg.assessment.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                              {translateGrade(msg.assessment.grade, language)}
                            </span>
                            <span>•</span>
                            <span className="font-mono">{msg.assessment.pdfSize || 'PDF'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Download Action inside Chat Card */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {msg.assessment.pdfData && (
                        <button
                          type="button"
                          onClick={() => {
                            if (msg.assessment?.pdfData?.startsWith('data:')) {
                              const link = document.createElement('a');
                              link.href = msg.assessment.pdfData;
                              link.download = msg.assessment.pdfName || `${msg.assessment.title}.pdf`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            } else if (msg.assessment?.pdfData) {
                              window.open(msg.assessment.pdfData, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'تنزيل ملف الـ PDF' : 'Download PDF'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Double checkmarks */}
                <div className="flex justify-end items-center gap-1 mt-1 text-[9px] text-emerald-700 dark:text-emerald-400">
                  <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 🔴 PROMINENT AUDITOR ACTION BAR AT THE BOTTOM: One Form Per Teacher */}
      {isAuditor && (() => {
        const existingTeacherForm = archivedForms.find((f) => {
          const tClean = cleanTeacherName(teacherName).toLowerCase();
          const formTClean = cleanTeacherName(f.teacherName).toLowerCase();
          if (tClean && formTClean && (tClean === formTClean || tClean.includes(formTClean) || formTClean.includes(tClean))) return true;
          if (f.assessmentId && assessments.some((a) => a.id === f.assessmentId)) return true;
          return false;
        });

        if (existingTeacherForm) {
          return (
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 text-white py-2 px-3 sm:px-4 shadow-lg flex items-center justify-between gap-2.5 shrink-0 border-t border-emerald-500/40 sticky bottom-0 z-20 mt-auto">
              <div className="flex items-center gap-2 text-right">
                <div className="p-1.5 bg-white/15 rounded-lg text-emerald-200 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-extrabold text-[11px] sm:text-xs text-white font-heading leading-tight">
                    {language === 'ar'
                      ? `تم إصدار استمارة التدقيق للمعلم (أ. ${displayTeacherName})`
                      : `Audit form already created for (${displayTeacherName})`}
                  </p>
                  <p className="text-[9.5px] sm:text-[10px] text-emerald-200 font-bold opacity-95 leading-tight">
                    {language === 'ar'
                      ? 'يُسمح للمدقق بعمل استمارة واحدة فقط لكل معلم'
                      : 'Auditor is allowed to create only one form per teacher'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewFormModal(existingTeacherForm)}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md hover:scale-[1.02] transition-all cursor-pointer shrink-0"
                id="view-existing-audit-form-btn"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-700" />
                <span>{language === 'ar' ? 'استعراض استمارة المعلم' : 'View Teacher Form'}</span>
              </button>
            </div>
          );
        }

        return (
          <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-slate-950 py-1.5 px-3 sm:px-4 shadow-lg flex items-center justify-between gap-2.5 shrink-0 border-t border-amber-400/50 sticky bottom-0 z-20 mt-auto">
            <div className="flex items-center gap-2 text-right">
              <div className="p-1.5 bg-slate-950/20 rounded-lg text-slate-950 shrink-0">
                <ClipboardCheck className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <p className="font-extrabold text-[11px] sm:text-xs text-slate-950 font-heading leading-tight">
                  {language === 'ar' ? 'جاهز لاعتماد وتدقيق العينات؟ (استمارة واحدة لكل معلم)' : 'Ready to fill evaluation audit form? (1 form per teacher)'}
                </p>
                <p className="text-[9.5px] sm:text-[10px] text-slate-900 font-bold opacity-90 leading-tight">
                  {language === 'ar'
                    ? `استمارة الفحص والتدقيق المستمر للمعلم (أ. ${displayTeacherName})`
                    : `Continuous assessment form for teacher (${displayTeacherName})`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onStartAuditForm(teacherName, schoolName, subjectName, latestAssessment)}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md hover:scale-[1.02] transition-all cursor-pointer border border-amber-400/40 shrink-0"
              id="start-audit-form-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>{language === 'ar' ? 'بدء ملء الاستمارة' : 'Start Filling Form'}</span>
            </button>
          </div>
        );
      })()}

      {/* 💬 CHAT INPUT BAR & FILE ATTACHMENT */}
      {!isAuditor && (
        <div className="bg-white dark:bg-[#1f2c34] p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0 sticky bottom-0 z-20">
          
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="p-2.5 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 rounded-xl transition-colors cursor-pointer shrink-0"
            title={language === 'ar' ? 'إرفاق ملف تقييم PDF للمحادثة' : 'Attach PDF File'}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendTextMessage();
            }}
            placeholder={
              language === 'ar' 
                ? `اكتب ملاحظة أو إجابة لـ أ. ${displayTeacherName}...` 
                : `Type a message or note...`
            }
            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 font-medium"
          />

          <button
            type="button"
            onClick={handleSendTextMessage}
            disabled={!inputText.trim()}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl transition-all cursor-pointer shrink-0 shadow-xs"
          >
            <Send className="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>
      )}

      {/* 📤 MODAL FOR QUICK FILE UPLOAD IN CHAT */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl relative text-right rtl:text-right ltr:text-left">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  {language === 'ar' ? 'رفع ملف تقييم داخل المحادثة' : 'Upload Assessment in Chat'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="border-2 border-dashed border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 rounded-2xl p-4 text-center cursor-pointer hover:bg-emerald-50/50 transition-colors">
                <input
                  type="file"
                  id="chat-modal-file-input"
                  className="hidden"
                  accept=".pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleProcessFileSelect(f);
                  }}
                />
                <label htmlFor="chat-modal-file-input" className="cursor-pointer space-y-2 block">
                  <FileText className="w-8 h-8 text-emerald-600 mx-auto" />
                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">{selectedFile.name}</p>
                      <p className="text-[10px] text-emerald-600 font-bold">✓ تم اختيار الملف بنجاح</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        {language === 'ar' ? 'اضغط هنا لاختيار ملف الـ PDF' : 'Click to select PDF document'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">PDF (الحد الأقصى 20 ميجابايت)</p>
                    </div>
                  )}
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                  {language === 'ar' ? 'عنوان الوثيقة أو التقييم' : 'Assessment Title'}
                </label>
                <input
                  type="text"
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: اختبار قصير 1 - الرياضيات' : 'e.g. Quiz 1 Mathematics'}
                  className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                    {language === 'ar' ? 'الصف' : 'Grade'}
                  </label>
                  <select
                    value={fileGrade}
                    onChange={(e) => setFileGrade(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800"
                  >
                    {[
                      'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
                      'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
                      'Grade 11', 'Grade 12'
                    ].map((g) => (
                      <option key={`chat-modal-grade-${g}`} value={g}>
                        {translateGrade(g, language)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                    {language === 'ar' ? 'الصيغة' : 'Format'}
                  </label>
                  <input
                    type="text"
                    value={fileDocType}
                    onChange={(e) => setFileDocType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionLoading || !selectedFile || !fileTitle.trim()}
                onClick={handleConfirmFileUpload}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-sm transition-all"
              >
                {actionLoading ? (language === 'ar' ? 'جاري الرفع...' : 'Uploading...') : (language === 'ar' ? 'إرسال الملف في المحادثة' : 'Send File')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📄 FULL OFFICIAL PREVIEW MODAL FOR "معاينة" */}
      {previewFormModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 max-w-4xl w-full shadow-2xl overflow-hidden my-4">
            
            {/* Modal Header */}
            <div className="bg-[#821315] text-white px-4 sm:px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base font-heading">
                  معاينة: استمارة أ. {cleanTeacherName(previewFormModal.teacherName)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printElementInIframe('chat-form-preview-document')}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة / حفظ PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFormModal(null)}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Content View - Official Ministry Landscape Form Layout */}
            <div className="p-4 sm:p-6 max-h-[78vh] overflow-auto bg-slate-100 dark:bg-slate-950" id="chat-form-preview-document">
              <div className="bg-white text-slate-900 border-2 border-[#821315] p-6 sm:p-8 rounded-2xl shadow-md space-y-4 min-w-[920px] mx-auto" dir="rtl">
                
                {/* Official Ministry Header */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-3 mb-4">
                  <div className="text-right flex items-center justify-start">
                    <img src={logoOmanEmblem} alt="شعار سلطنة عُمان" className="w-16 h-16 sm:w-20 sm:h-20 object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-[19px] sm:text-[21px] font-bold text-[#821315] font-sans leading-relaxed tracking-normal">
                      استمارة الفحص و التدقيق المستمر
                    </h2>
                    <p className="text-[13px] sm:text-[14px] text-slate-500 font-medium leading-relaxed font-sans">
                      عملية الفحص والتدقيق المستمر لمخرجات التعلم
                    </p>
                  </div>
                  <div className="text-left flex items-center justify-end">
                    <img src={logoVision} alt="رؤية عُمان 2040" className="w-20 h-14 sm:w-24 sm:h-16 object-contain" referrerPolicy="no-referrer" />
                  </div>
                </div>

                {/* Row 1: Unified Metadata block stretching horizontally with side-by-side specs and target teacher details */}
                <div className="flex flex-row gap-3.5 w-full" style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '14px' }}>
                  
                  {/* Form Specifications: 41.5% */}
                  <div className="border-2 border-[#821315] rounded overflow-hidden bg-white flex flex-col justify-between" style={{ width: '41.5%', flex: '0 0 41.5%', boxSizing: 'border-box' }}>
                    <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                      بيانات استمارة الفحص والتدقيق المستمر
                    </div>
                    <table className="w-full text-[15px] border-collapse h-full" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <tbody>
                        <tr className="border-b border-[#821315]/45 bg-slate-50/50">
                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>المادة الدراسية:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{previewFormModal.subjectName || previewFormModal.subject}</td>
                        </tr>
                        <tr className="border-b border-[#821315]/45">
                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>العام الدراسي:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '65%' }}>{previewFormModal.academicYear || '2025 / 2026 م'}</td>
                        </tr>
                        <tr className="bg-slate-50/50">
                          <td className="font-extrabold font-sans text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '35%' }}>الفصل الدراسي:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" style={{ width: '65%' }}>{previewFormModal.semester || 'الفصل الدراسي الثاني'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Target Teacher Profile: 57% */}
                  <div className="border-2 border-[#821315] rounded overflow-hidden bg-white" style={{ width: '57%', flex: '0 0 57%', boxSizing: 'border-box' }}>
                    <div className="bg-[#821315] text-white px-3 py-1.5 text-[15px] font-black text-center font-sans">
                      بيانات المعلم المستهدف بالفحص والمتابعة
                    </div>
                    <table className="w-full text-[15px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <tbody>
                        <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>الاسم:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{previewFormModal.teacherName}</td>
                        </tr>
                        <tr className="border-b border-[#821315]/45">
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>رقم الملف:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{previewFormModal.teacherFileNo || '---'}</td>
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>سنة التعيين:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{previewFormModal.appointmentYear || '---'}</td>
                        </tr>
                        <tr className="border-b border-[#821315]/45 bg-slate-50/20">
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المديرية:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 leading-normal whitespace-normal break-words text-[15px] align-middle" colSpan={3} style={{ width: '78%' }}>{previewFormModal.directorate || 'المديرية العامة للتربية والتعليم بمحافظة الوسطى'}</td>
                        </tr>
                        <tr className="border-b border-[#821315]/45">
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 align-middle" style={{ width: '22%' }}>المدرسة:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 whitespace-normal break-words align-middle" colSpan={3} style={{ width: '78%' }}>{previewFormModal.schoolName}</td>
                        </tr>
                        <tr className="bg-slate-50/20">
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>التخصص:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 font-sans whitespace-normal break-words align-middle" style={{ width: '28%' }}>{previewFormModal.subject}</td>
                          <td className="font-extrabold text-[#821315] py-2 px-2 border-l border-r border-[#821315]/45 font-sans align-middle" style={{ width: '22%' }}>تاريخ الزيارة:</td>
                          <td className="font-bold py-2 px-2 text-slate-800 font-mono whitespace-normal break-words align-middle" style={{ width: '28%' }}>{previewFormModal.visitDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Row 2: Side-by-Side Dual Tables matching official template */}
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
                        {Array.from({ length: 6 }).map((_, idx) => {
                          const s = previewFormModal.students && previewFormModal.students[idx];
                          return (
                            <tr key={`chat-preview-sample-${idx}`} className="border-b-2 border-black last:border-b-0 h-[46px]" style={{ borderBottom: '2px solid black' }}>
                              <td className="py-2 px-2 text-center font-black text-[15px] text-black" style={{ borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 bg-white font-bold text-slate-900 text-[15px]">
                                {s ? (s.name || '') : ''}
                              </td>
                            </tr>
                          );
                        })}
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
                        {Array.from({ length: 4 }).map((_, idx) => {
                          const defaultTools = ['اختبار قصير 1', 'عرض شفوي', 'سؤال قصير', 'واجب منزلي'];
                          const obs = previewFormModal.observations && previewFormModal.observations[idx];
                          const toolName = obs?.tool || defaultTools[idx];
                          const noteText = obs?.notes || '';
                          return (
                            <tr key={`chat-preview-obs-${idx}`} className="border-b-2 border-black last:border-b-0 h-[69px]" style={{ borderBottom: '2px solid black' }}>
                              <td className="py-2 px-2 text-center font-black text-[13px] text-slate-950 leading-snug" style={{ borderLeft: '2px solid black', backgroundColor: '#d1d5db' }}>
                                {toolName}
                              </td>
                              <td className="py-2.5 px-3 bg-white text-slate-900 text-[13.5px] leading-relaxed align-top font-medium">
                                {noteText ? (
                                  <div className="font-semibold text-slate-850 leading-relaxed whitespace-pre-wrap">{noteText}</div>
                                ) : (
                                  <div className="h-full min-h-[48px] flex items-center justify-center text-slate-300 text-xs italic select-none"></div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Row 3: Official Horizontal Bottom Footer Bar with Suggested Program and 3 Signatures */}
                <div className="border border-[#821315] rounded bg-white">
                  <div className="flex w-full text-[15px]" dir="rtl" style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
                    
                    {/* Professional development space */}
                    <div className="p-3 text-right flex flex-col justify-center" style={{ width: '33%', flex: '0 0 33%', boxSizing: 'border-box' }}>
                      <span className="font-extrabold text-[#821315] block text-[14px]">
                        برامج الإنماء والتمكين المهني المقترحة بالتقرير:
                      </span>
                      <p className="text-slate-700 font-bold leading-relaxed text-[14px] mt-1">{previewFormModal.suggestedDevelopment}</p>
                    </div>

                    {/* Teacher Signature Block */}
                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                      <span className="font-extrabold text-[#821315] block text-[14px]">
                        معلم المادة الموقع:
                      </span>
                      <p className="text-slate-800 font-black text-[14px] mt-1 leading-tight">
                        {previewFormModal.isTeacherSigned 
                          ? (previewFormModal.teacherSignedName || '').replace(/[)(]/g, ' ')
                          : (previewFormModal.teacherName || 'معلم المادة').replace(/[)(]/g, ' ')}
                      </p>
                      <div className="text-[12px] text-slate-400 mt-2 block w-full">
                        {previewFormModal.isTeacherSigned ? (
                          <span className="font-mono text-sky-600 font-extrabold block w-full text-[11.5px]" style={{ direction: 'ltr' }}>
                            {previewFormModal.teacherSignatureQrData}
                          </span>
                        ) : (
                          <span className="text-sky-600 font-bold block w-full text-[11.5px]">⏱️ بانتظار توقيع المعلم</span>
                        )}
                      </div>
                    </div>

                    {/* Examiner details */}
                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center" style={{ width: '21%', flex: '0 0 21%', boxSizing: 'border-box' }}>
                      <span className="font-extrabold text-[#821315] block text-[14px]">
                        مشرف فحص ومطابقة المادة:
                      </span>
                      <p className="text-slate-800 font-black text-[14px] mt-1 leading-tight">
                        {previewFormModal.isExaminerSigned 
                          ? (previewFormModal.examinerSignedName || '').replace(/[)(]/g, ' ').replace('مشرف ومدقق محافظة الوسطى', '').replace('مشرف ومدقق', '').trim()
                          : (previewFormModal.examinerName || 'مشرف فحص ومطابقة المادة').replace(/[)(]/g, ' ').replace('مشرف ومدقق محافظة الوسطى', '').replace('مشرف ومدقق', '').trim()}
                      </p>
                      <div className="text-[12px] text-slate-400 mt-2 block w-full">
                        {previewFormModal.isExaminerSigned ? (
                          <span className="font-mono text-violet-600 font-extrabold block w-full text-[11.5px]" style={{ direction: 'ltr' }}>
                            {previewFormModal.examinerSignatureQrData}
                          </span>
                        ) : (
                          <span className="text-violet-600 font-bold block w-full text-[11.5px]">⏱️ بانتظار توقيع المفتش</span>
                        )}
                      </div>
                    </div>

                    {/* Principal and Stamp */}
                    <div className="p-3 border-r border-[#821315]/80 text-right flex flex-col justify-center relative" style={{ width: '25%', flex: '0 0 25%', boxSizing: 'border-box' }}>
                      {previewFormModal.isSigned && previewFormModal.signatureStampUrl !== 'no_stamp' && (
                        <img 
                          src={getActiveStamp(previewFormModal.schoolId || previewFormModal.schoolName)} 
                          alt="Stamp" 
                          className="w-20 h-20 object-contain absolute left-2 top-1 opacity-90 rotate-[-8deg] pointer-events-none" 
                        />
                      )}
                      <div className="font-extrabold text-[#821315] block text-[14px] relative z-10">
                        مدير المدرسة المصادق:
                      </div>
                      <div className="text-slate-800 font-black text-[14px] mt-1.5 block w-full relative z-10">
                        {previewFormModal.isSigned 
                          ? (previewFormModal.signedByPrincipalName || '').replace(/[)(]/g, ' ')
                          : (previewFormModal.principalName || 'بانتظار الاعتماد').replace(/[)(]/g, ' ')}
                      </div>
                      <div className="text-[12px] text-slate-400 mt-2 block w-full relative z-10 font-mono">
                        {previewFormModal.isSigned ? (
                          <span className="font-mono text-[#821315] font-extrabold block w-full text-[11.5px]" style={{ direction: 'ltr' }}>
                            {previewFormModal.signatureQrData}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold block w-full text-[11.5px]">⏱️ بانتظار الاعتماد الرئاسي</span>
                        )}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 dark:bg-slate-800 px-6 py-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                كود الاستمارة المعتمد: {previewFormModal.id}
              </span>
              <button
                type="button"
                onClick={() => setPreviewFormModal(null)}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl cursor-pointer"
              >
                إغلاق المعاينة
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
