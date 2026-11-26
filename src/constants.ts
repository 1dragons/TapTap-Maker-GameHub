import { LifecycleStageId } from './types';

export interface StageDefinition {
  id: LifecycleStageId;
  label: string;
  color: string;
  textColor: string;
  bgSoft: string;
  borderSoft: string;
}

export const LIFECYCLE_STAGES: StageDefinition[] = [
  {
    id: 'concept',
    label: '立项',
    color: '#7C3AED',
    textColor: '#6D28D9',
    bgSoft: 'rgba(124, 58, 237, 0.09)',
    borderSoft: 'rgba(124, 58, 237, 0.22)',
  },
  {
    id: 'prototype',
    label: '原型',
    color: '#4F46E5',
    textColor: '#4338CA',
    bgSoft: 'rgba(79, 70, 229, 0.09)',
    borderSoft: 'rgba(79, 70, 229, 0.22)',
  },
  {
    id: 'dev',
    label: '开发',
    color: '#2563EB',
    textColor: '#1D4ED8',
    bgSoft: 'rgba(37, 99, 235, 0.09)',
    borderSoft: 'rgba(37, 99, 235, 0.22)',
  },
  {
    id: 'qa',
    label: '验收',
    color: '#0D9488',
    textColor: '#0F766E',
    bgSoft: 'rgba(13, 148, 136, 0.09)',
    borderSoft: 'rgba(13, 148, 136, 0.22)',
  },
  {
    id: 'build',
    label: '构建',
    color: '#D97706',
    textColor: '#B45309',
    bgSoft: 'rgba(217, 119, 6, 0.1)',
    borderSoft: 'rgba(217, 119, 6, 0.24)',
  },
  {
    id: 'public_test',
    label: '公测',
    color: '#EA580C',
    textColor: '#C2410C',
    bgSoft: 'rgba(234, 88, 12, 0.09)',
    borderSoft: 'rgba(234, 88, 12, 0.22)',
  },
  {
    id: 'official',
    label: '正式',
    color: '#059669',
    textColor: '#047857',
    bgSoft: 'rgba(5, 150, 105, 0.09)',
    borderSoft: 'rgba(5, 150, 105, 0.24)',
  },
];

export const STAGE_INDEX_MAP: Record<LifecycleStageId, number> = {
  concept: 0,
  prototype: 1,
  dev: 2,
  qa: 3,
  build: 4,
  public_test: 5,
  official: 6,
};

// High-craft lane palette tuned for crystal clarity on crisp white & dark surfaces
export const GIT_LANE_COLORS = [
  '#2563EB', // royal blue
  '#7C3AED', // crisp violet
  '#059669', // emerald
  '#D97706', // warm amber
  '#E11D48', // crimson rose
  '#0891B2', // cyan
  '#EA580C', // tangerine
];
