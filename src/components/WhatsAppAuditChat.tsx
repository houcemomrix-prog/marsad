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
  Clock
} from 'lucide-react';
import { UserProfile, Assessment } from '../types';
import { Language, translateGrade, translateSubject } from '../lib/translations';
import { getSchoolUploadPermissionStatus } from '../services/db';

export interface ChatMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'teacher' | 'moderator' | 'admin' | 'school';
  text?: string;
  assessment?: Assessment;
  createdAt: string;
}

interface WhatsAppAuditChatProps {
  userProfile: UserProfile;
  teacherName: string;
  schoolName: string;
  subjectName: string;
  assessments: Assessment[];
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
  language,
  onBack,
  onStartAuditForm,
  onUploadNewFile,
  actionLoading = false,
  onSuccess,
  onError
}: WhatsAppAuditChatProps) {
  const isAuditor = userProfile.role === 'moderator' || userProfile.role === 'admin';
  const isTeacher = userProfile.role === 'school' && userProfile.roleType === 'teacher';

  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Quick File Upload state inside chat
  const [fileTitle, setFileTitle] = useState('');
  const [fileDocType, setFileDocType] = useState('اختبار قصير 1');
  const [fileGrade, setFileGrade] = useState('Grade 10');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Convert assessments and comments into timeline chat messages
  useEffect(() => {
    const list: ChatMessageItem[] = [];

    // Add initial greeting message if empty
    list.push({
      id: 'system_welcome',
      senderId: 'system',
      senderName: 'نظام المتابعة والتدقيق التربوي',
      senderRole: 'admin',
      text: language === 'ar'
        ? `مرحباً بك في غرفة المحادثة المباشرة المعتمدة للتدقيق الفني والمتابعة الإشرافية الخاصة بمادة ${subjectName || 'المادة الأكاديمية'}. جميع الملفات والملاحظات المتبادلة محفوفة في سجل التدقيق المعتمد.`
        : `Welcome to the official accredited auditing stream for ${subjectName || 'Subject'}. All documents and messages are logged in the national ledger.`,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
    });

    // Sort assessments chronologically for chat flow
    const sortedAssessments = [...assessments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    sortedAssessments.forEach((ass) => {
      // Teacher uploaded file message
      list.push({
        id: `ass_msg_${ass.id}`,
        senderId: ass.schoolId || 'teacher_uid',
        senderName: ass.teacherName || ass.schoolName || teacherName,
        senderRole: 'teacher',
        text: ass.description || (language === 'ar' ? 'تم رفع ملف التقييم المعتمد للتدقيق والمطابقة.' : 'Uploaded assessment document for audit.'),
        assessment: ass,
        createdAt: ass.createdAt
      });

      // If moderator provided feedback, show it as a reply message
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

    setChatMessages(list);
  }, [assessments, teacherName, subjectName, language]);

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

    setChatMessages(prev => [...prev, newMsg]);
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
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setFileTitle(cleanName);
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

  const latestAssessment = assessments[0] || null;

  const formattedTeacherNameHelper = (nameToTest?: string): string => {
    if (!nameToTest) return 'أ. معلم المادة';
    const clean = nameToTest.trim();
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

  const formattedTeacherName = formattedTeacherNameHelper(teacherName);

  return (
    <div className="flex flex-col h-[82vh] max-h-[850px] bg-[#efeae2] dark:bg-[#0b141a] rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden font-sans relative" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* 🟢 WHATSAPP HEADER */}
      <div className="bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 sm:px-5 py-3 flex items-center justify-between shrink-0 shadow-md z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white shrink-0 cursor-pointer"
              title={language === 'ar' ? 'العودة لقائمة المدارس والمعلمين' : 'Back to list'}
            >
              <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
            </button>
          )}

          {/* Teacher Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-700 text-white font-extrabold flex items-center justify-center text-sm border-2 border-white/30 shadow-xs">
              {formattedTeacherName ? formattedTeacherName.charAt(0) : 'م'}
            </div>
            <span className="w-3.5 h-3.5 bg-emerald-400 border-2 border-[#075e54] rounded-full absolute bottom-0 left-0"></span>
          </div>

          {/* Teacher & Subject Title */}
          <div className="min-w-0 text-right rtl:text-right ltr:text-left">
            <h3 className="font-extrabold text-xs sm:text-sm text-white truncate leading-tight font-heading">
              {formattedTeacherName}
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
        className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-repeat"
        style={{
          backgroundImage: `radial-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 0)`,
          backgroundSize: '16px 16px'
        }}
      >
        {chatMessages.map((msg, index) => {
          const isMe = msg.senderId === userProfile.uid || (isAuditor && msg.senderRole === 'moderator') || (isTeacher && msg.senderRole === 'teacher');
          const isSystem = msg.senderId === 'system';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-amber-100/90 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 text-amber-900 dark:text-amber-200 text-[10.5px] font-medium px-4 py-2 rounded-2xl max-w-lg text-center shadow-2xs leading-relaxed">
                  <span className="font-extrabold block text-amber-950 dark:text-amber-100 mb-0.5">ℹ️ {msg.senderName}</span>
                  {msg.text}
                </div>
              </div>
            );
          }

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
                    {formattedTeacherNameHelper(msg.senderName)} ({msg.senderRole === 'teacher' ? (language === 'ar' ? 'المعلم' : 'Teacher') : (language === 'ar' ? 'المدقق' : 'Auditor')})
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

                {/* 📄 FILE ATTACHMENT CARD (If message contains a uploaded PDF assessment) */}
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

                    {/* Download & Inspect Actions inside Chat Card */}
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

      {/* 🔴 PROMINENT AUDITOR ACTION BAR AT THE BOTTOM: "بدء ملء الاستمارة" */}
      {isAuditor && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-slate-950 p-3 sm:p-4 shadow-2xl flex items-center justify-between gap-3 shrink-0 border-t border-amber-400/50 z-20">
          <div className="flex items-center gap-2.5 text-right">
            <div className="p-2.5 bg-slate-950/20 rounded-xl text-slate-950 shrink-0">
              <ClipboardCheck className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <p className="font-black text-xs sm:text-sm text-slate-950 font-heading leading-tight">
                {language === 'ar' ? 'جاهز لاعتماد وتدقيق العينات؟' : 'Ready to fill evaluation audit form?'}
              </p>
              <p className="text-[10.5px] text-slate-900 font-bold opacity-90">
                {language === 'ar'
                  ? `استمارة الفحص والتدقيق المستمر للمعلم (${formattedTeacherName})`
                  : `Continuous assessment form for teacher (${formattedTeacherName})`}
              </p>
            </div>
          </div>

          {/* 🌟 CRITICAL BUTTON REQUESTED BY USER: "بدء ملء الاستمارة" */}
          <button
            type="button"
            onClick={() => onStartAuditForm(teacherName, schoolName, subjectName, latestAssessment)}
            className="px-6 py-3 bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-white font-extrabold text-xs sm:text-base rounded-2xl flex items-center gap-2.5 shadow-xl hover:scale-[1.02] transition-all cursor-pointer border border-amber-400/40 shrink-0"
            id="start-audit-form-btn"
          >
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <span>{language === 'ar' ? 'بدء ملء الاستمارة' : 'Start Filling Form'}</span>
          </button>
        </div>
      )}

      {/* 💬 CHAT INPUT BAR & FILE ATTACHMENT (Exclusively for Teachers/Non-Auditor Users) */}
      {!isAuditor && (
        <div className="bg-white dark:bg-[#1f2c34] p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0 z-10">
          
          {/* Attachment Button for Teachers/Users */}
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="p-2.5 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 rounded-xl transition-colors cursor-pointer shrink-0"
            title={language === 'ar' ? 'إرفاق ملف تقييم PDF للمحادثة' : 'Attach PDF File'}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendTextMessage();
            }}
            placeholder={
              language === 'ar' 
                ? `اكتب ملاحظة أو إجابة لـ ${teacherName}...` 
                : `Type a message or note...`
            }
            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 font-medium"
          />

          {/* Send Button */}
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
              {/* File Select */}
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

              {/* Title Input */}
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

              {/* Grade */}
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

    </div>
  );
}
