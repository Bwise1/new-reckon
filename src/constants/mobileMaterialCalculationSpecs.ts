export interface MaterialResultSpec {
    name: string;
    multiplier: number;
    unit: string;
}

export interface MaterialPresetSpec {
    key: string;
    label: string;
    inputFields: string[];
    results: MaterialResultSpec[];
}

export interface MaterialTypeSpec {
    key: string;
    label: string;
    presets: MaterialPresetSpec[];
}

export const MOBILE_MATERIAL_CALCULATION_SPECS: MaterialTypeSpec[] = [
    {
        key: "blocks",
        label: "Blocks",
        presets: [
            {
                key: "default",
                label: "Default",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Area", multiplier: 1, unit: "m²" },
                    { name: "Block Qty", multiplier: 10, unit: "Nrs" },
                    { name: "Cement for Laying", multiplier: 0.16, unit: "bags" },
                    { name: "Sand for laying", multiplier: 0.05, unit: "Tons" },
                ],
            },
        ],
    },
    {
        key: "concrete",
        label: "Concrete",
        presets: [
            {
                key: "1:2:4",
                label: "1:2:4",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Cement", multiplier: 6, unit: "bags" },
                    { name: "Fine Agg.", multiplier: 0.7, unit: "Ton" },
                    { name: "Coarse Agg.", multiplier: 1.2, unit: "Ton" },
                ],
            },
            {
                key: "1:3:6",
                label: "1:3:6",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Cement", multiplier: 4, unit: "bags" },
                    { name: "Fine Agg.", multiplier: 0.7, unit: "Ton" },
                    { name: "Aggregate", multiplier: 1.3, unit: "Ton" },
                ],
            },
            {
                key: "1:1:2",
                label: "1:1:2",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Cement", multiplier: 11, unit: "bags" },
                    { name: "Fine Agg.", multiplier: 0.6, unit: "Ton" },
                    { name: "Coarse Agg.", multiplier: 1, unit: "Ton" },
                ],
            },
        ],
    },
    {
        key: "tiles",
        label: "Tiles",
        presets: [
            {
                key: "600x600",
                label: "600 x 600mm",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Tile Qty", multiplier: 0.69, unit: "Pkt" },
                ],
            },
            {
                key: "450x250",
                label: "450 x 250mm",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Tile Qty", multiplier: 0.59, unit: "Pkt" },
                ],
            },
        ],
    },
    {
        key: "stone",
        label: "Stone Dust Filling",
        presets: [
            {
                key: "stone-base",
                label: "Stone Base",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Filing Vol.", multiplier: 1, unit: "m³" },
                    { name: "Material Qty", multiplier: 1.78, unit: "tons" },
                ],
            },
        ],
    },
    {
        key: "filing",
        label: "Filling",
        presets: [
            {
                key: "stone-base",
                label: "Stone Base",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Filing Vol.", multiplier: 1, unit: "m³" },
                    { name: "Material Qty", multiplier: 2.16, unit: "tons" },
                ],
            },
            {
                key: "sharp-sand",
                label: "Sharp Sand",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Filing Vol.", multiplier: 1, unit: "m³" },
                    { name: "Material Qty", multiplier: 2.22, unit: "tons" },
                ],
            },
            {
                key: "laterite",
                label: "Laterite",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Filing Vol.", multiplier: 1, unit: "m³" },
                    { name: "Material Qty", multiplier: 2.14, unit: "tons" },
                ],
            },
        ],
    },
    {
        key: "beddings",
        label: "Beddings and Backing",
        presets: [
            {
                key: "1:3",
                label: "1:3",
                inputFields: ["Length", "Breadth", "Thickness"],
                results: [
                    { name: "Area", multiplier: 1, unit: "m²" },
                    { name: "Cement", multiplier: 0.4, unit: "bags" },
                    { name: "Sand", multiplier: 0.08, unit: "Ton" },
                ],
            },
            {
                key: "1:6",
                label: "1:6",
                inputFields: ["Length", "Breadth", "Thickness"],
                results: [
                    { name: "Volume", multiplier: 1, unit: "m³" },
                    { name: "Cement", multiplier: 0.27, unit: "bags" },
                    { name: "Sand", multiplier: 0.09, unit: "Ton" },
                ],
            },
        ],
    },
    {
        key: "cartaway",
        label: "Cartaway",
        presets: [
            {
                key: "5-tons",
                label: "5 Tons",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Cartaway Vol.", multiplier: 1, unit: "m³" },
                    { name: "Trips", multiplier: 0.31, unit: "trip(s)" },
                ],
            },
            {
                key: "20-tons",
                label: "20 Tons",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Cartaway Vol.", multiplier: 1, unit: "m³" },
                    { name: "Trips", multiplier: 0.08, unit: "trip(s)" },
                ],
            },
            {
                key: "30-tons",
                label: "30 Tons",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Cartaway Vol.", multiplier: 1, unit: "m³" },
                    { name: "Trips", multiplier: 0.05, unit: "trip(s)" },
                ],
            },
        ],
    },
    {
        key: "reinforcement",
        label: "Reinforcement",
        presets: [
            {
                key: "slab",
                label: "Slab",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Reinforcement", multiplier: 125, unit: "kg" },
                ],
            },
            {
                key: "wall",
                label: "Wall",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Reinforcement", multiplier: 100, unit: "kg" },
                ],
            },
            {
                key: "beam-col",
                label: "Beam/Col.",
                inputFields: ["Length", "Breadth", "Height"],
                results: [
                    { name: "Concrete Vol.", multiplier: 1, unit: "m³" },
                    { name: "Reinforcement", multiplier: 110, unit: "kg" },
                ],
            },
        ],
    },
    {
        key: "kerbs",
        label: "Kerbs",
        presets: [
            {
                key: "300mm",
                label: "300mm",
                inputFields: ["Length"],
                results: [
                    { name: "Total Length", multiplier: 1, unit: "m" },
                    { name: "Kerbs", multiplier: 3.33, unit: "nrs" },
                    { name: "Cement for Laying", multiplier: 0.13, unit: "bags" },
                    { name: "Sand for Laying", multiplier: 0.13, unit: "tons" },
                ],
            },
            {
                key: "450mm",
                label: "450mm",
                inputFields: ["Length"],
                results: [
                    { name: "Total Length", multiplier: 1, unit: "m" },
                    { name: "Kerbs", multiplier: 2.22, unit: "nrs" },
                    { name: "Cement for Laying", multiplier: 0.1, unit: "bags" },
                    { name: "Sand for Laying", multiplier: 0.1, unit: "tons" },
                ],
            },
            {
                key: "600mm",
                label: "600mm",
                inputFields: ["Length"],
                results: [
                    { name: "Total Length", multiplier: 1, unit: "m" },
                    { name: "Kerbs", multiplier: 1.67, unit: "nrs" },
                    { name: "Cement for Laying", multiplier: 0.08, unit: "bags" },
                    { name: "Sand for Laying", multiplier: 0.08, unit: "tons" },
                ],
            },
        ],
    },
    {
        key: "paint",
        label: "Paint",
        presets: [
            {
                key: "1-coat",
                label: "1 Coat",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Paint Volume", multiplier: 0.13, unit: "ltr" },
                ],
            },
            {
                key: "2-coat",
                label: "2 Coats",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Paint Volume", multiplier: 0.23, unit: "ltr" },
                ],
            },
        ],
    },
    {
        key: "formwork",
        label: "Formwork",
        presets: [
            {
                key: "marine",
                label: "Marine",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Marine Plywood", multiplier: 0.35, unit: "pcs" },
                    { name: "2'x 3' Timber - Framing", multiplier: 0.08, unit: "nrs" },
                    { name: "2'x 3' Timber - bracing", multiplier: 0.2, unit: "nrs" },
                ],
            },
            {
                key: "plank",
                label: "Plank",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Marine Plywood", multiplier: 1.05, unit: "pcs" },
                    { name: "2'x 3' Timber - Framing", multiplier: 0.1, unit: "nrs" },
                    { name: "2'x 3' Timber - bracing", multiplier: 0.2, unit: "nrs" },
                ],
            },
        ],
    },
    {
        key: "plastering",
        label: "Plastering",
        presets: [
            {
                key: "1:4",
                label: "1:4",
                inputFields: ["Length", "Breadth", "Thickness"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Cement", multiplier: 0.11, unit: "bags" },
                    { name: "Sand", multiplier: 0.024, unit: "tons" },
                ],
            },
            {
                key: "1:6",
                label: "1:6",
                inputFields: ["Length", "Breadth", "Thickness"],
                results: [
                    { name: "Wall Area", multiplier: 1, unit: "m²" },
                    { name: "Cement", multiplier: 0.08, unit: "bags" },
                    { name: "Sand", multiplier: 0.025, unit: "tons" },
                ],
            },
        ],
    },
    {
        key: "interlocking",
        label: "Interlocking",
        presets: [
            {
                key: "200x100",
                label: "200mm X 100mm",
                inputFields: ["Length", "Height"],
                results: [
                    { name: "Area", multiplier: 1, unit: "m²" },
                    { name: "Interlocking Blocks", multiplier: 50, unit: "pcs" },
                    { name: "Bedding Agg", multiplier: 0.09, unit: "Ton" },
                    { name: "Base Agg", multiplier: 0.24, unit: "Ton" },
                    { name: "Cement", multiplier: 0.05, unit: "bags" },
                ],
            },
        ],
    },
    {
        key: "roofing",
        label: "Roof Covering",
        presets: [
            {
                key: "30-slope",
                label: "30% Slope",
                inputFields: ["Length", "Breadth"],
                results: [
                    { name: "Roofing Area", multiplier: 1, unit: "m²" },
                    { name: "Sheet", multiplier: 0.41, unit: "sht" },
                    { name: "2 x 3 Rafter", multiplier: 0.14, unit: "pcs" },
                    { name: "2 x 6 Tie Beam", multiplier: 0.06, unit: "pcs" },
                    { name: "2 x 4 Purlins", multiplier: 0.04, unit: "pcs" },
                    { name: "2 x 4 Wall Plates", multiplier: 0.07, unit: "pcs" },
                    { name: "4 x 4 King Posts", multiplier: 0.03, unit: "pcs" },
                    { name: "Roofing Nails/Screws", multiplier: 6, unit: "pcs" },
                ],
            },
            {
                key: "40-slope",
                label: "40% Slope",
                inputFields: ["Length", "Breadth"],
                results: [
                    { name: "Roofing Area", multiplier: 1, unit: "m²" },
                    { name: "Sheet", multiplier: 0.43, unit: "sht" },
                    { name: "2 x 3 Rafter", multiplier: 0.14, unit: "pcs" },
                    { name: "2 x 6 Tie Beam", multiplier: 0.06, unit: "pcs" },
                    { name: "2 x 4 Purlins", multiplier: 0.05, unit: "pcs" },
                    { name: "2 x 4 Wall Plates", multiplier: 0.07, unit: "pcs" },
                    { name: "4 x 4 King Posts", multiplier: 0.03, unit: "pcs" },
                    { name: "Roofing Nails/Screws", multiplier: 6, unit: "pcs" },
                ],
            },
            {
                key: "60-slope",
                label: "60% Slope",
                inputFields: ["Length", "Breadth"],
                results: [
                    { name: "Roofing Area", multiplier: 1, unit: "m²" },
                    { name: "Sheet", multiplier: 0.45, unit: "sht" },
                    { name: "2 x 3 Rafter", multiplier: 0.16, unit: "pcs" },
                    { name: "2 x 6 Tie Beam", multiplier: 0.07, unit: "pcs" },
                    { name: "2 x 4 Purlins", multiplier: 0.06, unit: "pcs" },
                    { name: "2 x 4 Wall Plates", multiplier: 0.08, unit: "pcs" },
                    { name: "4 x 4 King Posts", multiplier: 0.04, unit: "pcs" },
                    { name: "Roofing Nails/Screws", multiplier: 7, unit: "pcs" },
                ],
            },
        ],
    },
];

