# Mobile -> Web Calculation Port TODO

This checklist mirrors mobile calculation behavior from `Reckon-v2` and tracks web port status.

## Core Engine

- [x] Expression parser parity (`+ - * / ( ) √`)
- [x] Multi-item aggregation parity (`add` and `deduct`)
- [x] Base * multiplier result expansion
- [ ] Persist calc groups/history exactly like mobile modal flow
- [ ] Add automated parity tests with mobile fixtures

## BOQ Manual Takeoff Modes

- [x] Spec constants for `m`, `m2`, `m3`, `nrs`, `item`
- [x] Add/deduct stacked calculation-group engine helper
- [ ] `m` (`MeterUI`) - one expression input UI flow
- [ ] `m2` (`Meter2UI`) - length * height UI flow
- [ ] `m3` (`Meter3UI`) - length * breadth * height UI flow
- [ ] `nrs` (`NumbersUI`) - one expression input UI flow
- [ ] `item` (`ItemsUI`) - one expression input UI flow

## Material Schedule Presets

- [x] Blocks / Default
- [x] Concrete / `1:2:4`
- [x] Concrete / `1:3:6`
- [x] Concrete / `1:1:2`
- [x] Tiles / `600 x 600mm`
- [x] Tiles / `450 x 250mm`
- [x] Stone Dust Filling / Stone Base
- [x] Filling / Stone Base
- [x] Filling / Sharp Sand
- [x] Filling / Laterite
- [x] Beddings and Backing / `1:3`
- [x] Beddings and Backing / `1:6`
- [x] Cartaway / `5 Tons`
- [x] Cartaway / `20 Tons`
- [x] Cartaway / `30 Tons`
- [x] Reinforcement / Slab
- [x] Reinforcement / Wall
- [x] Reinforcement / Beam/Col.
- [x] Kerbs / `300mm`
- [x] Kerbs / `450mm`
- [x] Kerbs / `600mm`
- [x] Paint / `1 Coat`
- [x] Paint / `2 Coats`
- [x] Formwork / Marine
- [x] Formwork / Plank
- [x] Plastering / `1:4`
- [x] Plastering / `1:6`
- [x] Interlocking / `200mm X 100mm`
- [x] Roof Covering / `30% Slope`
- [x] Roof Covering / `40% Slope`
- [x] Roof Covering / `60% Slope`

## Web Wiring

- [x] Wire expression evaluation into `EstimationCard` quantity preview
- [ ] Add material preset selector UI
- [ ] Add input-field templates per preset
- [ ] Display result lines with units/multipliers
- [ ] Save material calc payload to backend-compatible model
