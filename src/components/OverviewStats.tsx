import React from 'react';
import { Clock, ClipboardList, CheckCircle2, RotateCw, Percent } from 'lucide-react';
import { Assessment, AssessmentStatus } from '../types';
import { Language } from '../lib/translations';

interface OverviewStatsProps {
  assessments: Assessment[];
  language?: Language;
  selectedStatus?: string;
  onStatusClick?: (status: AssessmentStatus) => void;
  userRoleType?: string;
}

export function OverviewStats({ 
  assessments, 
  language = 'en',
  selectedStatus,
  onStatusClick,
  userRoleType
}: OverviewStatsProps) {
  const totalForms = assessments.length;
  const totalSamples = totalForms * 6; // 6 student samples per audit form
  const approved = assessments.filter((a) => a.status === 'Approved').length;
  const gradeRevisions = assessments.filter((a) => a.status === 'Grade Revision').length;
  const revisionRequests = assessments.filter((a) => a.status === 'Revision Request').length;
  // Forms with grade revisions are a subset of non-conforming forms
  const nonConforming = revisionRequests + gradeRevisions;
  const conformanceRate = totalForms > 0 ? Math.round((approved / totalForms) * 100) : 100;

  const currentLabels = {
    en: {
      totalForms: 'Total Forms',
      totalSamples: 'Audited Samples',
      approved: 'Conforming Forms',
      revisions: 'Non-Conforming Forms',
      gradeRevisions: 'Grade Revisions (G12)',
      subsetNote: '(Subset of Non-Conforming)',
      samplesNote: '6 samples / form',
      formsUnit: 'Forms',
      samplesUnit: 'Samples',
      conformanceRateLabel: 'Specification Conformance Rate',
    },
    ar: {
      totalForms: 'عدد الاستمارات الجملية',
      totalSamples: 'عدد العينات للفحص',
      approved: 'استمارات مطابقة',
      revisions: 'استمارات غير مطابقة',
      gradeRevisions: 'تعديل درجات (صف 12)',
      subsetNote: '(جزء من الاستمارات غير المطابقة)',
      samplesNote: '6 عينات لكل استمارة',
      formsUnit: 'استمارة',
      samplesUnit: 'عينة طالب',
      conformanceRateLabel: 'نسبة المطابقة للمواصفات',
    }
  }[language] || {
    totalForms: 'Total Forms',
    totalSamples: 'Audited Samples',
    approved: 'Conforming Forms',
    revisions: 'Non-Conforming Forms',
    gradeRevisions: 'Grade Revisions (G12)',
    subsetNote: '(Subset of Non-Conforming)',
    samplesNote: '6 samples / form',
    formsUnit: 'Forms',
    samplesUnit: 'Samples',
    conformanceRateLabel: 'Specification Conformance Rate',
  };

  const statCards = [
    {
      status: '' as AssessmentStatus,
      label: currentLabels.totalForms,
      count: totalForms,
      subtext: language === 'ar' ? 'لكل المدارس والمراكز' : 'All schools & centres',
      icon: ClipboardList,
      iconBg: 'bg-slate-100 text-slate-700',
      activeClass: 'border-slate-600 ring-2 ring-slate-500/20 bg-slate-50',
      dotColor: 'bg-slate-600',
      unit: currentLabels.formsUnit,
    },
    {
      status: 'In Progress' as AssessmentStatus,
      label: currentLabels.totalSamples,
      count: totalSamples,
      subtext: currentLabels.samplesNote,
      icon: Clock,
      iconBg: 'bg-blue-50 text-blue-700',
      activeClass: 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/30',
      dotColor: 'bg-blue-500',
      unit: currentLabels.samplesUnit,
    },
    {
      status: 'Approved' as AssessmentStatus,
      label: currentLabels.approved,
      count: approved,
      subtext: language === 'ar' ? `نسبة المطابقة للمواصفات: ${conformanceRate}%` : `Conformance Rate: ${conformanceRate}%`,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-700',
      activeClass: 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/30',
      dotColor: 'bg-emerald-500',
      unit: currentLabels.formsUnit,
      ratePct: conformanceRate,
    },
    {
      status: 'Revision Request' as AssessmentStatus,
      label: currentLabels.revisions,
      count: nonConforming,
      subtext: language === 'ar' ? `تشمل ${gradeRevisions} تعديل درجات` : `Includes ${gradeRevisions} grade rev.`,
      icon: RotateCw,
      iconBg: 'bg-rose-50 text-rose-700',
      activeClass: 'border-rose-600 ring-2 ring-rose-500/20 bg-rose-50/30',
      dotColor: 'bg-rose-500',
      unit: currentLabels.formsUnit,
    },
    {
      status: 'Grade Revision' as AssessmentStatus,
      label: currentLabels.gradeRevisions,
      count: gradeRevisions,
      subtext: currentLabels.subsetNote,
      icon: Percent,
      iconBg: 'bg-indigo-50 text-indigo-700',
      activeClass: 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/30',
      dotColor: 'bg-indigo-500',
      unit: currentLabels.formsUnit,
      badgeText: currentLabels.subsetNote,
    },
  ];

  const filteredCards = userRoleType === 'teacher'
    ? statCards.filter(card => card.status !== 'In Progress' && card.status !== 'Approved' && card.status !== 'Revision Request')
    : statCards;

  return (
    <div className={`grid gap-2.5 sm:gap-3.5 w-full ${
      userRoleType === 'teacher'
        ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto'
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    }`}>
      {filteredCards.map((card, i) => {
        const Icon = card.icon;
        const isSelected = selectedStatus === card.status;
        const isClickable = !!onStatusClick;

        return (
          <button
            key={`overview-stat-${card.status || i}-${i}`}
            type="button"
            disabled={!isClickable}
            onClick={() => onStatusClick?.(card.status)}
            className={`rounded-2xl p-3.5 sm:p-4 transition-all duration-200 flex flex-col justify-between items-start text-right relative overflow-hidden outline-hidden ${
              isClickable 
                ? 'cursor-pointer hover:shadow-xs hover:border-slate-300' 
                : 'cursor-default'
            } ${
              isSelected 
                ? `${card.activeClass} shadow-xs` 
                : 'bg-white border border-slate-200/80 hover:bg-slate-50/60'
            }`}
          >
            {/* Top row: Icon and status dot */}
            <div className="flex items-center justify-between w-full mb-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                <Icon className="w-4 h-4 stroke-[2.2]" />
              </div>
              <span className={`w-2 h-2 rounded-full ${card.dotColor}`} />
            </div>

            {/* Core figures and label */}
            <div className="space-y-1 w-full text-right">
              <div className="flex items-baseline gap-1.5 justify-start">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none font-sans">
                  {card.count}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {card.unit || currentLabels.formsUnit}
                </span>
              </div>
              <h4 className="text-xs sm:text-xs font-bold text-slate-800 leading-snug">
                {card.label}
              </h4>
              {card.subtext && (
                <p className={`text-[10px] font-medium leading-tight mt-0.5 ${
                  card.ratePct !== undefined 
                    ? 'text-emerald-700 font-bold bg-emerald-50/90 px-1.5 py-0.5 rounded inline-block'
                    : card.badgeText 
                    ? 'text-indigo-700 font-bold bg-indigo-50/80 px-1.5 py-0.5 rounded' 
                    : 'text-slate-400'
                }`}>
                  {card.subtext}
                </p>
              )}
              {card.ratePct !== undefined && (
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${card.ratePct}%` }}
                  />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
