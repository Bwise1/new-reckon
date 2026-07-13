import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type * as pdfjsLib from "pdfjs-dist";
import { planService } from "@/services/plan.service";
import { fetchAndMergeProjectPlans } from "@/services/planSync.service";
import { isProjectSyncDisabled } from "@/services/projectSync.service";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { getPlanPdf, setPlanPdf } from "@/utils/planPdfCache";
import { inferPlanMediaKind, loadPlanFromRemoteUrl } from "@/utils/planMediaLoader";

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
    const triggerAutoSave = useTakeoffStore((s) => s.triggerAutoSave);

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

    const fitImageToStage = useCallback(
        (img: HTMLImageElement, fitKey?: string) => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            if (containerWidth <= 0) return;
            const scaleFactor = containerWidth / img.width;
            setImageScale(scaleFactor);
            setStageSize({
                width: containerWidth,
                height: img.height * scaleFactor,
            });
            // Only reset zoom/pan on the very first time this plan+page is displayed
            if (fitKey && !fittedRef.current.has(fitKey)) {
                fittedRef.current.add(fitKey);
                setStageScale(1);
                setStagePos({ x: 0, y: 0 });
            }
        },
        [containerRef, setImageScale, setStagePos, setStageScale, setStageSize]
    );

    const renderPdfPage = useCallback(
        async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number, planId?: string) => {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;

            const img = new window.Image();
            img.src = canvas.toDataURL();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Failed to render PDF page to image"));
            });
            setImage(img);
            fitImageToStage(img, planId ? `${planId}:${pageNum}` : undefined);
        },
        [fitImageToStage, setImage]
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
                await renderPdfPage(loaded.pdf, page, planId);
                return;
            }

            if (loaded.kind === "image" && loaded.imageSrc) {
                setPdfDoc(null);
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
            setImage(img);
            setPdfDoc(null);
            fitImageToStage(img, activePlanId ? `${activePlanId}:1` : undefined);
            setPlanLoadStatus("ready");
        };
        img.onerror = () => {
            console.warn("Failed to display plan image from source:", backgroundImage);
            setPlanLoadStatus("error");
            setPlanLoadError("Failed to display plan image");
        };
    }, [
        activePlanMediaKind,
        backgroundImage,
        fitImageToStage,
        setImage,
        setPdfDoc,
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
        setPlanLoadStatus("loading");
        void renderPdfPage(cachedPdf, currentPage, activePlanId)
            .then(() => {
                setPlanLoadStatus("ready");
                setPlanLoadError(null);
            })
            .catch((error) => {
                console.warn("Failed to render cached PDF page:", error);
                setPlanLoadStatus("error");
                setPlanLoadError("Failed to render plan page");
            });
    }, [
        activePlanId,
        activePlanMediaKind,
        backgroundImage,
        currentPage,
        renderPdfPage,
        setPdfDoc,
    ]);

    // Keep base image sizing in sync with container changes without resetting user zoom/pan.
    useEffect(() => {
        if (!image || !containerRef.current) return;

        const observer = new ResizeObserver(() => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            if (containerWidth <= 0) return;
            const scaleFactor = containerWidth / image.width;
            setImageScale(scaleFactor);
            setStageSize({
                width: containerWidth,
                height: image.height * scaleFactor,
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
            if (!ALLOWED_TYPES.has(file.type)) {
                setPlanLoadStatus("error");
                setPlanLoadError(
                    "Only PDF, JPEG, and PNG files are supported. Convert other formats before uploading."
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

            if (file.type === "application/pdf") {
                const pdfjsLib = await import("pdfjs-dist");
                const buffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                setPlanPdf(planId, pdf);
                setPdfDoc(pdf);
                setBackgroundImage(null);
                setNumPages(pdf.numPages);
                setStoreNumPages(pdf.numPages);
                setCurrentPage(1);
                await renderPdfPage(pdf, 1, planId);
                setPlanLoadStatus("ready");
                void uploadPlanToCloud(planId, file, pdf.numPages);
            } else if (file.type.startsWith("image/")) {
                setPdfDoc(null);
                setNumPages(1);
                setStoreNumPages(1);
                setCurrentPage(1);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const imageDataUrl = ev.target?.result as string;
                    setBackgroundImage(imageDataUrl);
                    const img = new window.Image();
                    img.src = imageDataUrl;
                    img.onload = () => {
                        setImage(img);
                        fitImageToStage(img, `${planId}:1`);
                        setPlanLoadStatus("ready");
                    };
                };
                reader.readAsDataURL(file);
                void uploadPlanToCloud(planId, file, 1);
            }
        },
        [
            addPlanFromUpload,
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
                void renderPdfPage(pdfDoc, newPage, activePlanId ?? undefined);
            }
        },
        [pdfDoc, numPages, currentPage, activePlanId, renderPdfPage, setCurrentPage]
    );

    const hasLoadedPlan = Boolean(image);

    return {
        handleFileUpload,
        changePage,
        hasLoadedPlan,
        planLoadStatus,
        planLoadError,
    };
};
