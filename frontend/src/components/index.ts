/**
 * Court Case Management System - Shared UI Components Module
 */

export { StatCard, type StatCardAccent } from './dashboard/StatCard';
export { StatusBadge } from './dashboard/StatusBadge';
export { EmptyState } from './dashboard/EmptyState';
export { Modal, type ModalProps } from './common/Modal';
export { ConfirmDialog, type ConfirmDialogProps } from './common/ConfirmDialog';
export { PaginationControls, type PaginationControlsProps } from './common/PaginationControls';

export {
  JudgeOverviewSection,
  JudgeHearingsSection,
  JudgeCasesSection,
  JudgeCaseDetailSection,
  BenchNotesDraft,
} from './judge/index.ts';
export type {
  JudgeOverviewSectionProps,
  JudgeHearingsSectionProps,
  JudgeCasesSectionProps,
  JudgeCaseDetailSectionProps,
} from './judge/index.ts';
