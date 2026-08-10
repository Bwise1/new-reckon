import { useParams, useNavigate } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState } from 'react';
import PlanNavigator from '@/components/takeoff/PlanNavigator';
import FloorPlanCanvas from '@/components/takeoff/FloorPlanCanvas';
import TakeoffRightSidebar from '@/components/takeoff/TakeoffRightSidebar';
import { useShallow } from 'zustand/react/shallow';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import { useProjectData } from '@/hooks/useProjectData';
import { ApiError } from '@/lib/api-client';
import type { TakeoffMode } from '@/types/takeoff';

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    data: projectResponse,
    isLoading: isProjectLoading,
    error: projectError,
  } = useProject(id ?? '');
  const project = projectResponse?.data?.project;

  // If the project fetch failed with a permanent 4xx (404 = doesn't exist,
  // 403 = not owned by this user), skip all downstream hydration so we
  // don't fire cascading 404s for plans/BOQ/measurements/calibrations,
  // and so the user gets a stable error UI instead of a flickering loader.
  const projectFetchStatus =
    projectError instanceof ApiError ? projectError.status : undefined;
  const projectDenied =
    projectFetchStatus === 404 ||
    projectFetchStatus === 403 ||
    projectFetchStatus === 401;

  const { isReady: isProjectDataReady } = useProjectData(id, {
    clientUuid: project?.client_uuid,
    title: project?.title,
    location: project?.location,
    skip: projectDenied,
  });

  // FloorPlanCanvas must stay mounted for its plan-loading hook to run at
  // all, so we can't gate on this by conditionally rendering the canvas —
  // instead an overlay covers the interface until the *initial* plan
  // finishes loading (or there's nothing to load / it failed, both
  // terminal). planLoadStatus also flips back to 'loading' on ordinary
  // page changes within an already-open project — that's the in-canvas
  // "Loading plan…" overlay's job, not this one, so once we've reached a
  // terminal state the first time we stop gating on it entirely.
  const [planLoadStatus, setPlanLoadStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const hasReachedInitialPlanStateRef = useRef(false);
  if (planLoadStatus === 'ready' || planLoadStatus === 'error') {
    hasReachedInitialPlanStateRef.current = true;
  }

  // Safety net: if the plan never reaches a terminal load state (a stuck
  // 'loading' — e.g. reopening a project on a page whose render hangs),
  // don't let this gate block the interface forever. Reveal it after a
  // few seconds regardless; the in-canvas "Loading plan…"/error overlay
  // still covers the canvas itself if the plan genuinely never loads.
  const [planLoadTimedOut, setPlanLoadTimedOut] = useState(false);
  useEffect(() => {
    if (hasReachedInitialPlanStateRef.current || planLoadTimedOut) return;
    const timer = window.setTimeout(() => setPlanLoadTimedOut(true), 6000);
    return () => window.clearTimeout(timer);
  }, [planLoadStatus, planLoadTimedOut]);

  const uploadHandlerRef = useRef<((e: React.ChangeEvent<HTMLInputElement>) => void) | null>(
    null
  );

  // Shallow selector, not a whole-store subscription: this page re-rendered on
  // every unrelated store mutation otherwise.
  const {
    plans,
    activePlanId,
    takeoffItems,
    activeItemId,
    activeTool,
    activeColor,
    setActiveItemId,
    setActiveTool,
    setActiveColor,
    selectPlan,
    removeMeasurement,
    focusedBoqCard,
    boqTargeting,
    startBoqTargeting,
    exitBoqTargeting,
  } = useTakeoffStore(
    useShallow((s) => ({
      plans: s.plans,
      activePlanId: s.activePlanId,
      takeoffItems: s.takeoffItems,
      activeItemId: s.activeItemId,
      activeTool: s.activeTool,
      activeColor: s.activeColor,
      setActiveItemId: s.setActiveItemId,
      setActiveTool: s.setActiveTool,
      setActiveColor: s.setActiveColor,
      selectPlan: s.selectPlan,
      removeMeasurement: s.removeMeasurement,
      focusedBoqCard: s.focusedBoqCard,
      boqTargeting: s.boqTargeting,
      startBoqTargeting: s.startBoqTargeting,
      exitBoqTargeting: s.exitBoqTargeting,
    }))
  );

  // Note: we intentionally do NOT reset() on unmount. Under React StrictMode the mount/
  // unmount/mount cycle would fire reset() between the two mounts, wiping currentProjectId
  // and breaking useProjectSync's once-per-project guard. loadProject() on the next
  // project entry already replaces state, so a lingering store between navigations is fine.

  const handleSelectTool = useCallback(
    (type: TakeoffMode) => {
      if (activeTool === type) {
        setActiveTool(null);
        return;
      }
      setActiveTool(type);
      // Auto-target the focused BOQ card if no targeting is active yet
      if (focusedBoqCard && !boqTargeting) {
        startBoqTargeting(focusedBoqCard.elementId, focusedBoqCard.itemId, focusedBoqCard.unit);
      }
    },
    [activeTool, setActiveTool, focusedBoqCard, boqTargeting, startBoqTargeting]
  );

  // Keep measurement targeting following whichever BOQ card the user has
  // focused, but ONLY while a drawing tool is already active — clicking
  // into a card's Takeoff field on its own must not start measuring mode;
  // that only begins when a measuring tool (Linear/Area/Count) is picked
  // (see handleSelectTool above). This effect just makes switching cards
  // mid-measurement retarget to the newly focused card instead of staying
  // bound to whichever card was targeted first.
  //
  // Only reacts to focusedBoqCard actually CHANGING (a real click on a
  // different card) — not to boqTargeting changing on its own. Otherwise
  // Exit/Escape (which clear boqTargeting but leave focusedBoqCard as-is)
  // would get immediately undone by this effect re-targeting the same
  // still-focused card right back.
  const lastFocusedBoqCardRef = useRef<typeof focusedBoqCard>(null);
  useEffect(() => {
    const prev = lastFocusedBoqCardRef.current;
    lastFocusedBoqCardRef.current = focusedBoqCard;
    if (!focusedBoqCard) return;
    if (!activeTool) return;
    const focusChanged =
      prev?.elementId !== focusedBoqCard.elementId ||
      prev?.itemId !== focusedBoqCard.itemId;
    if (!focusChanged) return;
    if (boqTargeting?.pendingValue) return;
    startBoqTargeting(focusedBoqCard.elementId, focusedBoqCard.itemId, focusedBoqCard.unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedBoqCard]);

  const handleFinishTool = useCallback(() => {
    // "Done" is the single finish control: put the tool down AND end any active
    // measuring session (which clears the orange banner). Measurements already
    // committed to history as they were drawn, so there's nothing else to do.
    setActiveTool(null);
    exitBoqTargeting();
  }, [setActiveTool, exitBoqTargeting]);

  const handleColorChange = useCallback(
    (color: string) => {
      setActiveColor(color);
    },
    [setActiveColor]
  );

  const handleSelectMeasurement = (itemId: string, _measurementId: string) => {
    setActiveItemId(itemId);
  };

  const handleDeleteMeasurement = (itemId: string, measurementId: string) => {
    removeMeasurement(itemId, measurementId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadHandlerRef.current?.(e);
  };

  const projectTitle = project?.title
    ? `${project.title}${project.title.toLowerCase().includes('project') ? '' : ' Project'}`
    : 'Project';

  // 'idle' only counts as "ready" when there's no plan to load in the
  // first place — otherwise it's just the gap before the loading effect's
  // first update, and treating it as ready would flash the interface
  // briefly before the overlay reappears for 'loading'. Once the initial
  // plan has settled once, later page changes never re-trigger this gate.
  const isPlanReady =
    hasReachedInitialPlanStateRef.current ||
    planLoadStatus === 'ready' ||
    planLoadStatus === 'error' ||
    (planLoadStatus === 'idle' && !activePlanId) ||
    planLoadTimedOut;

  if (projectDenied) {
    const heading =
      projectFetchStatus === 404
        ? 'Project not found'
        : "You don't have access to this project";
    const body =
      projectFetchStatus === 404
        ? "This project may have been deleted, or the link you followed is out of date."
        : "You're signed in, but this project belongs to someone else.";
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
        <div className="max-w-sm rounded-lg bg-white px-6 py-5 shadow-lg border border-gray-200 text-center">
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
          <p className="mt-2 text-sm text-gray-600">{body}</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-4 rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary/90 transition cursor-pointer"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isProjectLoading || !isProjectDataReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
        <div className="rounded-lg bg-white px-5 py-4 shadow-lg border border-gray-200 text-center">
          <p className="text-sm font-medium text-gray-700">Loading project…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-[#f0f2f5] overflow-hidden">
      {!isPlanReady && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#f0f2f5]">
          <div className="rounded-lg bg-white px-5 py-4 shadow-lg border border-gray-200 text-center">
            <p className="text-sm font-medium text-gray-700">Loading project…</p>
          </div>
        </div>
      )}

      <PlanNavigator
        projectTitle={projectTitle}
        plans={plans}
        activePlanId={activePlanId}
        takeoffItems={takeoffItems}
        activeItemId={activeItemId}
        onSelectPlan={selectPlan}
        onSelectMeasurement={handleSelectMeasurement}
        onDeleteMeasurement={handleDeleteMeasurement}
        onFileUpload={handleFileUpload}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <FloorPlanCanvas
          takeoffItems={takeoffItems}
          activeItemId={activeItemId}
          activeTool={activeTool}
          activeColor={activeColor}
          onSelectTool={handleSelectTool}
          onFinishTool={handleFinishTool}
          onColorChange={handleColorChange}
          registerUploadHandler={(handler) => {
            uploadHandlerRef.current = handler;
          }}
          onPlanLoadStatusChange={setPlanLoadStatus}
        />
      </div>

      <TakeoffRightSidebar />
    </div>
  );
};

export default ProjectDetail;
