export type BoqMeasurementMode = "m" | "m2" | "m3" | "nrs" | "item";

export interface BoqModeSpec {
    mode: BoqMeasurementMode;
    label: string;
    inputFields: string[];
}

/**
 * Mirrors mobile BOQ selected-section tabs:
 * 0: MeterUI -> m
 * 1: Meter2UI -> m2
 * 2: Meter3UI -> m3
 * 3: NumbersUI -> nrs
 * 4: ItemsUI -> item
 */
export const MOBILE_BOQ_CALCULATION_SPECS: BoqModeSpec[] = [
    { mode: "m", label: "Meter", inputFields: ["Length"] },
    { mode: "m2", label: "Square Meter", inputFields: ["Length", "Height"] },
    { mode: "m3", label: "Cubic Meter", inputFields: ["Length", "Breadth", "Height"] },
    { mode: "nrs", label: "Numbers", inputFields: ["Numbers"] },
    { mode: "item", label: "Items", inputFields: ["Item"] },
];

