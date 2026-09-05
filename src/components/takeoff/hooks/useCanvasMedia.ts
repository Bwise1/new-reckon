import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type * as pdfjsLib from "pdfjs-dist";
import { planService } from "@/services/plan.service";
import { fetchAndMergeProjectPlans } from "@/services/planSync.service";
import { isProjectSyncDisabled } from "@/services/projectSync.service";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { getPlanPdf, setPlanPdf } from "@/utils/planPdfCache";
import { inferPlanMediaKind, loadPlanFromRemoteUrl } from "@/utils/planMediaLoader";
import { loadPdfjs } from "@/utils/pdfjsLoader";
import { extractPdfSegments, SegmentIndex } from "@/utils/pdfLineExtractor";
import { getCachedSegments, setCachedSegments, segmentCacheKey } from "@/utils/pdfSegmentCache";
import { detectDrawingScale } from "@/utils/pdfScaleDetector";
import { getCanvasFitMode } from "@/utils/canvasPrefs";
import { isDxfFile } from "@/utils/dxfRasterizer";
import { rotateImageElement } from "@/utils/imageRotate";

/** Fit-page leaves a 5% breathing margin so the plan doesn't touch the viewport
 *  edges — matches the ratio measured in comparable takeoff viewers. */
const FIT_PAGE_MARGIN = 0.95;

// Render-quality budget. A page is rasterized at `scale` × its natural (pt)
// size; without a ceiling a large plan at high zoom would allocate a canvas
// big enough to crash the tab (an A0 page at 4× is already 64+ megapixels).
// ~33.5 MP ≈ 134 MB RGBA transient — comfortably inside desktop limits — and
// 8192 px per side stays under every browser's canvas dimension cap.
const MAX_RENDER_PIXELS = 33_500_000;
const MAX_RENDER_DIM = 8192;

// The base raster is a fixed DPI of the physical sheet, capped on the longest
// edge - identical on every device and window size, so stored points can never
// drift across devices. Stored measurement points live in this bitmap space:
// changing this formula rescales them, so any future change needs a new
// render_version era (the column already records 2 for every upload).
const RENDER_DPI = 300;
const RENDER_MAX_EDGE = 7200;
const documentDisplayScale = (naturalW: number, naturalH: number) =>
    Math.min(RENDER_DPI / 72, RENDER_MAX_EDGE / Math.max(naturalW, naturalH));
const capRenderScale = (scale: number, w: number, h: number) =>
    Math.min(scale, Math.sqrt(MAX_RENDER_PIXELS / (w * h)), MAX_RENDER_DIM / Math.max(w, h));

/** What the PDF page picker resolves with: the kept pages (1-based,
 *  ascending) and how many pages the document has in total. */
export interface PageSelection {
    pages: number[];
    totalPages: number;
}

interface UseCanvasMediaParams {
    containerRef: React.RefObject<HTMLDivElement | null>;
    backgroundImage: string | null;
    activePlanId: string | null;
    setBackgroundImage: (image: string | null) => void;
    setCurrentPage: (page: number) => void;
    setStoreNumPages: (pages: number) => void;
    currentPage: number;
    image: HTMLImageElement | null;
    setImage: (image: HTMLImageElement | null) => void;
    setImageScale: (scale: number) => void;
    setStageSize: (size: { width: number; height: number }) => void;
    setStageScale: (scale: number) => void;
    setStagePos: (pos: { x: number; y: number }) => void;
    pdfDoc: pdfjsLib.PDFDocumentProxy | null;
    setPdfDoc: (pdf: pdfjsLib.PDFDocumentProxy | null) => void;
    numPages: number;
    setNumPages: (pages: number) => void;
    projectId?: string;
}

