# Edge-to-Edge Full Width Layout Plan

Expand the application views (specifically `InspectionPlanManager` and main content containers) to span **edge-to-edge full width from right to left** across the viewport without side padding or clipped table columns, as requested by the user.

> [!IMPORTANT]
> **Confirmed Decision**: The user selected "Edge-to-edge full width without side padding" to ensure all table columns and cards fill 100% of the screen width from edge to edge without side padding truncation or internal scrollbars.

---

### 1. Overview & Core Concept
- **Goal**: Make `InspectionPlanManager` and container elements stretch across the full width of the screen (`w-full px-0 sm:px-2`) edge-to-edge.
- **User Experience**: Every column in the schools inspection & permissions table is completely visible from right to left, preventing table clipping or hidden action controls.

---

### 2. User Experience & Visual Design
- **Full Width Canvas**: Remove max-width bounds (`max-w-7xl`, `max-w-6xl`, `px-6`) from view wrappers.
- **Edge-to-Edge Tables**: Ensure tables inside `InspectionPlanManager` expand to `w-full` with flexible auto-spacing, clear cell padding, and high-visibility status buttons.
- **Responsive RTL Layout**: Maintain clean right-to-left typography with zero side margin loss.

---

### 3. Key Product Decisions
- **Edge-to-Edge Grid & Table Containers**:
  - *Chosen Approach*: Replace fixed `max-w-7xl` containers with `w-full px-0 sm:px-2`.
  - *Why*: Gives 100% screen real estate to complex tables and multi-column inspection plan controls.

---

### 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                       Header Bar                            │
├─────────────────────────────────────────────────────────────┤
│               100% Edge-to-Edge View Canvas                 │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 5-Step Upload Lifecycle Banner (Full Width)             │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Edge-to-Edge Schools Inspection & Permissions Table    │ │
│ │ [المدرسة] | [تاريخ الفحص] | [فتح الصلاحيات] | [الحالة]    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Files to Modify**:
  - `/src/App.tsx`: Apply `w-full px-0 sm:px-2` layout containers.
  - `/src/components/InspectionPlanManager.tsx`: Ensure table container uses `w-full` edge-to-edge padding.
