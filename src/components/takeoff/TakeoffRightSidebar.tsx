import React, { useState } from "react";
import { ChevronDown, Play, Users } from "lucide-react";
import EstimationCard from "./EstimationCard";
import BillsOverview from "./BillsOverview";
import PanelEdgeToggle from "./PanelEdgeToggle";
import { ArrowLeft } from "lucide-react";
import BoqExportModal from "./BoqExportModal";
import { useShallow } from "zustand/react/shallow";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { useBoqExport } from "@/hooks/useBoqExport";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import type { EstimationCardData } from "@/types/takeoff";
import { itemLabelFromIndex } from "@/utils/boqCalculations";
import CommentTrigger from "@/components/comments/CommentTrigger";
import CommentPopover from "@/components/comments/CommentPopover";
import { useCommentsStore } from "@/store/useCommentsStore";
import { useProfile } from "@/hooks/useProfile";
import { useProjectTheme } from "@/hooks/useProjectTheme";
import { commentTargetKey, type CommentAnchorKind } from "@/types/comments";
import CollaborateModal from "@/components/dashboard/CollaborateModal";
import { useProjectAccessStore } from "@/store/useProjectAccessStore";
import { ROLE_LABELS } from "@/types/members";
import { useParams } from "react-router-dom";

interface TakeoffRightSidebarProps {
  className?: string;
}

