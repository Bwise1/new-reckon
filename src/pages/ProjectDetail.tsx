import { useParams } from 'react-router-dom';
import { useEffect, useRef, useCallback } from 'react';
import PlanNavigator from '@/components/takeoff/PlanNavigator';
import FloorPlanCanvas from '@/components/takeoff/FloorPlanCanvas';
import TakeoffRightSidebar from '@/components/takeoff/TakeoffRightSidebar';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import type { TakeoffItem, TakeoffMode } from '@/types/takeoff';
import { generateClientId } from '@/utils/id';
import { MARKUP_COLORS } from '@/constants/takeoffDesign';

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: projectResponse } = useProject(id ?? '');
  const project = projectResponse?.data?.project;

  const uploadHandlerRef = useRef<((e: React.ChangeEvent<HTMLInputElement>) => void) | null>(
    null
  );

  const {
    takeoffItems,
    activeItemId,
    setActiveItemId,
    addTakeoffItem,
    updateTakeoffItem,
    deleteTakeoffItem,
    loadProject,
    reset,
  } = useTakeoffStore();

  useEffect(() => {
    if (id) {
      loadProject(id);
    }
    return () => {
      reset();
    };
  }, [id, loadProject, reset]);

  const handleCreateItem = useCallback(
    (type: TakeoffMode, color?: string) => {
      const colorIndex = takeoffItems.length % MARKUP_COLORS.length;
      const newItem: TakeoffItem = {
        id: generateClientId(),
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${takeoffItems.length + 1}`,
        type,
        color: color ?? MARKUP_COLORS[colorIndex],
        measurements: [],
        totalQuantity: 0,
        unit: type === 'area' ? 'm2' : type === 'count' ? 'ea' : 'm',
      };
      addTakeoffItem(newItem);
      setActiveItemId(newItem.id);
      return newItem.id;
    },
    [takeoffItems.length, addTakeoffItem, setActiveItemId]
  );

  const handleSelectTool = useCallback(
    (type: TakeoffMode) => {
      const existing = takeoffItems.find(
        (item) => item.type === type || (type === 'linear' && item.type === 'polyline')
      );
      if (existing) {
        setActiveItemId(existing.id);
        return;
      }
      handleCreateItem(type);
    },
    [takeoffItems, setActiveItemId, handleCreateItem]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (activeItemId) {
        updateTakeoffItem(activeItemId, { color });
      } else if (takeoffItems.length > 0) {
        updateTakeoffItem(takeoffItems[0].id, { color });
      }
    },
    [activeItemId, takeoffItems, updateTakeoffItem]
  );

  const handleSelectItem = (itemId: string) => {
    setActiveItemId(itemId);
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
        takeoffItems={takeoffItems}
        activeItemId={activeItemId}
        onSelectItem={handleSelectItem}
        onDeleteItem={deleteTakeoffItem}
        onFileUpload={handleFileUpload}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <FloorPlanCanvas
          takeoffItems={takeoffItems}
          activeItemId={activeItemId}
          onSelectTool={handleSelectTool}
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
