import { useParams, useNavigate } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState } from 'react';
import PlanNavigator from '@/components/takeoff/PlanNavigator';
import SidebarRail from '@/components/takeoff/SidebarRail';
import { useProjectTheme } from '@/hooks/useProjectTheme';
import FloorPlanCanvas from '@/components/takeoff/FloorPlanCanvas';
import TakeoffRightSidebar from '@/components/takeoff/TakeoffRightSidebar';
import TakeoffTour from '@/components/tutorial/TakeoffTour';
import { useShallow } from 'zustand/react/shallow';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import { useProjectData } from '@/hooks/useProjectData';
import { ApiError } from '@/lib/api-client';
import type { DrawTool } from '@/types/takeoff';

const ProjectDetail = () => {
  const { theme: projectTheme } = useProjectTheme();
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
    (type: DrawTool) => {
      if (activeTool === type) {
        setActiveTool(null);
        return;
      }
      setActiveTool(type);
      // Auto-target the focused BOQ card if no targeting is active yet. This
      // is also what resumes measuring after pan/select put the tool down
      // without moving focus — the cursor is still in that card's takeoff box,
      // so picking a tool again should re-activate THAT card.
      if (focusedBoqCard && !boqTargeting) {
        startBoqTargeting(focusedBoqCard.elementId, focusedBoqCard.itemId, focusedBoqCard.unit);
      }
    },
    [activeTool, setActiveTool, focusedBoqCard, boqTargeting, startBoqTargeting]
  );

  // Clicking a DIFFERENT card's takeoff box mid-measurement puts the tool
  // DOWN instead of silently retargeting the session. The old behaviour
  // (retarget to the newly focused card) made it too easy to keep drawing
  // into the wrong item without noticing. Now the session ends — any staged
  // value is stashed for the card it belongs to via exitBoqTargeting, so
  // nothing is lost — and measuring the new card begins only when the user
  // deliberately picks a tool again, which auto-targets the freshly focused
  // card (see handleSelectTool above).
  //
  // Only reacts to focusedBoqCard actually CHANGING (a real click on a
  // different card) — not to boqTargeting changing on its own. Otherwise
  // Exit/Escape (which clear boqTargeting but leave focusedBoqCard as-is)
  // would interact badly with this effect.
  // Tracked as a STABLE KEY, not the object: setFocusedBoqCard builds a fresh
  // object on every focus event, so comparing references (or comparing against
  // a ref updated inside this effect) mistook a REfocus of the same card for a
  // switch — which tore down a live session when the user simply put pan down
  // and picked the tool back up.
  const focusedCardKey = focusedBoqCard
    ? `${focusedBoqCard.elementId}:${focusedBoqCard.itemId}`
    : null;
  const lastFocusedCardKeyRef = useRef<string | null>(focusedCardKey);
  useEffect(() => {
    const prevKey = lastFocusedCardKeyRef.current;
    lastFocusedCardKeyRef.current = focusedCardKey;
    if (!focusedCardKey || !activeTool) return;
    if (prevKey === focusedCardKey) return;
    // Refocusing the card that is ALREADY being measured is not a switch —
    // e.g. clicking back into the takeoff box, or re-picking the tool after
    // pan. Only a move to a genuinely different card ends the session.
    if (
      boqTargeting &&
      `${boqTargeting.elementId}:${boqTargeting.itemId}` === focusedCardKey
    ) {
      return;
    }
    setActiveTool(null);
    exitBoqTargeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCardKey]);

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
        <div className="max-w-sm rounded-lg bg-surface px-6 py-5 shadow-lg border border-border text-center">
          <h2 className="text-base font-semibold text-body">{heading}</h2>
          <p className="mt-2 text-sm text-muted">{body}</p>
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
        <div className="rounded-lg bg-surface px-5 py-4 shadow-lg border border-border text-center">
          <p className="text-sm font-medium text-body">Loading project…</p>
        </div>
      </div>
    );
  }

  return (
    // The project shell runs the prototype token set — dark by default, the
    // sun/moon toggle in the sidebar flips it. The canvas viewport re-scopes
    // itself light regardless: the sheet is paper, not chrome.
    // Column shell: the panels row on top, and the status bar as the full-
    // width "base" underneath EVERYTHING (rail included) — prototype layout.
    // FloorPlanCanvas portals its CanvasStatusBar into the slot below so all
    // canvas state wiring stays where it lives.
    <div data-theme={projectTheme} className="relative flex h-screen flex-col bg-ink text-body overflow-hidden">
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {!isPlanReady && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-ink">
          <div className="rounded-lg bg-surface px-5 py-4 shadow-lg border border-border text-center">
            <p className="text-sm font-medium text-body">Loading project…</p>
          </div>
        </div>
      )}

      <SidebarRail />
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

      {/* Full-width status-bar slot — filled by FloorPlanCanvas via portal. */}
      <div id="reckon-status-slot" className="shrink-0" />

      {/* First-run walkthrough + Help button to replay it. */}
      <TakeoffTour />
    </div>
  );
};

export default ProjectDetail;
