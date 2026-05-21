import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Upload,
  Ruler,
  Square,
  Hash,
  Trash2,
} from 'lucide-react';
import type { TakeoffItem, TakeoffMode } from '@/types/takeoff';
import { generateClientId } from '@/utils/id';

interface PlanFile {
  id: string;
  name: string;
}

interface PlanFolder {
  id: string;
  name: string;
  files: PlanFile[];
}

interface PlanNavigatorProps {
  projectTitle: string;
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  onSelectItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PlanNavigator: React.FC<PlanNavigatorProps> = ({
  projectTitle,
  takeoffItems,
  activeItemId,
  onSelectItem,
  onDeleteItem,
  onFileUpload,
}) => {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'history'>('plan');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    arch: true,
    struct: false,
  });
  const [selectedFileId, setSelectedFileId] = useState('arch-1');
  const [folders, setFolders] = useState<PlanFolder[]>([
    {
      id: 'arch',
      name: 'Architectural Drawing',
      files: [
        { id: 'arch-1', name: 'Drawing 1' },
        { id: 'arch-2', name: 'Drawing 2' },
      ],
    },
    {
      id: 'struct',
      name: 'Structural Drawing',
      files: [
        { id: 'struct-1', name: 'Drawing 1' },
        { id: 'struct-2', name: 'Drawing 2' },
      ],
    },
  ]);

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUploadClick = () => uploadRef.current?.click();

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileUpload(e);
    const file = e.target.files?.[0];
    if (file) {
      const name = file.name.replace(/\.[^.]+$/, '');
      setFolders((prev) =>
        prev.map((folder, idx) =>
          idx === 0
            ? {
                ...folder,
                files: [...folder.files, { id: generateClientId(), name }],
              }
            : folder
        )
      );
      setExpandedFolders((prev) => ({ ...prev, arch: true }));
    }
    e.target.value = '';
  };

  const toolIcon = (type: TakeoffMode) => {
    switch (type) {
      case 'linear':
      case 'polyline':
        return <Ruler className="w-3 h-3" />;
      case 'area':
        return <Square className="w-3 h-3" />;
      case 'count':
        return <Hash className="w-3 h-3" />;
    }
  };

  return (
    <aside className="w-[240px] min-w-[240px] max-w-[240px] shrink-0 h-full flex flex-col bg-white border-r border-gray-200">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-100">
        <h2 className="text-[15px] font-bold text-brandColor leading-snug line-clamp-2">
          {projectTitle}
        </h2>
      </div>

      <div className="shrink-0 flex border-b border-gray-200">
        {(['plan', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors cursor-pointer ${
              activeTab === tab
                ? 'text-secondary border-b-2 border-secondary bg-white'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {activeTab === 'plan' ? (
          <>
            <div className="py-2">
              {folders.map((folder) => {
                const open = expandedFolders[folder.id];
                return (
                  <div key={folder.id}>
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className="w-full px-3 py-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 cursor-pointer"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                      )}
                      <Folder className="w-4 h-4 text-secondary shrink-0" />
                      <span className="truncate text-left">{folder.name}</span>
                    </button>
                    {open &&
                      folder.files.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setSelectedFileId(file.id)}
                          className={`w-full pl-9 pr-3 py-1.5 flex items-center gap-2 text-sm transition-colors cursor-pointer ${
                            selectedFileId === file.id
                              ? 'bg-blue-50 text-secondary font-medium'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          <span className="truncate">{file.name}</span>
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>

            {takeoffItems.length > 0 && (
              <div className="border-t border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Markup layers
                </p>
                <div className="space-y-1">
                  {takeoffItems.map((item) => (
                    <div
                      key={item.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer ${
                        activeItemId === item.id
                          ? 'bg-secondary/10 ring-1 ring-secondary/20'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => onSelectItem(item.id)}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      {toolIcon(item.type)}
                      <span className="flex-1 text-xs text-gray-700 truncate">{item.name}</span>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">
                        {item.totalQuantity.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 cursor-pointer"
                        title="Delete layer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            Plan history will appear here.
          </div>
        )}
      </div>

      <div className="shrink-0 p-3 border-t border-gray-200">
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
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 8px; }
      `}</style>
    </aside>
  );
};

export default PlanNavigator;
