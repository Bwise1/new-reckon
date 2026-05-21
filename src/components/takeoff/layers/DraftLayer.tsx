import React from "react";

interface DraftLayerProps {
  children: React.ReactNode;
}

const DraftLayer: React.FC<DraftLayerProps> = ({ children }) => {
  return <>{children}</>;
};

export default DraftLayer;