const TakeoffRightSidebar: React.FC<TakeoffRightSidebarProps> = ({
  className = "",
}) => {
  const {
    exportModalMode,
    setExportModalMode,
    busyAction,
    statusMessage,
    pricing,
    handleExportConfirm,
  } = useBoqExport();
  const { isOnline } = useSyncStatus();

  // Bill navigation: the sidebar is either the bill LIST page or one bill's
  // element view (Reckon-Bill prototype pattern). Detail is the default so
  // the measuring workflow lands on editable cards.
  // The bills ledger is the landing view (prototype behaviour).
  const [billView, setBillView] = useState<"list" | "detail">("list");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const { id: routeProjectId } = useParams();
  const [collaborateOpen, setCollaborateOpen] = useState(false);
  const accessRole = useProjectAccessStore((s) => s.role);
  const can = useProjectAccessStore((s) => s.can);
  const readOnly = !can.edit;
  const hideCosts = !can.seeCosts;

  // Comments on elements and items (docs/comments-plan.md). One popover open
  // at a time, anchored beside the trigger that opened it.
  const [openComment, setOpenComment] = useState<{
    kind: CommentAnchorKind;
    id: string;
    title: string;
    rect: DOMRect;
  } | null>(null);
  const commentThreads = useCommentsStore((s) => s.threads);
  const addComment = useCommentsStore((s) => s.addComment);
  const setCommentResolved = useCommentsStore((s) => s.setResolved);
  const deleteComment = useCommentsStore((s) => s.deleteComment);
  const commentMembers = useCommentsStore((s) => s.members);
  const { data: profileResponse } = useProfile();
  const profile = profileResponse?.data?.user;
  const { theme: portalTheme } = useProjectTheme();
  const currentUserId = profile?.id != null ? Number(profile.id) : null;
  const commentAuthor = () => {
    const name =
      [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || "You";
    return {
      id: currentUserId ?? 0,
      name,
      initials: name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join(""),
      avatarUrl: profile?.profilePicture ?? null,
    };
  };
  const threadOf = (kind: CommentAnchorKind, id: string) =>
    commentThreads[commentTargetKey(kind, id)];
  const bills = useTakeoffStore((s) => s.bills);
  const activeBillId = useTakeoffStore((s) => s.activeBillId);
  const switchBill = useTakeoffStore((s) => s.switchBill);
  const activeBillName =
    bills.find((b) => b.id === activeBillId)?.name ?? "Bill No. 1";

  // Shallow selector, not a whole-store subscription: canvas measurements
  // mutate the store constantly and would re-render this whole sidebar.
  const {
    boqElements,
    addBoqElement,
    updateBoqElement,
    addElementItem,
    updateElementItem,
    deleteElementItem,
    duplicateElementItem,
    boqTargeting,
    pendingCommit,
    startBoqTargeting,
    exitBoqTargeting,
    setBoqTargetingMode,
    setBoqTargetingPending,
    startNextBoqSession,
    clearPendingCommit,
    bindMeasurementToItem,
    setFocusedBoqCard,
  } = useTakeoffStore(
    useShallow((s) => ({
      boqElements: s.boqElements,
      addBoqElement: s.addBoqElement,
      updateBoqElement: s.updateBoqElement,
      addElementItem: s.addElementItem,
      updateElementItem: s.updateElementItem,
      deleteElementItem: s.deleteElementItem,
      duplicateElementItem: s.duplicateElementItem,
      boqTargeting: s.boqTargeting,
      pendingCommit: s.pendingCommit,
      startBoqTargeting: s.startBoqTargeting,
      exitBoqTargeting: s.exitBoqTargeting,
      setBoqTargetingMode: s.setBoqTargetingMode,
      setBoqTargetingPending: s.setBoqTargetingPending,
      startNextBoqSession: s.startNextBoqSession,
      clearPendingCommit: s.clearPendingCommit,
      bindMeasurementToItem: s.bindMeasurementToItem,
      setFocusedBoqCard: s.setFocusedBoqCard,
    }))
  );

  const [expandedElements, setExpandedElements] = React.useState<Record<string, boolean>>({});
  const [activeElementId, setActiveElementId] = React.useState<string | null>(null);
  const [activeCardId, setActiveCardId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (boqElements.length === 0) {
      setActiveElementId(null);
      setActiveCardId(null);
      setFocusedBoqCard(null);
      return;
    }

    // Only clear a selection that pointed at something now deleted — never
    // auto-select a default card. Nothing should read as "active" until the
    // user actually clicks a card.
    const element = activeElementId
      ? boqElements.find((e) => e.id === activeElementId)
      : undefined;
    if (activeElementId && !element) {
      setActiveElementId(null);
      setActiveCardId(null);
      setFocusedBoqCard(null);
    } else if (element && activeCardId && !element.items.some((item) => item.id === activeCardId)) {
      setActiveCardId(null);
      setFocusedBoqCard(null);
    }

    setExpandedElements((prev) => {
      const next = { ...prev };
      for (const el of boqElements) {
        if (next[el.id] === undefined) next[el.id] = true;
      }
      return next;
    });
  }, [boqElements, activeElementId, activeCardId]);

  const handleAddElement = () => {
    addBoqElement();
    const latest = useTakeoffStore.getState().boqElements;
    const created = latest[latest.length - 1];
    if (created) {
      setActiveElementId(created.id);
      setActiveCardId(created.items[0]?.id ?? null);
      setExpandedElements((prev) => ({ ...prev, [created.id]: true }));
    }
  };

  const handleAddItem = (elementId: string) => {
    addElementItem(elementId);
    const element = useTakeoffStore.getState().boqElements.find((e) => e.id === elementId);
    const newItem = element?.items[element.items.length - 1];
    if (newItem) {
      setActiveElementId(elementId);
      setActiveCardId(newItem.id);
      setExpandedElements((prev) => ({ ...prev, [elementId]: true }));
    }
  };

  const handleDeleteItem = (elementId: string, itemId: string) => {
    deleteElementItem(elementId, itemId);
  };

  const handleCopyItem = (elementId: string, itemId: string) => {
    duplicateElementItem(elementId, itemId);
    const element = useTakeoffStore.getState().boqElements.find((e) => e.id === elementId);
    const sourceIndex = element?.items.findIndex((i) => i.id === itemId) ?? -1;
    const copy = sourceIndex >= 0 ? element?.items[sourceIndex + 1] : undefined;
    if (copy) setActiveCardId(copy.id);
  };

  const handleUpdateItem = (
    elementId: string,
    itemId: string,
    updates: Partial<EstimationCardData>
  ) => {
    updateElementItem(elementId, itemId, updates);
  };

  return (
    <div className={`group relative shrink-0 h-full ${className}`}>
    <div
      className={`h-full flex flex-col bg-surface border-l border-border overflow-hidden transition-[width] duration-200 ${
        panelCollapsed ? 'w-0 border-l-0' : 'w-[380px]'
      }`}
    >
      <div className="flex h-full w-[380px] flex-col">
      <div className="shrink-0 h-[92px] px-4 border-b border-border flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-body">Bill of Quantities</h2>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {bills.length} Active Bill{bills.length === 1 ? '' : 's'}
          </p>
        </div>

        {!hideCosts && (
        <button
          type="button"
          title="Preview the BOQ document"
          aria-label="Preview"
          disabled={busyAction || !isOnline}
          onClick={() => setExportModalMode("preview")}
          className="rounded-lg border border-border p-2 text-muted hover:bg-overlay/5 hover:text-body transition-colors disabled:opacity-40 cursor-pointer"
        >
          <Play className="h-4 w-4" strokeWidth={1.75} />
        </button>
        )}
        <button
          type="button"
          title="Collaborate"
          aria-label="Collaborate"
          onClick={() => setCollaborateOpen(true)}
          className="rounded-lg border border-border p-2 text-muted hover:bg-overlay/5 hover:text-body transition-colors cursor-pointer"
        >
          <Users className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {!hideCosts && (
        <button
          type="button"
          data-tour="export"
          onClick={() => setExportModalMode("export")}
          disabled={busyAction || !isOnline}
          title={!isOnline ? "Export requires an internet connection" : undefined}
          className="shrink-0 px-5 py-2 rounded-lg bg-primary text-primary-fg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 shadow-sm cursor-pointer disabled:cursor-not-allowed"
        >
          Export
        </button>
        )}
      </div>

      {(readOnly || hideCosts) && (
        <div className="shrink-0 border-b border-border bg-surface-muted px-4 py-2 text-xs text-muted">
          You're on this project as <span className="font-semibold text-body">{ROLE_LABELS[accessRole]}</span>
          {readOnly ? " — read-only." : hideCosts ? " — quantities only, no rates." : "."}
        </div>
      )}

      {billView === "detail" && (
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-border text-sm">
          <button
            type="button"
            onClick={() => setBillView("list")}
            className="flex items-center gap-1 font-semibold text-muted/70 hover:text-body transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Bills
          </button>
          <span className="text-muted/50">/</span>
          <span className="font-bold text-body truncate">{activeBillName}</span>
        </div>
      )}

      {statusMessage && (
        <p className="shrink-0 px-4 py-1.5 text-[11px] text-muted border-b border-border bg-surface-muted">
          {statusMessage}
        </p>
      )}

      {billView === "list" ? (
        <BillsOverview
          readOnly={readOnly}
          hideCosts={hideCosts}
          onOpenBill={(billId) => {
            switchBill(billId);
            setBillView("detail");
          }}
        />
      ) : (
      <div
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar"
        onClick={(e) => {
          // Clicking empty space (not a card, not a control inside one)
          // exits measuring mode so the floating toolbar closes. Clicks on
          // cards/canvas are handled separately and retarget instead.
          if (e.target === e.currentTarget && boqTargeting) {
            exitBoqTargeting();
          }
        }}
      >
        {boqElements.map((element) => {
          const isExpanded = expandedElements[element.id] ?? true;

          return (
            <div key={element.id} className="border-b border-border">
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  setExpandedElements((prev) => ({
                    ...prev,
                    [element.id]: !isExpanded,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedElements((prev) => ({ ...prev, [element.id]: !isExpanded }));
                  }
                }}
                className="w-full px-4 py-3 flex items-center justify-between shrink-0 hover:bg-overlay/5/80 cursor-pointer"
              >
                <span className="text-lg font-bold text-body flex items-center gap-1.5 min-w-0">
                  <input
                    type="text"
                    value={
                      element.title
                        ? element.title.charAt(0).toUpperCase() + element.title.slice(1)
                        : element.title
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={readOnly}
                    onChange={(e) => {
                      // Store with the first letter capitalized (sentence case).
                      const v = e.target.value;
                      updateBoqElement(element.id, {
                        title: v ? v.charAt(0).toUpperCase() + v.slice(1) : v,
                      });
                    }}
                    className="bg-transparent border-none outline-none font-bold text-lg text-body min-w-0 flex-1"
                  />
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <CommentTrigger
                    count={threadOf("boq_element", element.id)?.comments.length ?? 0}
                    resolved={threadOf("boq_element", element.id)?.status === "resolved"}
                    label={
                      threadOf("boq_element", element.id)?.comments.length
                        ? `Comments on ${element.title || "element"}`
                        : `Comment on ${element.title || "element"}`
                    }
                    onOpen={(rect) =>
                      setOpenComment({
                        kind: "boq_element",
                        id: element.id,
                        title: element.title || "Element",
                        rect,
                      })
                    }
                  />
                  <ChevronDown
                    className={`w-5 h-5 text-muted transition-transform shrink-0 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                  {element.items.map((card, index) => {
                    const isTargetingThis =
                      boqTargeting?.elementId === element.id &&
                      boqTargeting?.itemId === card.id;
                    const pendingCommitForThis =
                      pendingCommit?.elementId === element.id &&
                      pendingCommit?.itemId === card.id
                        ? pendingCommit
                        : null;
                    // Commit bundle for Add/Deduct. Commit-on-demand: while
                    // actively measuring this card, the drawn measurements are
                    // staged in boqTargeting (no chip yet) — expose them as the
                    // bundle so Add/Deduct binds them into ONE chip. Otherwise
                    // fall back to the stashed post-Exit pendingCommit.
                    const commitBundleForThis =
                      isTargetingThis && boqTargeting
                        ? {
                            elementId: boqTargeting.elementId,
                            itemId: boqTargeting.itemId,
                            value: boqTargeting.pendingValue ?? '',
                            total: boqTargeting.pendingTotal,
                            measurementIds: boqTargeting.pendingMeasurementIds,
                            sessionId: boqTargeting.sessionId,
                          }
                        : pendingCommitForThis;
                    // Live-updating value while measuring; stashed value after Exit.
                    const displayPendingValue = isTargetingThis
                      ? boqTargeting?.pendingValue ?? null
                      : pendingCommitForThis?.value ?? null;
                    return (
                    <EstimationCard
                      readOnly={readOnly}
                      hideCosts={hideCosts}
                      commentCount={threadOf("boq_item", card.id)?.comments.length ?? 0}
                      commentResolved={threadOf("boq_item", card.id)?.status === "resolved"}
                      onOpenComments={(rect) =>
                        setOpenComment({
                          kind: "boq_item",
                          id: card.id,
                          title: card.description
                            ? `Item ${itemLabelFromIndex(index)} · ${card.description}`
                            : `Item ${itemLabelFromIndex(index)}`,
                          rect,
                        })
                      }
                      key={card.id}
                      data={card}
                      itemLabel={itemLabelFromIndex(index)}
                      isActive={
                        activeElementId === element.id && activeCardId === card.id
                      }
                      isTargeting={isTargetingThis}
                      pendingMeasuredValue={displayPendingValue}
                      pendingCommitBundle={commitBundleForThis}
                      onSessionCommit={(mode, expression) => {
                        if (!commitBundleForThis) return;
                        // Bind the staged measurements as one chip, using the
                        // possibly-edited expression (e.g. "13733.91 + 76") as
                        // the chip value so typed math is preserved.
                        bindMeasurementToItem(
                          commitBundleForThis.measurementIds,
                          commitBundleForThis.elementId,
                          commitBundleForThis.itemId,
                          mode,
                          expression ?? commitBundleForThis.value,
                          commitBundleForThis.sessionId,
                        );
                        clearPendingCommit();
                        // Roll onto a NEW session id: clears the staged value
                        // and guarantees the next Add/Deduct is its own chip.
                        // (Clearing alone kept the old sessionId, so later
                        // commits merged into the first chip.)
                        startNextBoqSession();
                      }}
                      onClearPendingMeasured={() => {
                        // Clear both the live-measuring pending value (if any)
                        // and the stashed post-Exit pendingCommit (if any).
                        // Manual commits should discard the drawn-session
                        // total since the user typed their own value.
                        setBoqTargetingPending(null, []);
                        if (pendingCommitForThis) clearPendingCommit();
                      }}
                      onFocus={() => {
                        setActiveElementId(element.id);
                        setActiveCardId(card.id);
                        setFocusedBoqCard({ elementId: element.id, itemId: card.id, unit: card.unit });
                      }}
                      onToggleMeasure={() => {
                        setActiveElementId(element.id);
                        setActiveCardId(card.id);
                        const isThisCardTargeted =
                          boqTargeting?.elementId === element.id &&
                          boqTargeting?.itemId === card.id;
                        if (isThisCardTargeted) {
                          exitBoqTargeting();
                        } else {
                          startBoqTargeting(element.id, card.id, card.unit);
                        }
                      }}
                      onMeasureModeChange={(mode) => {
                        // Only update targeting if THIS card is the target.
                        const isThisCardTargeted =
                          boqTargeting?.elementId === element.id &&
                          boqTargeting?.itemId === card.id;
                        if (isThisCardTargeted) setBoqTargetingMode(mode);
                      }}
                      onDelete={(itemId) => handleDeleteItem(element.id, itemId)}
                      onCopy={(itemId) => handleCopyItem(element.id, itemId)}
                      onUpdate={(itemId, updates) =>
                        handleUpdateItem(element.id, itemId, updates)
                      }
                      onAddElement={handleAddElement}
                      onAddItem={() => handleAddItem(element.id)}
                    />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {routeProjectId && (
        <CollaborateModal
          projectId={routeProjectId}
          open={collaborateOpen}
          onClose={() => setCollaborateOpen(false)}
        />
      )}
      {openComment && (
        <CommentPopover
          title={openComment.title}
          comments={threadOf(openComment.kind, openComment.id)?.comments ?? []}
          resolved={threadOf(openComment.kind, openComment.id)?.status === "resolved"}
          anchorRect={openComment.rect}
          portalTheme={portalTheme}
          currentUserId={currentUserId}
          members={commentMembers}
          onClose={() => setOpenComment(null)}
          onResolve={() =>
            setCommentResolved(
              openComment.kind,
              openComment.id,
              threadOf(openComment.kind, openComment.id)?.status !== "resolved"
            )
          }
          onSend={(message, mentions) =>
            addComment(openComment.kind, openComment.id, message, commentAuthor(), mentions)
          }
          onDelete={(uuid) => deleteComment(openComment.kind, openComment.id, uuid)}
        />
      )}
      <BoqExportModal
        key={`${exportModalMode}-${pricing.vatRate}-${pricing.contingency}`}
        open={exportModalMode !== null}
        mode={exportModalMode ?? "export"}
        initialVat={pricing.vatRate}
        initialContingency={pricing.contingency}
        busy={busyAction}
        onClose={() => setExportModalMode(null)}
        onConfirm={handleExportConfirm}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--color-overlay) 18%, transparent); border-radius: 10px; }
      `}</style>
      </div>
    </div>
      <PanelEdgeToggle
        side="right"
        collapsed={panelCollapsed}
        onClick={() => setPanelCollapsed((c) => !c)}
        expandLabel="Expand BOQ panel"
        collapseLabel="Collapse BOQ panel"
      />
    </div>
  );
};

export default TakeoffRightSidebar;
