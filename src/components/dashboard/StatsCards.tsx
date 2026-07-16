const StatsCards = () => {
  const stats = {
    totalProjects: 44,
    totalExports: 105
  };

  return (
    <div className="grid grid-cols-2 gap-4" style={{ maxWidth: "370px" }}>
      <div className="bg-secondary rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">{stats?.totalProjects || 0}</p>
        <p className="font-medium text-sm">Projects</p>
      </div>

      <div className="bg-orange-500 rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">{stats?.totalExports || 0}</p>
        <p className="font-medium text-sm">Exports</p>
      </div>
    </div>
  );
};

export default StatsCards;
