export function sortItemsByRole<T extends { schoolName?: string; subject?: string; subjectName?: string; teacherName?: string; schoolEmail?: string; title?: string }>(
  items: T[],
  role?: string
): T[] {
  return [...items].sort((a, b) => {
    const schoolA = (a.schoolName || '').trim();
    const schoolB = (b.schoolName || '').trim();
    const subjA = (a.subject || a.subjectName || '').trim();
    const subjB = (b.subject || b.subjectName || '').trim();
    const teacherA = (a.teacherName || a.schoolEmail || a.title || '').trim();
    const teacherB = (b.teacherName || b.schoolEmail || b.title || '').trim();

    if (role === 'moderator') {
      // Moderator: sorted by school (حسب المدرسة)
      return schoolA.localeCompare(schoolB, 'ar');
    } else if (role === 'school') {
      // School: organized by teachers (حسب المعلمين)
      return teacherA.localeCompare(teacherB, 'ar') || schoolA.localeCompare(schoolB, 'ar');
    } else if (role === 'admin') {
      // Admin: by school, then subjects, then teachers (حسب المدرسة ثم حسب المواد ثم حسب المعلمين)
      const schoolComp = schoolA.localeCompare(schoolB, 'ar');
      if (schoolComp !== 0) return schoolComp;
      const subjComp = subjA.localeCompare(subjB, 'ar');
      if (subjComp !== 0) return subjComp;
      return teacherA.localeCompare(teacherB, 'ar');
    }
    return schoolA.localeCompare(schoolB, 'ar');
  });
}