export const useCanvasMedia = ({
    containerRef,
    backgroundImage,
    activePlanId,
    setBackgroundImage,
    setCurrentPage,
    setStoreNumPages,
    currentPage,
    image,
    setImage,
    setImageScale,
    setStageSize,
    setStageScale,
    setStagePos,
    pdfDoc,
    setPdfDoc,
    numPages,
    setNumPages,
    projectId,
}: UseCanvasMediaParams) => {
    const plans = useTakeoffStore((s) => s.plans);
    const addPlanFromUpload = useTakeoffStore((s) => s.addPlanFromUpload);
    const removePlan = useTakeoffStore((s) => s.removePlan);
    const triggerAutoSave = useTakeoffStore((s) => s.triggerAutoSave);
    const rotations = useTakeoffStore((s) => s.rotations);

    const [planLoadStatus, setPlanLoadStatus] = useState<
        "idle" | "loading" | "ready" | "error"
    >("idle");
    const [planLoadError, setPlanLoadError] = useState<string | null>(null);
    const loadGenerationRef = useRef(0);
    const recoveryAttemptedRef = useRef<Set<string>>(new Set());

    // PDF page picker: every PDF upload goes through the picker, which opens
    // the document ONCE (a separate pdf.js probe here would read the file into
    // memory a second time). Single-page PDFs auto-confirm inside the modal
    // without showing UI; multi-page ones ask which pages to import, so only
    // those are kept and counted toward storage. The modal resolves this
    // deferred promise with the chosen pages + the document's total page
    // count, or null on cancel. `pageSelectFile` drives the modal's visibility.
    const [pageSelectFile, setPageSelectFile] = useState<File | null>(null);
    const pageSelectResolver = useRef<((result: PageSelection | null) => void) | null>(null);
    const askPagesToImport = useCallback((file: File) => {
        setPageSelectFile(file);
        return new Promise<PageSelection | null>((resolve) => {
            pageSelectResolver.current = resolve;
        });
    }, []);
    const resolvePageSelect = useCallback((result: PageSelection | null) => {
        setPageSelectFile(null);
        pageSelectResolver.current?.(result);
        pageSelectResolver.current = null;
    }, []);

    const activePlan = plans.find((plan) => plan.id === activePlanId);
    const activePlanMediaKind = activePlan ? inferPlanMediaKind(activePlan) : "unknown";

    // Track which plan+page has already been fitted so we only reset zoom on first load
    const fittedRef = useRef<Set<string>>(new Set());
    // Natural PDF dimensions (scale=1) for the currently displayed page — used so that
    // imageScale is always containerWidth/pdfNaturalWidth, independent of render quality.
    const naturalSizeRef = useRef<{ width: number; height: number } | null>(null);
    // The unrotated source image for an image plan. Rotation is baked into a
    // derived bitmap for display, so we keep the original to re-rotate from.
    const baseImageRef = useRef<HTMLImageElement | null>(null);
    // Spatial index of PDF vector segments for the currently displayed page.
    // Populated after renderPdfPage; null for raster image plans.
    const pdfSegmentIndexRef = useRef<SegmentIndex | null>(null);
    // Monotonic render generation: every renderPdfPage call bumps it, and a
    // render only commits (setImage/fit) if it is still the newest when its
    // async work resolves — last write wins, so an old page/rotation/quality
    // render resolving late can never stomp a newer one.
    const renderGenRef = useRef(0);
    // What quality the CURRENT bitmap was rendered at, keyed by
    // plan:page:rotation — lets the zoom handler skip re-renders that would
    // not get meaningfully sharper.
    const renderedScaleRef = useRef<{ key: string; scale: number } | null>(null);
    // Object URL backing the current PDF bitmap; revoked when replaced.
    const pdfObjectUrlRef = useRef<string | null>(null);
    // The FROZEN display footprint scale for the current page. Stored
    // measurement coordinates live in bitmap-pixel space at the scale the
    // page was first rendered at (verified against production data: an A3
    // plan's points span ~4x its natural pt size). The drawn footprint must
    // therefore NEVER change for a given page — quality re-renders draw
    // sharper pixels INTO this fixed box, they do not resize it.
    const displayScaleRef = useRef<{ key: string; scale: number } | null>(null);
    // Hi-res region patch: a crop of the current page re-rasterized at the
    // zoomed resolution, drawn over the base bitmap. Coordinates are in
    // display-bitmap px (the same space as pdfDisplaySize and stored points).
    // Drawing scale read off the sheet's text ("1:100") — a calibration
    // suggestion for the UI, keyed by page so a stale page can't apply.
    const [detectedScale, setDetectedScale] = useState<{
        planId: string;
        page: number;
        ratio: number;
    } | null>(null);
    const regionGenRef = useRef(0);
    const regionUrlRef = useRef<string | null>(null);
    const [regionPatch, setRegionPatch] = useState<{
        image: HTMLImageElement;
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null);
    const clearRegionPatch = useCallback(() => {
        regionGenRef.current += 1;
        if (regionUrlRef.current) {
            URL.revokeObjectURL(regionUrlRef.current);
            regionUrlRef.current = null;
        }
        setRegionPatch(null);
    }, []);
    // Pixel box the PDF bitmap is drawn into (natural x displayScale) —
    // passed to the Konva image node so a higher-resolution bitmap cannot
    // grow the plan under existing measurements.
    const [pdfDisplaySize, setPdfDisplaySize] = useState<{
        width: number;
        height: number;
    } | null>(null);

    const fitImageToStage = useCallback(
        (img: HTMLImageElement, fitKey?: string, naturalSize?: { width: number; height: number }, displaySize?: { width: number; height: number } | null) => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            const containerHeight = containerRef.current.offsetHeight;
            if (containerWidth <= 0) return;
            // Use PDF natural dimensions when available so that imageScale is stable
            // regardless of the render quality scale factor. For raster images, img.width
            // is the correct natural size already (no high-res overscaling).
            const refWidth = naturalSize?.width ?? img.width;

            // imageScale stays width-based and MUST NOT change with fit mode —
            // all stored measurement points are in image-pixel space and every
            // coordinate conversion multiplies by imageScale. Fit mode only
            // changes the initial ZOOM (stageScale) and PAN (stagePos), which is
            // exactly what the user's own zoom/pan does, so measurements stay put.
            const scaleFactor = containerWidth / refWidth;
            setImageScale(scaleFactor);

            // The sheet (unzoomed plan footprint) is the plan display bitmap
            // drawn at imageScale — never the container width: stored points
            // live in bitmap-pixel space, making the footprint part of the
            // data model.
            // Footprint = the PINNED display bitmap for PDFs (frozen per page,
            // displayScaleRef) so HD re-renders with a sharper img cannot grow
            // the sheet; rasters have no quality re-render, so the image itself.
            const footprintW = displaySize?.width ?? img.width;
            const footprintH = displaySize?.height ?? img.height;
            const baseStageWidth = footprintW * scaleFactor;
            const baseStageHeight = footprintH * scaleFactor;
            setStageSize({
                width: baseStageWidth,
                height: baseStageHeight,
            });

            // Only set the initial zoom/pan the first time this plan+page shows.
            if (fitKey && !fittedRef.current.has(fitKey)) {
                fittedRef.current.add(fitKey);

                const mode = getCanvasFitMode();
                // Width-fit: sheet width == container width. For raster plans
                // this is 1 (legacy); for PDFs it corrects the legacy behavior
                // of showing the sheet at renderScale x the pane width.
                let initialScale = baseStageWidth > 0 ? containerWidth / baseStageWidth : 1;
                const isPageFit = mode === "page" && baseStageHeight > 0 && containerHeight > 0;
                if (isPageFit) {
                    // Fit-page: scale so the whole plan fits the box, limited by
                    // whichever dimension runs out first, then pull back by
                    // FIT_PAGE_MARGIN so the plan doesn't touch the viewport edges.
                    initialScale = FIT_PAGE_MARGIN * Math.min(
                        containerWidth / baseStageWidth,
                        containerHeight / baseStageHeight,
                    );
                }

                // Center the (scaled) plan in the container. In page mode the plan
                // always fits, so centering is a plain halving of the leftover.
                // Width mode keeps the legacy clamp: a plan taller than the
                // container stays pinned to the top rather than being pushed above
                // the viewport, which would hide the top of the sheet.
                const scaledWidth = baseStageWidth * initialScale;
                const scaledHeight = baseStageHeight * initialScale;
                const centerX = (containerWidth - scaledWidth) / 2;
                const centerY = (containerHeight - scaledHeight) / 2;
                const posX = isPageFit ? centerX : Math.max(0, centerX);
                const posY = isPageFit ? centerY : Math.max(0, centerY);

                setStageScale(initialScale);
                setStagePos({ x: posX, y: posY });
            }
        },
        [containerRef, setImageScale, setStagePos, setStageScale, setStageSize]
    );

    /**
     * Force a re-fit of the currently displayed plan to the view, using the
     * current fit-mode setting. Clears the "already fitted" guard for the active
     * plan+page so fitImageToStage re-applies the initial zoom/pan. Used by the
     * canvas "fit" button and when the fit-mode preference changes.
     */
    const refitToView = useCallback(
        (img: HTMLImageElement | null) => {
            if (!img) return;
            // Drop all fitted keys so the next fit re-applies zoom/pan.
            fittedRef.current.clear();
            fitImageToStage(img, `refit:${activePlanId}:${currentPage}:${Date.now()}`, naturalSizeRef.current ?? undefined);
        },
        [fitImageToStage, activePlanId, currentPage]
    );

    const renderPdfPage = useCallback(
        async (
            pdf: pdfjsLib.PDFDocumentProxy,
            pageNum: number,
            planId?: string,
            rotation = 0
        ) => {
            const gen = ++renderGenRef.current;
            clearRegionPatch();
            const page = await pdf.getPage(pageNum);

            // Base viewport at scale=1 gives stable natural dimensions that we use for
            // imageScale. This decouples point-coordinate space from render quality.
            const baseViewport = page.getViewport({ scale: 1, rotation });
            const naturalSize = { width: baseViewport.width, height: baseViewport.height };
            naturalSizeRef.current = naturalSize;

            // Freeze this page's display footprint the first time it renders,
            // using the exact legacy formula — stored measurements are in that
            // bitmap-pixel space, so the footprint is part of the data model.
            const key = `${planId ?? "?"}:${pageNum}:${rotation}`;
            if (displayScaleRef.current?.key !== key) {
                displayScaleRef.current = {
                    key,
                    scale: documentDisplayScale(baseViewport.width, baseViewport.height),
                };
            }
            const displayScale = displayScaleRef.current.scale;

            // The base bitmap renders once, at the footprint scale. Zoom detail
            // comes from refreshRegionPatch, which re-rasterizes only the
            // visible crop and overlays it - the base never re-renders, so
            // nothing can move and memory stays flat.
            const scale = capRenderScale(
                displayScale,
                baseViewport.width,
                baseViewport.height
            );
            const viewport = page.getViewport({ scale, rotation });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) return;

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // White background since alpha: false strips transparency
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            await page.render({ canvasContext: ctx, viewport, canvas }).promise;

            // Build the PDF line-segment index for snapping (async, off the render
            // path). Extraction walks the whole operator list, so results are
            // cached per plan+page in IndexedDB — reopening a heavy CAD sheet
            // hits the cache instead of re-walking.
            void (async () => {
                const cacheKey = planId ? segmentCacheKey(planId, pageNum) : null;
                let segments = cacheKey ? await getCachedSegments(cacheKey) : null;
                if (!segments) {
                    segments = await extractPdfSegments(page);
                    if (cacheKey) void setCachedSegments(cacheKey, segments);
                }
                const index = new SegmentIndex(50);
                for (const seg of segments) index.add(seg);
                pdfSegmentIndexRef.current = index;
            })().catch((error) => console.warn("Segment index failed:", error));

            // Read the drawing scale off the sheet text (suggestion only).
            if (planId) {
                void detectDrawingScale(page)
                    .then((found) => {
                        if (found) setDetectedScale({ planId, page: pageNum, ratio: found.ratio });
                        else setDetectedScale(null);
                    })
                    .catch(() => setDetectedScale(null));
            }

            // toBlob + object URL instead of toDataURL: encoding is async (no
            // main-thread stall on multi-megapixel canvases) and skips the
            // base64 copy of the whole bitmap.
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.92)
            );
            if (!blob) return;
            // A newer render started while this one worked — drop it.
            if (gen !== renderGenRef.current) return;

            const url = URL.createObjectURL(blob);
            const img = new window.Image();
            img.src = url;
            try {
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error("Failed to render PDF page to image"));
                });
            } catch (error) {
                URL.revokeObjectURL(url);
                throw error;
            }
            if (gen !== renderGenRef.current) {
                URL.revokeObjectURL(url);
                return;
            }
            if (pdfObjectUrlRef.current) URL.revokeObjectURL(pdfObjectUrlRef.current);
            pdfObjectUrlRef.current = url;

            setImage(img);
            setPdfDisplaySize({
                width: naturalSize.width * displayScale,
                height: naturalSize.height * displayScale,
            });
            fitImageToStage(img, planId ? `${planId}:${pageNum}:${rotation}` : undefined, naturalSize, {
                width: naturalSize.width * displayScale,
                height: naturalSize.height * displayScale,
            });
            renderedScaleRef.current = { key, scale };
        },
        [containerRef, fitImageToStage, setImage, clearRegionPatch]
    );

    const uploadPlanToCloud = useCallback(
        async (planId: string, file: File, pageCount: number) => {
            // Prefer the prop, fall back to the store (avoids closure staleness on first mount).
            const effectiveProjectId =
                projectId ?? useTakeoffStore.getState().currentProjectId ?? undefined;
            if (!effectiveProjectId) {
                console.warn(
                    "[plan-upload] skipped — no projectId available in prop or store."
                );
                setPlanLoadStatus("error");
                setPlanLoadError(
                    "Cannot upload — project ID not ready. Wait for the project to finish loading and try again."
                );
                return;
            }
            const sortOrder = plans.length - 1;
            // Pick up whatever discipline was assigned when the plan was
            // added to the store (via the sidebar picker).
            const currentPlan = useTakeoffStore
                .getState()
                .plans.find((p) => p.id === planId);
            const discipline = currentPlan?.discipline ?? null;
            try {
                const response = await planService.uploadPlan(
                    effectiveProjectId,
                    file,
                    pageCount,
                    planId,
                    sortOrder,
                    discipline
                );
                const uploaded = response.data?.plan;
                if (!uploaded?.url) {
                    // Keep the plan locally so the user doesn't lose it — surface the error.
                    console.error("Plan upload response missing URL:", response);
                    setPlanLoadStatus("error");
                    setPlanLoadError(
                        "Upload succeeded but the server returned no file URL. The plan is still visible locally — try re-uploading."
                    );
                    return;
                }

                useTakeoffStore.setState((state) => ({
                    plans: state.plans.map((plan) =>
                        plan.id === planId
                            ? {
                                  ...plan,
                                  url: uploaded.url,
                                  filename: uploaded.filename ?? plan.filename,
                                  mimeType: uploaded.mime_type ?? file.type,
                                  pageCount: uploaded.page_count ?? pageCount,
                              }
                            : plan
                    ),
                }));
                triggerAutoSave();
            } catch (error) {
                // Do NOT remove the plan on failure — the user's local render is still valid
                // and losing it silently is worse than a stuck "unsynced" state. Surface the
                // real server message so we can see the actual cause.
                const message =
                    error instanceof Error ? error.message : "Unknown error";
                console.error("Plan cloud upload failed:", error);
                setPlanLoadStatus("error");
                setPlanLoadError(`Upload failed: ${message}`);
            }
        },
        [plans.length, projectId, triggerAutoSave]
    );

    const loadPlanFromCloudinary = useCallback(
        async (planId: string, url: string, planMeta: typeof activePlan, isStale?: () => boolean) => {
            const loaded = await loadPlanFromRemoteUrl(url, planMeta ?? {});

            // A newer load superseded this one while the fetch/parse ran
            // (StrictMode double-mount, fast plan switching). Publishing the
            // stale document via setPlanPdf would DESTROY the live one it
            // replaces — pdf.js then throws "Transport destroyed" mid-render.
            if (isStale?.()) {
                if (loaded.kind === "pdf" && loaded.pdf) {
                    try {
                        void loaded.pdf.destroy();
                    } catch {
                        // already gone
                    }
                }
                return;
            }

            if (loaded.kind === "pdf" && loaded.pdf) {
                setPlanPdf(planId, loaded.pdf);
                setPdfDoc(loaded.pdf);
                setBackgroundImage(null);
                const pages = loaded.pdf.numPages;
                setNumPages(pages);
                setStoreNumPages(pages);
                const page = Math.min(currentPage, pages) || 1;
                setCurrentPage(page);
                await renderPdfPage(loaded.pdf, page, planId, rotations[page] ?? 0);
                return;
            }

            if (loaded.kind === "image" && loaded.imageSrc) {
                pdfSegmentIndexRef.current = null;
                setPdfDoc(null);
                setPdfDisplaySize(null);
                setBackgroundImage(loaded.imageSrc.startsWith("blob:") ? url : loaded.imageSrc);
                setNumPages(1);
                setStoreNumPages(1);
                setCurrentPage(1);

                const img = new window.Image();
                img.crossOrigin = "anonymous";
                img.src = loaded.imageSrc;
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error("Failed to display plan image"));
                });
                setImage(img);
                fitImageToStage(img, `${planId}:1`);
            }
        },
        [
            currentPage,
            fitImageToStage,
            renderPdfPage,
            setBackgroundImage,
            setCurrentPage,
            setImage,
            setNumPages,
            setPdfDoc,
            setStoreNumPages,
        ]
    );

    // Clear the displayed plan the instant the active plan changes, so the
    // previous plan's rendered bitmap never lingers on the canvas while the new
    // plan loads (or if its load is skipped/errors). Without this, switching
    // plans showed the previous plan's drawing under the new plan's header.
    const shownPlanRef = useRef<string | null>(null);
    useEffect(() => {
        if (shownPlanRef.current !== null && shownPlanRef.current !== activePlanId) {
            // Clear the previous plan's rendered bitmap so it can't linger under
            // the new plan while it loads.
            setImage(null);
            baseImageRef.current = null;
            naturalSizeRef.current = null;
            pdfSegmentIndexRef.current = null;
            // Only drop pdfDoc when the new plan has its own PDF ready to swap in
            // (a cache hit). Otherwise leave the old pdfDoc until the load/restore
            // effect replaces it — nulling it on a cache miss would strand a
            // multi-page PDF with no document (breaking page navigation and
            // hiding the page panel).
            if (activePlanId && getPlanPdf(activePlanId)) {
                setPdfDoc(null);
                setPdfDisplaySize(null);
            }
        }
        shownPlanRef.current = activePlanId;
    }, [activePlanId, setImage, setPdfDoc]);

    // Load plan file from Cloudinary when local cache / background is missing.
    useEffect(() => {
        if (!activePlanId) {
            setPlanLoadStatus("idle");
            setPlanLoadError(null);
            return;
        }

        if (!activePlan?.url) {
            if (projectId && isProjectSyncDisabled(projectId)) {
                setPlanLoadStatus("error");
                setPlanLoadError(
                    "Plan file URL is missing in local-only mode. Reconnect to the source API or re-upload the plan."
                );
                return;
            }

            // Saved projects can open before plan URLs are merged back from API.
            // Attempt one recovery fetch per plan/project before surfacing an error.
            if (!projectId) {
                setPlanLoadStatus("error");
                setPlanLoadError("Plan file is not available yet. Try refreshing or re-uploading.");
                return;
            }

            const recoveryKey = `${projectId}:${activePlanId}`;
            if (!recoveryAttemptedRef.current.has(recoveryKey)) {
                recoveryAttemptedRef.current.add(recoveryKey);
                setPlanLoadStatus("loading");
                setPlanLoadError(null);
                void fetchAndMergeProjectPlans(projectId).catch((error) => {
                    console.warn("Plan recovery fetch failed:", error);
                });
                return;
            }

            setPlanLoadStatus("error");
            setPlanLoadError("Plan file is not available yet. Try refreshing or re-uploading.");
            return;
        }

        const isPdf = activePlanMediaKind === "pdf" || activePlanMediaKind === "unknown";
        const hasLocalPdf = isPdf && Boolean(getPlanPdf(activePlanId));
        const hasLocalImage =
            activePlanMediaKind === "image" &&
            Boolean(
                backgroundImage &&
                    (backgroundImage.startsWith("data:") ||
                        backgroundImage.startsWith("blob:") ||
                        (backgroundImage.startsWith("http") &&
                            backgroundImage === activePlan.url))
            );

        if (hasLocalPdf || hasLocalImage) {
            setPlanLoadStatus("ready");
            setPlanLoadError(null);
            return;
        }

        const generation = ++loadGenerationRef.current;
        setPlanLoadStatus("loading");
        setPlanLoadError(null);

        void (async () => {
            try {
                await loadPlanFromCloudinary(
                    activePlanId,
                    activePlan.url!,
                    activePlan,
                    () => generation !== loadGenerationRef.current
                );
                if (generation === loadGenerationRef.current) {
                    setPlanLoadStatus("ready");
                    setPlanLoadError(null);
                    triggerAutoSave();
                }
            } catch (error) {
                if (generation === loadGenerationRef.current) {
                    console.warn("Failed to load plan from Cloudinary:", error);
                    setPlanLoadStatus("error");
                    setPlanLoadError(
                        error instanceof Error ? error.message : "Could not load plan file"
                    );
                }
            }
        })();

        return () => {
            loadGenerationRef.current += 1;
        };
    }, [
        activePlan,
        activePlan?.filename,
        activePlan?.mimeType,
        activePlan?.url,
        activePlanId,
        activePlanMediaKind,
        backgroundImage,
        projectId,
        loadPlanFromCloudinary,
        triggerAutoSave,
    ]);

    // Restore image background (local data URL or persisted Cloudinary image URL).
    useEffect(() => {
        if (!backgroundImage) {
            return;
        }

        if (activePlanMediaKind === "pdf") {
            return;
        }

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = backgroundImage;
        img.onload = () => {
            baseImageRef.current = img;
            setPdfDoc(null);
                setPdfDisplaySize(null);
            // Bake the active plan/page rotation into the displayed bitmap.
            const rot = rotations[currentPage] ?? 0;
            void rotateImageElement(img, rot).then((displayImg) => {
                setImage(displayImg);
                fitImageToStage(displayImg, activePlanId ? `${activePlanId}:1:${rot}` : undefined);
                setPlanLoadStatus("ready");
            });
        };
        img.onerror = () => {
            console.warn("Failed to display plan image from source:", backgroundImage);
            setPlanLoadStatus("error");
            setPlanLoadError("Failed to display plan image");
        };
        // `rotations` intentionally omitted (same reason as the PDF restore
        // effect above): initial load reads the rotation once; rotation CHANGES
        // are handled solely by the [currentRotation] effect, so depending on
        // `rotations` here would cause a duplicate, racing re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activePlanMediaKind,
        backgroundImage,
        fitImageToStage,
        setImage,
        setPdfDoc,
        activePlanId,
        currentPage,
    ]);

    // Restore cached PDF when switching to a PDF plan.
    useEffect(() => {
        if (!activePlanId) return;
        if (activePlanMediaKind === "image" && backgroundImage) {
            return;
        }

        const cachedPdf = getPlanPdf(activePlanId);
        if (!cachedPdf) return;

        setPdfDoc(cachedPdf);
        // Republish the page count. The cloud-load path sets this, but a cache
        // hit skipped it — so re-opening a project (which restores from cache)
        // left numPages at 0 and the page-navigation panel, gated on
        // numPages > 1, vanished for multi-page plans.
        setNumPages(cachedPdf.numPages);
        setStoreNumPages(cachedPdf.numPages);
        setPlanLoadStatus("loading");
        void renderPdfPage(cachedPdf, currentPage, activePlanId, rotations[currentPage] ?? 0)
            .then(() => {
                setPlanLoadStatus("ready");
                setPlanLoadError(null);
            })
            .catch((error) => {
                console.warn("Failed to render cached PDF page:", error);
                setPlanLoadStatus("error");
                setPlanLoadError("Failed to render plan page");
            });
        // NOTE: `rotations` is intentionally NOT a dependency. This restore
        // effect must only re-render on plan/page changes. If it also fired on
        // rotation, it produced a second, racing re-render (the rotate-render of
        // the old page could resolve after a page navigation, stranding a
        // rotated bitmap on a page whose stored rotation is 0 — making it look
        // like every page got rotated). The dedicated [currentRotation] effect
        // in FloorPlanCanvas is the sole rotation-driven re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activePlanId,
        activePlanMediaKind,
        backgroundImage,
        currentPage,
        renderPdfPage,
        setPdfDoc,
        setNumPages,
        setStoreNumPages,
    ]);

    // Keep base image sizing in sync with container changes without resetting user zoom/pan.
    useEffect(() => {
        if (!image || !containerRef.current) return;

        const observer = new ResizeObserver(() => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            if (containerWidth <= 0) return;
            const natural = naturalSizeRef.current;
            const refWidth = natural?.width ?? image.width;
            const scaleFactor = containerWidth / refWidth;
            setImageScale(scaleFactor);
            // Same bitmap-based footprint as fitImageToStage: the sheet must
            // track the displayed image, not the container.
            setStageSize({
                width: (pdfDisplaySize?.width ?? image.width) * scaleFactor,
                height: (pdfDisplaySize?.height ?? image.height) * scaleFactor,
            });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [containerRef, image, pdfDisplaySize, setImageScale, setStageSize]);

    const MAX_FILE_SIZE_MB = 250;
    /**
     * Handle a plan file pick. Resolves with the new plan's id once the plan
     * has been added to the store (so callers can attach metadata like the
     * discipline to the RIGHT plan), or null if the pick was empty, invalid,
     * or cancelled in the page picker. The File is captured synchronously
     * before any await, so callers may clear the input right after calling.
     */
    const handleFileUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>): Promise<string | null> => {
            const file = e.target.files?.[0];
            if (!file) return null;

            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                setPlanLoadStatus("error");
                setPlanLoadError(`File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`);
                return null;
            }

            const ALLOWED_TYPES = new Set([
                "application/pdf",
                "image/jpeg",
                "image/png",
            ]);
            // DXF has no reliable MIME type, so accept it by extension too.
            const fileIsDxf = isDxfFile(file);
            if (!ALLOWED_TYPES.has(file.type) && !fileIsDxf) {
                setPlanLoadStatus("error");
                setPlanLoadError(
                    "Only PDF, JPEG, PNG, and DXF files are supported. Convert other formats (incl. DWG → DXF) before uploading."
                );
                return null;
            }

            // PDFs: the picker opens the document (single-page ones auto-confirm
            // with no UI). If the user keeps only some pages, rebuild a PDF of
            // just those (vector preserved, so no crispness loss) so only the
            // kept pages are uploaded and count toward storage. Keeping every
            // page uploads the original File untouched — no rebuild.
            let uploadFile = file;
            if (file.type === "application/pdf") {
                const chosen = await askPagesToImport(file);
                if (!chosen) return null; // cancelled — nothing uploaded
                if (chosen.pages.length < chosen.totalPages) {
                    try {
                        const { buildTrimmedPdf } = await import("@/utils/pdfPageSelect");
                        uploadFile = await buildTrimmedPdf(file, chosen.pages);
                    } catch (error) {
                        // If splitting fails, fall back to the whole file — the
                        // PDF branch below will surface any real open error.
                        console.warn("[canvas-media] page trim failed, uploading whole file", error);
                        uploadFile = file;
                    }
                }
            }

            const name = uploadFile.name.replace(/\.[^.]+$/, "");
            const planId = addPlanFromUpload(name, {
                filename: uploadFile.name,
                mimeType: uploadFile.type,
                pageCount: 1,
            });

            setPlanLoadStatus("loading");
            setPlanLoadError(null);

            // A parse failure used to reject unhandled, leaving planLoadStatus
            // stuck on "loading" forever with a half-added plan in the store.
            const failPlan = (message: string, error: unknown) => {
                console.warn("[canvas-media] plan upload failed", error);
                setPlanLoadStatus("error");
                setPlanLoadError(message);
                removePlan(planId);
            };

            if (fileIsDxf) {
                // Rasterize the DXF to a PNG, then hand off exactly like an
                // image plan (single page; user calibrates as usual).
                try {
                    const { rasterizeDxf } = await import("@/utils/dxfRasterizer");
                    const text = await file.text();
                    const { dataUrl } = await rasterizeDxf(text);
                    setPdfDoc(null);
                setPdfDisplaySize(null);
                    setNumPages(1);
                    setStoreNumPages(1);
                    setCurrentPage(1);
                    setBackgroundImage(dataUrl);
                    const img = new window.Image();
                    img.onerror = (error) => {
                        failPlan("The DXF was parsed but its image could not be built.", error);
                    };
                    img.onload = () => {
                        setImage(img);
                        fitImageToStage(img, `${planId}:1`);
                        setPlanLoadStatus("ready");
                    };
                    img.src = dataUrl;
                    // Upload the original DXF so it re-loads on other devices.
                    void uploadPlanToCloud(planId, file, 1);
                } catch (error) {
                    failPlan(
                        "This DXF could not be opened. Only DXF (not DWG) is supported, and it must contain line geometry.",
                        error
                    );
                }
            } else if (uploadFile.type === "application/pdf") {
                try {
                    const pdfjsLib = await loadPdfjs();
                    // Use the (possibly trimmed) upload file so the canvas shows
                    // exactly what was imported and stored.
                    const buffer = await uploadFile.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                    setPlanPdf(planId, pdf);
                    setPdfDoc(pdf);
                    setBackgroundImage(null);
                    setNumPages(pdf.numPages);
                    setStoreNumPages(pdf.numPages);
                    setCurrentPage(1);
                    await renderPdfPage(pdf, 1, planId, rotations[1] ?? 0);
                    setPlanLoadStatus("ready");
                    void uploadPlanToCloud(planId, uploadFile, pdf.numPages);
                } catch (error) {
                    failPlan(
                        "This PDF could not be opened. It may be corrupted or password-protected.",
                        error
                    );
                }
            } else if (file.type.startsWith("image/")) {
                setPdfDoc(null);
                setPdfDisplaySize(null);
                setNumPages(1);
                setStoreNumPages(1);
                setCurrentPage(1);
                const reader = new FileReader();
                reader.onerror = (error) => {
                    failPlan("This image could not be read.", error);
                };
                reader.onload = (ev) => {
                    const imageDataUrl = ev.target?.result as string;
                    setBackgroundImage(imageDataUrl);
                    const img = new window.Image();
                    img.onerror = (error) => {
                        failPlan(
                            "This image could not be opened. It may be corrupted.",
                            error
                        );
                    };
                    img.onload = () => {
                        setImage(img);
                        fitImageToStage(img, `${planId}:1`);
                        setPlanLoadStatus("ready");
                    };
                    img.src = imageDataUrl;
                };
                reader.readAsDataURL(file);
                void uploadPlanToCloud(planId, file, 1);
            }
            return planId;
        },
        [
            askPagesToImport,
            addPlanFromUpload,
            removePlan,
            fitImageToStage,
            renderPdfPage,
            setBackgroundImage,
            setCurrentPage,
            setImage,
            setNumPages,
            setPdfDoc,
            setStoreNumPages,
            uploadPlanToCloud,
        ]
    );

    const changePage = useCallback(
        (delta: number) => {
            if (!pdfDoc) return;
            const newPage = Math.max(1, Math.min(numPages, currentPage + delta));
            if (newPage !== currentPage) {
                setCurrentPage(newPage);
                void renderPdfPage(pdfDoc, newPage, activePlanId ?? undefined, rotations[newPage] ?? 0);
            }
        },
        [pdfDoc, numPages, currentPage, activePlanId, renderPdfPage, setCurrentPage, rotations]
    );

    const rerenderCurrentPage = useCallback(() => {
        const rotation = rotations[currentPage] ?? 0;
        if (pdfDoc) {
            void renderPdfPage(pdfDoc, currentPage, activePlanId ?? undefined, rotation);
        } else if (baseImageRef.current) {
            // Image plan: bake the new rotation into the displayed bitmap.
            const base = baseImageRef.current;
            void rotateImageElement(base, rotation).then((displayImg) => {
                setImage(displayImg);
                fitImageToStage(
                    displayImg,
                    activePlanId ? `${activePlanId}:${currentPage}:${rotation}` : undefined
                );
            });
        }
    }, [pdfDoc, currentPage, activePlanId, renderPdfPage, rotations, setImage, fitImageToStage]);

    /**
     * Re-rasterize only the VISIBLE crop of the current PDF page at the zoomed
     * resolution and overlay it on the base bitmap (regionPatch). Called
     * (debounced) when zoom/pan settle. The base bitmap never re-renders, so a
     * deep zoom costs ~1-2 MP instead of a full-page 30+ MP re-render. Raster
     * image plans are skipped: their source pixels are all the detail there is.
     */
    const refreshRegionPatch = useCallback(
        async (stageZoom: number, stagePosNow: { x: number; y: number }) => {
            const container = containerRef.current;
            if (!pdfDoc || !activePlanId || !container) return;
            const natural = naturalSizeRef.current;
            const dispEntry = displayScaleRef.current;
            if (!natural || !dispEntry) return;
            const rotation = rotations[currentPage] ?? 0;
            // Ignore calls that race a page/rotation change.
            if (dispEntry.key !== `${activePlanId}:${currentPage}:${rotation}`) return;

            const displayScale = dispEntry.scale;
            const dpr = window.devicePixelRatio || 1;
            const viewW = container.offsetWidth;
            const viewH = container.offsetHeight;
            if (viewW <= 0 || viewH <= 0) return;
            const imageScaleNow = viewW / natural.width;

            // Device pixels per display-bitmap pixel: <= ~1 means the base
            // bitmap already out-resolves the screen - no patch needed.
            const devicePerDisplay = imageScaleNow * stageZoom * dpr;
            if (devicePerDisplay <= 1.15) {
                clearRegionPatch();
                return;
            }

            // Visible window in display-bitmap px, padded 15% so small pans
            // don't immediately fall off the sharp region.
            const dispW = natural.width * displayScale;
            const dispH = natural.height * displayScale;
            const denom = stageZoom * imageScaleNow;
            const x0 = Math.max(0, -stagePosNow.x / denom);
            const y0 = Math.max(0, -stagePosNow.y / denom);
            const x1 = Math.min(dispW, (viewW - stagePosNow.x) / denom);
            const y1 = Math.min(dispH, (viewH - stagePosNow.y) / denom);
            if (x1 <= x0 || y1 <= y0) {
                clearRegionPatch();
                return;
            }
            const padX = (x1 - x0) * 0.15;
            const padY = (y1 - y0) * 0.15;
            const rx0 = Math.max(0, x0 - padX);
            const ry0 = Math.max(0, y0 - padY);
            const rx1 = Math.min(dispW, x1 + padX);
            const ry1 = Math.min(dispH, y1 + padY);

            // Natural-pt -> rendered-px scale for the patch: enough for the
            // screen, capped by a pixel budget and a sanity multiple.
            const regionPtW = (rx1 - rx0) / displayScale;
            const regionPtH = (ry1 - ry0) / displayScale;
            let renderScale = displayScale * devicePerDisplay;
            renderScale = Math.min(renderScale, displayScale * 8);
            renderScale = Math.min(
                renderScale,
                Math.sqrt(12_000_000 / Math.max(1, regionPtW * regionPtH))
            );
            if (renderScale <= displayScale * 1.1) {
                clearRegionPatch();
                return;
            }

            const gen = ++regionGenRef.current;
            try {
                const page = await pdfDoc.getPage(currentPage);
                if (gen !== regionGenRef.current) return;
                const viewport = page.getViewport({ scale: renderScale, rotation });
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(regionPtW * renderScale));
                canvas.height = Math.max(1, Math.round(regionPtH * renderScale));
                const ctx = canvas.getContext("2d", { alpha: false });
                if (!ctx) return;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                await page.render({
                    canvasContext: ctx,
                    viewport,
                    canvas,
                    // One-shot render: print intent skips pdf.js's rAF-chunked
                    // scheduling, so a patch still completes if the tab is
                    // backgrounded mid-zoom, and small patches finish faster.
                    intent: "print",
                    // Shift the page so the crop starts at the canvas origin.
                    transform: [
                        1, 0, 0, 1,
                        -(rx0 / displayScale) * renderScale,
                        -(ry0 / displayScale) * renderScale,
                    ],
                }).promise;
                if (gen !== regionGenRef.current) return;

                const blob = await new Promise<Blob | null>((resolve) =>
                    canvas.toBlob(resolve, "image/jpeg", 0.92)
                );
                if (!blob || gen !== regionGenRef.current) return;
                const url = URL.createObjectURL(blob);
                const img = new window.Image();
                img.src = url;
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error("region patch decode failed"));
                });
                if (gen !== regionGenRef.current) {
                    URL.revokeObjectURL(url);
                    return;
                }
                if (regionUrlRef.current) URL.revokeObjectURL(regionUrlRef.current);
                regionUrlRef.current = url;
                setRegionPatch({
                    image: img,
                    x: rx0,
                    y: ry0,
                    width: rx1 - rx0,
                    height: ry1 - ry0,
                });
            } catch (error) {
                console.warn("Region patch render failed:", error);
            }
        },
        [pdfDoc, activePlanId, currentPage, rotations, containerRef, clearRegionPatch]
    );

    // Display footprint scale (bitmap px per PDF pt) for ANY page of the active
    // plan, not just the one on screen. documentDisplayScale depends on the
    // sheet's natural size, so an A1 and an A3 page in the same PDF land on
    // different px-per-metre — apply-to-all calibration needs each page's own
    // value to convert a scale set on one page. Memoised per plan:page; image
    // and DXF plans (single page, no pdfDoc) return the current display scale.
    const pageDisplayScaleCache = useRef<Map<string, number>>(new Map());
    const getPageDisplayScale = useCallback(
        async (page: number): Promise<number> => {
            const current = displayScaleRef.current?.scale ?? 1;
            if (!pdfDoc || !activePlanId) return current;
            const key = `${activePlanId}:${page}`;
            const cached = pageDisplayScaleCache.current.get(key);
            if (cached !== undefined) return cached;
            try {
                const pdfPage = await pdfDoc.getPage(page);
                const viewport = pdfPage.getViewport({ scale: 1 });
                // Rotation swaps width/height but the formula uses the longest
                // edge, so the footprint scale is rotation-invariant.
                const scale = documentDisplayScale(viewport.width, viewport.height);
                pageDisplayScaleCache.current.set(key, scale);
                return scale;
            } catch (error) {
                console.warn("[canvas-media] could not read page size", page, error);
                return current;
            }
        },
        [pdfDoc, activePlanId]
    );

    const hasLoadedPlan = Boolean(image);
    const currentRotation = rotations[currentPage] ?? 0;

    return {
        handleFileUpload,
        getPageDisplayScale,
        // PDF page-picker modal wiring (consumed by PlanNavigator).
        pageSelectFile,
        resolvePageSelect,
        changePage,
        rerenderCurrentPage,
        refreshRegionPatch,
        regionPatch,
        refitToView,
        hasLoadedPlan,
        planLoadStatus,
        planLoadError,
        currentRotation,
        // Natural PDF page dimensions at scale=1 — use these (not image.width/height) when
        // computing rotation point transforms so the math is independent of render quality.
        pdfNaturalSize: naturalSizeRef.current,
        // Fixed footprint (px) the PDF bitmap must be drawn into — stored
        // measurement coords live in this space, so the Konva node pins to it.
        pdfDisplaySize,
        // Spatial index of PDF vector line segments for the current page — used for snap-to-line.
        pdfSegmentIndexRef,
        // Drawing scale detected from the sheet text — calibration suggestion.
        detectedScale,
    };
};
