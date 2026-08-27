import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, FileText, Link2, Moon, Sun, Trash2, UploadCloud, X } from 'lucide-react';
import PanelEdgeToggle from './PanelEdgeToggle';
import { useProjectTheme } from '@/hooks/useProjectTheme';
import { AreaIcon, LinearIcon, CountIcon } from './icons/ToolIcons';
import type { PlanDiscipline, TakeoffItem, TakeoffMode, ProjectPlan } from '@/types/takeoff';
import {
  getMeasurementColor,
  getMeasurementType,
  measurementLabel,
} from '@/utils/takeoffMeasurement';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { planService } from '@/services/plan.service';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { decodeMojibake } from '@/utils/textEncoding';
import { useStorage } from '@/hooks/useStorage';
import { itemLabelFromIndex } from '@/utils/boqCalculations';

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
  const renameMeasurement = useTakeoffStore((s) => s.renameMeasurement);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const { theme, toggle: toggleTheme } = useProjectTheme();
  const removePlan = useTakeoffStore((s) => s.removePlan);
  const boqElements = useTakeoffStore((s) => s.boqElements);
  const bindMeasurementToItem = useTakeoffStore((s) => s.bindMeasurementToItem);
  const unbindMeasurement = useTakeoffStore((s) => s.unbindMeasurement);
  const confirm = useConfirm();

  const handleDeletePlan = async (plan: ProjectPlan) => {
    const measurementCount = takeoffItems.reduce(
      (sum, item) =>
        sum + item.measurements.filter((m) => m.planId === plan.id).length,
      0
    );
    const ok = await confirm({
      title: 'Delete plan?',
      message: (
        <>
          <p>
            <span className="font-medium text-primary-fg">
              {decodeMojibake(plan.name)}
            </span>
            {measurementCount > 0 && (
              <>
                {' '}and its {measurementCount} measurement
                {measurementCount === 1 ? '' : 's'}
              </>
            )}{' '}
            will be removed.
          </p>
          <p className="mt-1 text-xs text-muted">This cannot be undone.</p>
        </>
      ),
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const projectId = useTakeoffStore.getState().currentProjectId;
    if (projectId) {
      try {
        await planService.deletePlan(projectId, plan.id);
      } catch (error) {
        console.warn('Server delete failed; removing locally anyway:', error);
      }
    }
    removePlan(plan.id);
  };

  const [activeTab, setActiveTab] = useState<SidebarTab>('plan');
  /** When set, the retro-bind picker is open for this measurement. Filters
   * the picker's item list by the measurement's implied unit so the user
   * can only bind to compatible cards. */
  const [bindPickerFor, setBindPickerFor] = useState<{
    measurementId: string;
    type: TakeoffMode;
  } | null>(null);
  const [pendingDiscipline, setPendingDiscipline] = useState<PlanDiscipline | null>(null);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: storageData } = useStorage();
  const storage = storageData?.data;

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
          label: string;
          boqElementId?: string;
          boqItemId?: string;
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
        const mType = getMeasurementType(measurement, item);
        groups.get(key)!.entries.push({
          itemId: item.id,
          measurementId: measurement.id,
          type: mType,
          color: getMeasurementColor(measurement, item),
          quantity: measurement.quantity,
          hidden: Boolean(measurement.hidden),
          label: measurementLabel(measurement, mType),
          boqElementId: measurement.boqElementId,
          boqItemId: measurement.boqItemId,
        });
      }
    }

    const order = [...DISCIPLINE_ORDER, UNCATEGORIZED_KEY];
    return order
      .filter((key) => (groups.get(key)?.entries.length ?? 0) > 0)
      .map((key) => ({ key, ...groups.get(key)! }));
  }, [plans, takeoffItems]);


  const unitLabel = (type: TakeoffMode) => {
    switch (type) {
      case 'area':
        return { base: 'm', sup: '2' };
      case 'count':
        return { base: 'nrs', sup: '' };
      case 'linear':
      case 'polyline':
      default:
        return { base: 'm', sup: '' };
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
    // Collapsible (prototype pattern): the aside animates its width to zero
    // while the inner column stays at full width inside the clip, so nothing
    // reflows or unmounts. The edge toggle lives outside the clipped box.
    // Theme comes from the shell scope (useProjectTheme on ProjectDetail).
    <div className="group relative shrink-0 h-full">
    <aside
      className={`h-full overflow-hidden bg-ink text-body border-r border-border transition-[width] duration-200 ${
        railCollapsed ? 'w-0 border-r-0' : 'w-[260px]'
      }`}
    >
      <div className="flex h-full w-[260px] flex-col">

      {/* Title + underline tabs in one header (prototype layout). The active
          tab's accent underline uses -mb-px so it sits ON the header's own
          border line — the two lines touch. */}
      <div className="shrink-0 border-b border-overlay/10 px-5 pt-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-body leading-snug line-clamp-2">
            {projectTitle}
          </h2>
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
            className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-overlay/10 hover:text-body transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="mt-3 flex items-center gap-5 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`-mb-px border-b-2 pb-2.5 font-medium transition-colors cursor-pointer ${
              activeTab === 'plan'
                ? 'border-accent text-body'
                : 'border-transparent text-muted hover:text-body'
            }`}
          >
            Plan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`-mb-px border-b-2 pb-2.5 font-medium transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'border-accent text-body'
                : 'border-transparent text-muted hover:text-body'
            }`}
          >
            History
          </button>
        </nav>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-dark">
        {activeTab === 'plan' ? (
          <div className="py-1 px-2">
            {plans.length === 0 ? (
              <p className="px-3 py-6 text-xs text-muted text-center">
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
                      className="w-full flex items-center gap-1 px-2 py-1.5 text-[13px] font-semibold text-body hover:bg-overlay/5 rounded cursor-pointer"
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
                          <div
                            key={plan.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectPlan(plan.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectPlan(plan.id);
                              }
                            }}
                            className={`group w-full px-2 py-1 flex items-center gap-2 text-[13px] rounded transition-colors cursor-pointer ${
                              activePlanId === plan.id
                                ? 'bg-overlay/10 text-body'
                                : 'text-muted hover:bg-overlay/5 hover:text-body'
                            }`}
                          >
                            <FileText className="w-3 h-3 shrink-0 opacity-60" />
                            <span className="truncate text-left flex-1">
                              {decodeMojibake(plan.name)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeletePlan(plan);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-danger cursor-pointer"
                              title="Delete plan"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

          </div>
        ) : historyGroups.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted text-center">
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
                    className="w-full flex items-center gap-1 px-2 py-1.5 text-[13px] font-semibold text-body hover:bg-overlay/5 rounded cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                    <span className="truncate text-left">{group.label}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="pl-3 space-y-1.5">
                      {group.entries.map((entry) => {
                        const { base, sup } = unitLabel(entry.type);
                        const value =
                          entry.type === 'count'
                            ? String(Math.round(entry.quantity))
                            : entry.quantity.toFixed(2);
                        const TypeIcon =
                          entry.type === 'area'
                            ? AreaIcon
                            : entry.type === 'count'
                              ? CountIcon
                              : LinearIcon;
                        return (
                          <div
                            key={entry.measurementId}
                            className="group flex items-center gap-2 rounded-lg border border-overlay/5 bg-overlay/5 px-2.5 py-2 hover:bg-overlay/10 transition-colors cursor-pointer"
                            onClick={() =>
                              onSelectMeasurement(entry.itemId, entry.measurementId)
                            }
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                                entry.hidden ? 'opacity-40' : ''
                              }`}
                            >
                              <TypeIcon className="h-4 w-4" />
                            </span>
                            {/* Always-editable name (prototype pattern): click
                                and type; commits on blur/Enter, Escape reverts.
                                Keyed on the label so external renames re-seed. */}
                            <input
                              key={`${entry.measurementId}:${entry.label}`}
                              defaultValue={entry.label}
                              placeholder="Untitled"
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (e.target.value !== entry.label) {
                                  renameMeasurement(
                                    entry.itemId,
                                    entry.measurementId,
                                    e.target.value
                                  );
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                } else if (e.key === 'Escape') {
                                  // Own this Escape: revert the rename only,
                                  // don't let the canvas discard the session.
                                  e.stopPropagation();
                                  e.currentTarget.value = entry.label;
                                  e.currentTarget.blur();
                                }
                              }}
                              className={`min-w-0 flex-1 rounded bg-transparent px-1 -mx-1 text-[11px] font-medium outline-none transition-colors hover:bg-overlay/10 focus:bg-overlay/10 focus:ring-1 focus:ring-accent/50 ${
                                entry.hidden ? 'text-muted' : 'text-body'
                              }`}
                            />
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: entry.color }}
                              title="Markup color"
                            />
                            <span
                              className={`shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums ${
                                entry.hidden ? 'text-muted/50' : 'text-muted'
                              }`}
                            >
                              {value}
                              {base}
                              {sup && <sup className="text-[8px]">{sup}</sup>}
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {entry.boqElementId && entry.boqItemId ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    unbindMeasurement(entry.measurementId);
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded-md text-warn transition-colors hover:bg-overlay/10 cursor-pointer"
                                  title="Bound to a BOQ line — click to unlink"
                                >
                                  <Link2 className="h-3 w-3" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBindPickerFor({
                                      measurementId: entry.measurementId,
                                      type: entry.type,
                                    });
                                  }}
                                  className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-warn cursor-pointer"
                                  title="Bind to a BOQ line"
                                >
                                  <Link2 className="h-3 w-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMeasurementHidden(entry.itemId, entry.measurementId);
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer"
                                title={entry.hidden ? 'Show markup' : 'Hide markup'}
                              >
                                {entry.hidden ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMeasurement(entry.itemId, entry.measurementId);
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/10 cursor-pointer"
                                title="Delete measurement"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
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

      <div className="shrink-0 border-t border-overlay/5">
        {/* Storage indicator */}
        {storage && (
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-muted">{storage.used_formatted} / {storage.quota_formatted}</span>
              <span className={`text-[10px] font-medium ${storage.percent_used >= 90 ? 'text-danger' : 'text-muted'}`}>
                {storage.percent_used}%
              </span>
            </div>
            <div className="h-1 bg-overlay/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${storage.percent_used >= 90 ? 'bg-danger' : storage.percent_used >= 70 ? 'bg-warn' : 'bg-brandGold'}`}
                style={{ width: `${Math.min(storage.percent_used, 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="p-3 space-y-2">
          <input
            ref={uploadRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,.dxf,application/dxf,image/vnd.dxf"
            onChange={handleUploadChange}
          />
          <button
            type="button"
            data-tour="upload-plan"
            onClick={handleUploadClick}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-fg text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <UploadCloud className="h-4 w-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={handleUploadClick}
            className="w-full text-center text-xs text-muted hover:text-body transition-colors cursor-pointer"
          >
            Add more project file
          </button>
        </div>
      </div>

      {showUploadPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowUploadPicker(false)}
        >
          <div
            className="bg-surface border border-overlay/10 rounded-lg p-4 w-[280px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-body font-medium mb-3">Choose drawing type</p>
            <div className="space-y-1">
              {DISCIPLINE_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePickDiscipline(key)}
                  className="w-full text-left px-3 py-2 text-sm text-body rounded hover:bg-overlay/10 cursor-pointer"
                >
                  {DISCIPLINE_LABEL[key]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowUploadPicker(false)}
              className="mt-3 w-full text-xs text-muted hover:text-body cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bindPickerFor && (() => {
        // Show every element+item whose unit matches the measurement type.
        const measurementType = bindPickerFor.type;
        const unitMatches = (unit: string): boolean => {
          if (unit === 'm') return measurementType === 'linear' || measurementType === 'polyline';
          if (unit === 'm2') return measurementType === 'area';
          if (unit === 'm3') return measurementType === 'area';
          if (unit === 'nrs' || unit === 'item') return measurementType === 'count';
          return false;
        };
        const options: Array<{
          elementIndex: number;
          elementId: string;
          elementTitle: string;
          itemLetter: string;
          itemId: string;
          itemUnit: string;
          itemHeader: string;
        }> = [];
        boqElements.forEach((element, elIdx) => {
          element.items.forEach((item, itIdx) => {
            if (!unitMatches(item.unit)) return;
            options.push({
              elementIndex: elIdx,
              elementId: element.id,
              elementTitle: element.title,
              itemLetter: itemLabelFromIndex(itIdx),
              itemId: item.id,
              itemUnit: item.unit,
              itemHeader: item.header || item.description || 'Item',
            });
          });
        });
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setBindPickerFor(null)}
          >
            <div
              className="bg-surface border border-overlay/10 rounded-lg p-4 w-[320px] max-h-[70vh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-body font-medium mb-1">Bind to BOQ line</p>
              <p className="text-[11px] text-muted mb-3">
                Only items whose unit matches the measurement are shown.
              </p>
              {options.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted text-center">
                  No BOQ items with a matching unit. Add or change a card's unit first.
                </p>
              ) : (
                <div className="space-y-1">
                  {options.map((opt) => (
                    <button
                      key={`${opt.elementId}-${opt.itemId}`}
                      type="button"
                      onClick={() => {
                        bindMeasurementToItem(
                          bindPickerFor.measurementId,
                          opt.elementId,
                          opt.itemId
                        );
                        setBindPickerFor(null);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-body rounded hover:bg-overlay/10 cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[10px] font-bold text-warn w-10 shrink-0">
                        {opt.elementIndex + 1}·{opt.itemLetter}
                      </span>
                      <span className="flex-1 truncate">{opt.elementTitle}</span>
                      <span className="text-[10px] text-muted">{opt.itemUnit}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setBindPickerFor(null)}
                className="mt-3 w-full text-xs text-muted hover:text-body cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      <style>{`
        .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 8px; }
      `}</style>
      </div>
    </aside>
      <PanelEdgeToggle
        side="left"
        collapsed={railCollapsed}
        onClick={() => setRailCollapsed((c) => !c)}
        expandLabel="Expand sidebar"
        collapseLabel="Collapse sidebar"
      />
    </div>
  );
};

export default PlanNavigator;
