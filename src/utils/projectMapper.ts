import type { Project } from '@/types/project';
import { getLocalBoqElementCount } from '@/utils/persistence';

type ApiProjectRow = {
  id: number | string;
  title: string;
  location?: string | null;
  project_type?: Project['project_type'];
  created_at?: string | Date;
  createdAt?: string | Date;
  updated_at?: string | Date;
  updatedAt?: string | Date;
  element_count?: number;
  elements?: number;
};

const toDateString = (value?: string | Date): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
};

export const normalizeProject = (raw: ApiProjectRow): Project => {
  const apiElements = Number(raw.element_count ?? raw.elements ?? 0);
  const localElements = getLocalBoqElementCount(String(raw.id));
  // Prefer local BOQ state when the project was edited on web; API rows can be stale/extra.
  const elements = localElements !== null ? localElements : apiElements;

  return {
    id: String(raw.id),
    title: raw.title ?? '',
    location: raw.location ?? '',
    project_type: raw.project_type,
    elements,
    createdAt: toDateString(raw.created_at ?? raw.createdAt),
    updatedAt: toDateString(raw.updated_at ?? raw.updatedAt),
  };
};

export const formatProjectCreatedAt = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
