import { useParams } from 'react-router-dom';
import { useRef, useCallback } from 'react';
import PlanNavigator from '@/components/takeoff/PlanNavigator';
import FloorPlanCanvas from '@/components/takeoff/FloorPlanCanvas';
import TakeoffRightSidebar from '@/components/takeoff/TakeoffRightSidebar';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import { useProjectData } from '@/hooks/useProjectData';
import type { TakeoffMode } from '@/types/takeoff';

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: projectResponse } = useProject(id ?? '');
  const project = projectResponse?.data?.project;

  useProjectData(id, {
    clientUuid: project?.client_uuid,
    title: project?.title,
    location: project?.location,
  });

  const uploadHandlerRef = useRef<((e: React.ChangeEvent<HTMLInputElement>) => void) | null>(
    null
  );

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
  } = useTakeoffStore();

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

  const handleFinishTool = useCallback(() => {
    setActiveTool(null);
  }, [setActiveTool]);

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

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden">
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
        />
      </div>

      <TakeoffRightSidebar />
    </div>
  );
};

export default ProjectDetail;
