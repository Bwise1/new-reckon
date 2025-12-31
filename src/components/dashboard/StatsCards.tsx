import { FiFolder, FiDownload } from "react-icons/fi";

const StatsCards = () => {
  // Using dummy data for now
  const stats = {
    totalProjects: 44,
    totalExports: 105
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
            <FiFolder className="text-secondary text-2xl" />
          </div>
          <div>
            <p className="text-3xl font-bold text-brandColor">
              {stats?.totalProjects || 0}
            </p>
            <p className="text-sm font-medium text-gray-600 mt-1">Projects</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-yellow-50 flex items-center justify-center">
            <FiDownload className="text-brandGold text-2xl" />
          </div>
          <div>
            <p className="text-3xl font-bold text-brandColor">
              {stats?.totalExports || 0}
            </p>
            <p className="text-sm font-medium text-gray-600 mt-1">Exports</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
