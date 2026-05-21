import { useCallback, useEffect } from "react";
import type React from "react";
import * as pdfjsLib from "pdfjs-dist";

interface UseCanvasMediaParams {
    containerRef: React.RefObject<HTMLDivElement | null>;
    backgroundImage: string | null;
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
}

export const useCanvasMedia = ({
    containerRef,
    backgroundImage,
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
}: UseCanvasMediaParams) => {
    // Restore persisted image backgrounds from store (for non-PDF plans).
    useEffect(() => {
        if (!backgroundImage) return;

        const img = new window.Image();
        img.src = backgroundImage;
        img.onload = () => {
            setImage(img);
            setPdfDoc(null);

            if (containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const scaleFactor = containerWidth / img.width;
                setImageScale(scaleFactor);
                setStageSize({
                    width: containerWidth,
                    height: img.height * scaleFactor,
                });
                setStageScale(1);
                setStagePos({ x: 0, y: 0 });
            }
        };
    }, [
        backgroundImage,
        containerRef,
        setImage,
        setImageScale,
        setPdfDoc,
        setStagePos,
        setStageScale,
        setStageSize,
    ]);

    // Handle PDF upload and rendering
    const renderPdfPage = useCallback(
        async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            setImage(canvas as unknown as HTMLImageElement);

            // Calculate dimensions to fit the container width
            if (containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const scaleFactor = containerWidth / canvas.width;

                // Store the image scale factor
                setImageScale(scaleFactor);

                // Set canvas size to match scaled image dimensions
                setStageSize({
                    width: containerWidth,
                    height: canvas.height * scaleFactor,
                });

                // Reset stage transformations
                setStageScale(1);
                setStagePos({ x: 0, y: 0 });
            }
        },
        [
            containerRef,
            setImage,
            setImageScale,
            setStagePos,
            setStageScale,
            setStageSize,
        ]
    );

    // Handle file upload
    const handleFileUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.type === "application/pdf") {
                const buffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                setPdfDoc(pdf);
                setBackgroundImage(null);
                setNumPages(pdf.numPages);
                setStoreNumPages(pdf.numPages);
                setCurrentPage(1);
                renderPdfPage(pdf, 1);
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

                        // Calculate dimensions to fit the container width
                        if (containerRef.current) {
                            const containerWidth = containerRef.current.offsetWidth;
                            const scaleFactor = containerWidth / img.width;

                            // Store the image scale factor
                            setImageScale(scaleFactor);

                            // Set canvas size to match scaled image dimensions
                            setStageSize({
                                width: containerWidth,
                                height: img.height * scaleFactor,
                            });

                            // Reset stage transformations
                            setStageScale(1);
                            setStagePos({ x: 0, y: 0 });
                        }
                    };
                };
                reader.readAsDataURL(file);
            }
        },
        [
            containerRef,
            renderPdfPage,
            setBackgroundImage,
            setCurrentPage,
            setImage,
            setImageScale,
            setNumPages,
            setPdfDoc,
            setStagePos,
            setStageScale,
            setStageSize,
            setStoreNumPages,
        ]
    );

    // Handle PDF page navigation
    const changePage = useCallback(
        (delta: number) => {
            if (!pdfDoc) return;
            const newPage = Math.max(1, Math.min(numPages, currentPage + delta));
            if (newPage !== currentPage) {
                setCurrentPage(newPage);
                renderPdfPage(pdfDoc, newPage);
            }
        },
        [pdfDoc, numPages, currentPage, renderPdfPage, setCurrentPage]
    );

    const hasLoadedPlan = Boolean(image);

    return {
        handleFileUpload,
        changePage,
        hasLoadedPlan,
    };
};

