const StatsCards = () => {
  const stats = {
    totalProjects: 44,
    totalExports: 105
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-secondary rounded-lg p-8 text-white">
        <p className="text-5xl font-bold mb-2">{stats?.totalProjects || 0}</p>
        <p className="text-lg font-medium">Projects</p>
      </div>

      <div className="bg-orange-500 rounded-lg p-8 text-white">
        <p className="text-5xl font-bold mb-2">{stats?.totalExports || 0}</p>
        <p className="text-lg font-medium">Exports</p>
      </div>
    </div>
  );
};

export default StatsCards;
