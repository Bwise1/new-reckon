import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, FileText, Trash2 } from 'lucide-react';
import ReckonLogo from '@/assets/images/logo.svg';
import type { PlanDiscipline, TakeoffItem, TakeoffMode, ProjectPlan } from '@/types/takeoff';
import { getMeasurementColor, getMeasurementType } from '@/utils/takeoffMeasurement';
import { useTakeoffStore } from '@/store/useTakeoffStore';

interface PlanNavigatorProps {
  projectTitle: string;
  plans: ProjectPlan[];
  activePlanId: string | null;
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  onSelectPlan: (planId: string) => void;
  onSelectMeasurement: (itemId: string, measurementId: string) => void;
  onDeleteMeasurement: (itemId: string, measurementId: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

type SidebarTab = 'plan' | 'history';

const DISCIPLINE_ORDER: PlanDiscipline[] = [
  'architectural',
  'structural',
  'mep',
  'civil',
  'other',
];

const DISCIPLINE_LABEL: Record<PlanDiscipline, string> = {
  architectural: 'Architectural Drawing',
  structural: 'Structural Drawing',
  mep: 'MEP Drawing',
  civil: 'Civil Drawing',
  other: 'Other Drawing',
};

const UNCATEGORIZED_KEY = 'uncategorized';
const UNCATEGORIZED_LABEL = 'Uncategorized';

const PlanNavigator: React.FC<PlanNavigatorProps> = ({
  projectTitle,
  plans,
  activePlanId,
  takeoffItems,
  onSelectPlan,
  onSelectMeasurement,
  onDeleteMeasurement,
  onFileUpload,
}) => {
  const uploadRef = useRef<HTMLInputElement>(null);
  const setPlanDiscipline = useTakeoffStore((s) => s.setPlanDiscipline);
  const toggleMeasurementHidden = useTakeoffStore((s) => s.toggleMeasurementHidden);

  const [activeTab, setActiveTab] = useState<SidebarTab>('plan');
  const [pendingDiscipline, setPendingDiscipline] = useState<PlanDiscipline | null>(null);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; plans: ProjectPlan[] }>();
    for (const key of DISCIPLINE_ORDER) {
      groups.set(key, { label: DISCIPLINE_LABEL[key], plans: [] });
    }
    groups.set(UNCATEGORIZED_KEY, { label: UNCATEGORIZED_LABEL, plans: [] });

    for (const plan of plans) {
      const key = plan.discipline ?? UNCATEGORIZED_KEY;
      const bucket = groups.get(key) ?? groups.get(UNCATEGORIZED_KEY)!;
      bucket.plans.push(plan);
    }

    return Array.from(groups.entries())
      .filter(([, group]) => group.plans.length > 0)
      .map(([key, group]) => ({ key, ...group }));
  }, [plans]);

  const historyGroups = useMemo(() => {
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const groups = new Map<
      string,
      {
        label: string;
        entries: {
          itemId: string;
          measurementId: string;
          type: TakeoffMode;
          color: string;
          quantity: number;
          hidden: boolean;
        }[];
      }
    >();

    for (const item of takeoffItems) {
      for (const measurement of item.measurements) {
        const plan = measurement.planId ? planById.get(measurement.planId) : undefined;
        const key = plan?.discipline ?? UNCATEGORIZED_KEY;
        const label =
          key === UNCATEGORIZED_KEY
            ? UNCATEGORIZED_LABEL
            : DISCIPLINE_LABEL[key as PlanDiscipline];
        if (!groups.has(key)) groups.set(key, { label, entries: [] });
        groups.get(key)!.entries.push({
          itemId: item.id,
          measurementId: measurement.id,
          type: getMeasurementType(measurement, item),
          color: getMeasurementColor(measurement, item),
          quantity: measurement.quantity,
          hidden: Boolean(measurement.hidden),
        });
      }
    }

    const order = [...DISCIPLINE_ORDER, UNCATEGORIZED_KEY];
    return order
      .filter((key) => (groups.get(key)?.entries.length ?? 0) > 0)
      .map((key) => ({ key, ...groups.get(key)! }));
  }, [plans, takeoffItems]);

  const typeLetter = (type: TakeoffMode): string => {
    switch (type) {
      case 'linear':
        return 'L';
      case 'polyline':
        return 'P';
      case 'area':
        return 'A';
      case 'count':
        return 'C';
    }
  };

  const unitLabel = (type: TakeoffMode) => {
    switch (type) {
      case 'area':
        return { base: 'm', sup: '2' };
      case 'count':
        return { base: 'nrs', sup: '' };
      case 'linear':
      case 'polyline':
      default:
        return { base: 'm', sup: '1' };
    }
  };

  const handleUploadClick = () => {
    setShowUploadPicker(true);
  };

  const handlePickDiscipline = (discipline: PlanDiscipline) => {
    setPendingDiscipline(discipline);
    setShowUploadPicker(false);
    uploadRef.current?.click();
  };

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload(e);
    const discipline = pendingDiscipline;
    if (discipline) {
      const newPlanId = useTakeoffStore.getState().activePlanId;
      if (newPlanId) setPlanDiscipline(newPlanId, discipline);
    }
    setPendingDiscipline(null);
    e.target.value = '';
  };

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };


  return (
    <aside className="w-[260px] min-w-[260px] max-w-[260px] shrink-0 h-full flex flex-col bg-[#0a0a0a] text-gray-200 border-r border-black/60">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <p className="text-[11px] text-gray-500 tracking-wide">Reckon Web App</p>
      </div>

      <div className="shrink-0 px-4 pb-4 flex flex-col items-start gap-3">
        <img src={ReckonLogo} alt="Reckon" className="h-7 w-7 opacity-90" />
        <h2 className="text-[15px] font-semibold text-white leading-snug line-clamp-2">
          {projectTitle}
        </h2>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <div className="inline-flex items-center gap-1 bg-[#1a1a1a] rounded-md p-1">
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
              activeTab === 'plan'
                ? 'bg-white text-black font-medium'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Plan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-black font-medium'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            History
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-dark">
        {activeTab === 'plan' ? (
          <div className="py-1 px-2">
            {plans.length === 0 ? (
              <p className="px-3 py-6 text-xs text-gray-500 text-center">
                Upload a plan to start marking up measurements.
              </p>
            ) : (
              grouped.map((group) => {
                const isCollapsed = collapsed[group.key];
                return (
                  <div key={group.key} className="mb-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center gap-1 px-2 py-1.5 text-[13px] font-semibold text-white hover:bg-white/5 rounded cursor-pointer"
                    >
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${
                          isCollapsed ? '' : 'rotate-90'
                        }`}
                      />
                      <span className="truncate text-left">{group.label}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-5">
                        {group.plans.map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => onSelectPlan(plan.id)}
                            className={`w-full px-2 py-1 flex items-center gap-2 text-[13px] rounded transition-colors cursor-pointer ${
                              activePlanId === plan.id
                                ? 'bg-white/10 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                            }`}
                          >
                            <FileText className="w-3 h-3 shrink-0 opacity-60" />
                            <span className="truncate text-left flex-1">{plan.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

          </div>
        ) : historyGroups.length === 0 ? (
          <p className="px-4 py-6 text-xs text-gray-500 text-center">
            No measurements yet.
          </p>
        ) : (
          <div className="py-1 px-2">
            {historyGroups.map((group) => {
              const isCollapsed = collapsed[`history:${group.key}`];
              return (
                <div key={group.key} className="mb-3">
                  <button
                    type="button"
                    onClick={() => toggleGroup(`history:${group.key}`)}
                    className="w-full flex items-center gap-1 px-2 py-1.5 text-[13px] font-semibold text-white hover:bg-white/5 rounded cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                    <span className="truncate text-left">{group.label}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="pl-5 space-y-0.5">
                      {group.entries.map((entry) => {
                        const { base, sup } = unitLabel(entry.type);
                        const value =
                          entry.type === 'count'
                            ? String(Math.round(entry.quantity))
                            : entry.quantity.toFixed(2);
                        return (
                          <div
                            key={entry.measurementId}
                            className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                            onClick={() =>
                              onSelectMeasurement(entry.itemId, entry.measurementId)
                            }
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMeasurementHidden(entry.itemId, entry.measurementId);
                              }}
                              className="p-0.5 text-gray-400 hover:text-white cursor-pointer"
                              title={entry.hidden ? 'Show markup' : 'Hide markup'}
                            >
                              {entry.hidden ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <span
                              className={`flex-1 text-[12px] truncate ${
                                entry.hidden ? 'text-gray-500' : 'text-gray-200'
                              }`}
                            >
                              {value}
                              {base}
                              {sup && <sup className="text-[9px]">{sup}</sup>}
                            </span>
                            <span
                              className="w-4 h-4 rounded-sm shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ backgroundColor: entry.color }}
                            >
                              {typeLetter(entry.type)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMeasurement(entry.itemId, entry.measurementId);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 cursor-pointer"
                              title="Delete measurement"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 p-3 border-t border-white/5 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">Add more project file</span>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={handleUploadChange}
        />
        <button
          type="button"
          onClick={handleUploadClick}
          className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
        >
          Upload
        </button>
      </div>

      {showUploadPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowUploadPicker(false)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-lg p-4 w-[280px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white font-medium mb-3">Choose drawing type</p>
            <div className="space-y-1">
              {DISCIPLINE_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePickDiscipline(key)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 rounded hover:bg-white/10 cursor-pointer"
                >
                  {DISCIPLINE_LABEL[key]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowUploadPicker(false)}
              className="mt-3 w-full text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 8px; }
      `}</style>
    </aside>
  );
};

export default PlanNavigator;
