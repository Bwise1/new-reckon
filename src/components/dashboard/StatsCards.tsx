interface StatsCardsProps {
  projectCount: number;
}

const StatsCards = ({ projectCount }: StatsCardsProps) => {
  return (
    <div className="flex gap-4" style={{ width: "470px" }}>
      <div className="flex-1 bg-secondary rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">{projectCount}</p>
        <p className="text-base font-medium">Projects</p>
      </div>
      <div className="flex-1 bg-orange-500 rounded-lg p-6 text-white">
        <p className="text-4xl font-bold mb-1">—</p>
        <p className="text-base font-medium">Exports</p>
      </div>
    </div>
  );
};

export default StatsCards;
