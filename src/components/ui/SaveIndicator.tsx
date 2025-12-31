import { useEffect, useState } from 'react';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { FiCheck, FiLoader } from 'react-icons/fi';

const SaveIndicator = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const currentProjectId = useTakeoffStore(state => state.currentProjectId);
  const takeoffItems = useTakeoffStore(state => state.takeoffItems);
  const scales = useTakeoffStore(state => state.scales);
  const calibrationLines = useTakeoffStore(state => state.calibrationLines);

  useEffect(() => {
    if (!currentProjectId) return;

    // Show saving indicator
    setIsSaving(true);

    // After the debounce period (500ms), mark as saved
    const timer = setTimeout(() => {
      setIsSaving(false);
      setLastSaved(new Date());
    }, 500);

    return () => clearTimeout(timer);
  }, [takeoffItems, scales, calibrationLines, currentProjectId]);

  if (!currentProjectId) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-sm">
      {isSaving ? (
        <>
          <FiLoader className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-gray-600">Saving...</span>
        </>
      ) : (
        <>
          <FiCheck className="w-4 h-4 text-green-500" />
          <span className="text-gray-600">
            Saved {lastSaved ? `at ${lastSaved.toLocaleTimeString()}` : ''}
          </span>
        </>
      )}
    </div>
  );
};

export default SaveIndicator;
