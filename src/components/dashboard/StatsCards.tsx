const StatsCards = () => {
  const stats = {
    totalProjects: 44,
    totalExports: 105,
  };

  return (
    <div className="flex gap-4" style={{ width: "370px" }}>
      <div className="flex-1 bg-secondary rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">{stats.totalProjects}</p>
        <p className="text-base font-medium">Projects</p>
      </div>
      <div className="flex-1 bg-orange-500 rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">{stats.totalExports}</p>
        <p className="text-base font-medium">Exports</p>
      </div>
    </div>
  );
};

export default StatsCards;
