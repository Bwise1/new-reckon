import React from "react";

interface MeasurementsLayerProps {
  children: React.ReactNode;
}

const MeasurementsLayer: React.FC<MeasurementsLayerProps> = ({ children }) => {
  return <>{children}</>;
};

export default MeasurementsLayer;

