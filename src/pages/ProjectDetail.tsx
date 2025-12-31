import { useParams } from "react-router-dom";
import { useEffect } from "react";
import TakeoffSidebar from "@/components/takeoff/TakeoffSidebar";
import FloorPlanCanvas from "@/components/takeoff/FloorPlanCanvas";
import TakeoffRightSidebar from "@/components/takeoff/TakeoffRightSidebar";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import type { TakeoffItem, TakeoffMode } from "@/types/takeoff";

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();

  const {
    takeoffItems,
    activeItemId,
    scales,
    setActiveItemId,
    addTakeoffItem,
    updateTakeoffItem,
    deleteTakeoffItem,
    loadProject,
    reset,
  } = useTakeoffStore();

  // Load project data on mount
  useEffect(() => {
    if (id) {
      loadProject(id);
    }

    // Cleanup on unmount
    return () => {
      reset();
    };
  }, [id, loadProject, reset]);

  const handleCreateItem = (type: TakeoffMode) => {
    const newItem: TakeoffItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type} ${takeoffItems.length + 1}`,
      type,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      measurements: [],
      totalQuantity: 0,
      unit: type === "area" ? "m2" : type === "count" ? "ea" : "m",
    };
    addTakeoffItem(newItem);
  };

  const handleSelectItem = (itemId: string) => {
    setActiveItemId(itemId);
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Left Sidebar - Takeoff Items */}
      <TakeoffSidebar
        items={takeoffItems}
        scales={scales}
        activeItemId={activeItemId}
        onSelectItem={handleSelectItem}
        onCreateItem={handleCreateItem}
        onDeleteItem={deleteTakeoffItem}
        onUpdateItem={updateTakeoffItem}
      />

      {/* Main Canvas Area */}
      <FloorPlanCanvas />

      {/* Right Sidebar - Manual Takeoff */}
      <TakeoffRightSidebar />
    </div>
  );
};

export default ProjectDetail;
