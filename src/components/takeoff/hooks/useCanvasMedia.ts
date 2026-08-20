import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type * as pdfjsLib from "pdfjs-dist";
import { planService } from "@/services/plan.service";
import { fetchAndMergeProjectPlans } from "@/services/planSync.service";
import { isProjectSyncDisabled } from "@/services/projectSync.service";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { getPlanPdf, setPlanPdf } from "@/utils/planPdfCache";
import { inferPlanMediaKind, loadPlanFromRemoteUrl } from "@/utils/planMediaLoader";
import { extractPdfSegments, SegmentIndex } from "@/utils/pdfLineExtractor";
import { getCanvasFitMode } from "@/utils/canvasPrefs";
import { isDxfFile } from "@/utils/dxfRasterizer";
import { rotateImageElement } from "@/utils/imageRotate";

// Render-quality budget. A page is rasterized at `scale` × its natural (pt)
// size; without a ceiling a large plan at high zoom would allocate a canvas
// big enough to crash the tab (an A0 page at 4× is already 64+ megapixels).
// ~33.5 MP ≈ 134 MB RGBA transient — comfortably inside desktop limits — and
// 8192 px per side stays under every browser's canvas dimension cap.
const MAX_RENDER_PIXELS = 33_500_000;
const MAX_RENDER_DIM = 8192;
const capRenderScale = (scale: number, w: number, h: number) =>
    Math.min(scale, Math.sqrt(MAX_RENDER_PIXELS / (w * h)), MAX_RENDER_DIM / Math.max(w, h));

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
    // Pixel box the PDF bitmap is drawn into (natural x displayScale) —
    // passed to the Konva image node so a higher-resolution bitmap cannot
    // grow the plan under existing measurements.
    const [pdfDisplaySize, setPdfDisplaySize] = useState<{
        width: number;
        height: number;
    } | null>(null);

    const fitImageToStage = useCallback(
        (img: HTMLImageElement, fitKey?: string, naturalSize?: { width: number; height: number }) => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            const containerHeight = containerRef.current.offsetHeight;
            if (containerWidth <= 0) return;
            // Use PDF natural dimensions when available so that imageScale is stable
            // regardless of the render quality scale factor. For raster images, img.width
            // is the correct natural size already (no high-res overscaling).
            const refWidth = naturalSize?.width ?? img.width;
            const refHeight = naturalSize?.height ?? img.height;

            // imageScale stays width-based and MUST NOT change with fit mode —
            // all stored measurement points are in image-pixel space and every
            // coordinate conversion multiplies by imageScale. Fit mode only
            // changes the initial ZOOM (stageScale) and PAN (stagePos), which is
            // exactly what the user's own zoom/pan does, so measurements stay put.
            const scaleFactor = containerWidth / refWidth;
            setImageScale(scaleFactor);

            // The stage (unzoomed) is the plan drawn at imageScale.
            const baseStageWidth = containerWidth;
            const baseStageHeight = refHeight * scaleFactor;
            setStageSize({
                width: baseStageWidth,
                height: baseStageHeight,
            });

            // Only set the initial zoom/pan the first time this plan+page shows.
            if (fitKey && !fittedRef.current.has(fitKey)) {
                fittedRef.current.add(fitKey);

                const mode = getCanvasFitMode();
                let initialScale = 1;
                if (mode === "page" && baseStageHeight > 0 && containerHeight > 0) {
                    // Fit-page: scale up (or down) so the whole plan fits the box,
                    // limited by whichever dimension runs out first.
                    initialScale = Math.min(
                        containerWidth / baseStageWidth,
                        containerHeight / baseStageHeight,
                    );
                }

                // Center the (scaled) plan in the container. In width mode this
                // just balances the leftover height above/below instead of
                // dumping it all below; in page mode it centers the enlarged plan.
                const scaledWidth = baseStageWidth * initialScale;
                const scaledHeight = baseStageHeight * initialScale;
                const posX = Math.max(0, (containerWidth - scaledWidth) / 2);
                const posY = Math.max(0, (containerHeight - scaledHeight) / 2);

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
            rotation = 0,
            qualityScale?: number
        ) => {
            const gen = ++renderGenRef.current;
            const page = await pdf.getPage(pageNum);

            // Determine how many pixels wide the container is right now so we
            // render at exactly the right resolution — no upscaling, no downscaling.
            const containerWidth = containerRef.current?.offsetWidth ?? 1200;
            const dpr = window.devicePixelRatio || 1;

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
                    scale: Math.min(
                        4,
                        Math.max(2, (containerWidth / baseViewport.width) * dpr)
                    ),
                };
            }
            const displayScale = displayScaleRef.current.scale;

            // First paint renders at the footprint scale (exactly the legacy
            // behaviour). Zooming passes a larger qualityScale via
            // refreshRenderQuality: the page is re-rasterized sharper, but the
            // Konva node pins it to the SAME footprint (pdfDisplaySize), so
            // detail improves while nothing moves. The pixel budget caps the
            // canvas so big plans can't blow memory.
            const requested = qualityScale ?? displayScale;
            const scale = capRenderScale(
                Math.max(2, requested),
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

            // Build PDF line segment index for snapping (async, non-blocking for render)
            void extractPdfSegments(page).then((segments) => {
                const index = new SegmentIndex(50);
                for (const seg of segments) index.add(seg);
                pdfSegmentIndexRef.current = index;

            });

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
            fitImageToStage(img, planId ? `${planId}:${pageNum}:${rotation}` : undefined, naturalSize);
            renderedScaleRef.current = { key, scale };
        },
        [containerRef, fitImageToStage, setImage]
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
        async (planId: string, url: string, planMeta: typeof activePlan) => {
            const loaded = await loadPlanFromRemoteUrl(url, planMeta ?? {});

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
                await loadPlanFromCloudinary(activePlanId, activePlan.url!, activePlan);
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
            const refHeight = natural?.height ?? image.height;
            const scaleFactor = containerWidth / refWidth;
            setImageScale(scaleFactor);
            setStageSize({
                width: containerWidth,
                height: refHeight * scaleFactor,
            });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [containerRef, image, setImageScale, setStageSize]);

    const MAX_FILE_SIZE_MB = 250;
    const handleFileUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                setPlanLoadStatus("error");
                setPlanLoadError(`File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`);
                return;
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
                return;
            }

            const name = file.name.replace(/\.[^.]+$/, "");
            const planId = addPlanFromUpload(name, {
                filename: file.name,
                mimeType: file.type,
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
            } else if (file.type === "application/pdf") {
                try {
                    const pdfjsLib = await import("pdfjs-dist");
                    const buffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                    setPlanPdf(planId, pdf);
                    setPdfDoc(pdf);
                    setBackgroundImage(null);
                    setNumPages(pdf.numPages);
                    setStoreNumPages(pdf.numPages);
                    setCurrentPage(1);
                    await renderPdfPage(pdf, 1, planId, rotations[1] ?? 0);
                    setPlanLoadStatus("ready");
                    void uploadPlanToCloud(planId, file, pdf.numPages);
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
        },
        [
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
     * Re-rasterize the current PDF page to match the given zoom, so zooming in
     * shows real detail instead of a stretched bitmap. Called (debounced) when
     * the stage scale settles. Only ever upgrades — zooming back out keeps the
     * sharper bitmap (it downsamples cleanly) — and skips when the sharper
     * render would gain less than ~25%. Raster image plans are skipped: their
     * source pixels are all the detail that exists.
     */
    const refreshRenderQuality = useCallback(
        (stageZoom: number) => {
            if (!pdfDoc || !activePlanId) return;
            const natural = naturalSizeRef.current;
            if (!natural) return;
            const containerWidth = containerRef.current?.offsetWidth ?? 1200;
            const dpr = window.devicePixelRatio || 1;
            const rotation = rotations[currentPage] ?? 0;

            const desired = capRenderScale(
                Math.max(2, (containerWidth / natural.width) * dpr * stageZoom),
                natural.width,
                natural.height
            );

            const key = `${activePlanId}:${currentPage}:${rotation}`;
            const rendered = renderedScaleRef.current;
            if (rendered && rendered.key === key && desired <= rendered.scale * 1.25) return;

            void renderPdfPage(pdfDoc, currentPage, activePlanId, rotation, desired).catch(
                (error) => console.warn("Quality re-render failed:", error)
            );
        },
        [pdfDoc, activePlanId, currentPage, rotations, containerRef, renderPdfPage]
    );

    const hasLoadedPlan = Boolean(image);
    const currentRotation = rotations[currentPage] ?? 0;

    return {
        handleFileUpload,
        changePage,
        rerenderCurrentPage,
        refreshRenderQuality,
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
    };
};
