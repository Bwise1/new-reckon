# BOQ Mobile-to-Web Parity Checklist

This checklist maps `Reckon-v2` BOQ behavior to web implementation targets.

## Core editing parity

- [ ] Create/open BOQ project with local persistence.
- [ ] Rename project from BOQ workspace.
- [ ] Add/delete/rename BOQ items.
- [ ] Duplicate BOQ item.
- [ ] Reorder BOQ item up/down.
- [ ] Support linear/area/count measurement capture.
- [ ] Edit measurement geometry and delete measurement.
- [ ] Support manual takeoff cards with formula-based quantity.

## Pricing and totals parity

- [ ] Capture VAT (%) and contingency (%).
- [ ] Compute subtotal, VAT amount, contingency amount, grand total.
- [ ] Show export-ready totals summary in BOQ workspace.

## Export/payment parity

- [ ] Build mobile-compatible BOQ payload builder.
- [ ] Preview PDF/Excel using backend preview endpoints.
- [ ] Initialize payment for full export.
- [ ] Export PDF/Excel with `exportId`.

## Offline parity

- [ ] Persist BOQ project state locally and recover on reload.
- [ ] Persist pricing state (VAT/contingency) per project.
- [ ] Delete local BOQ cache when project is deleted remotely.

## Post-parity gate

- [ ] Parity smoke test: create -> measure -> duplicate/reorder -> price -> preview/export.
