"use strict";

// #region IMPORTS & INTERFACES

import { Selection } from "d3-selection";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { transition as d3Transition } from "d3-transition";
import { interpolate as d3Interpolate } from "d3-interpolate";
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    caption: string;
    tooltips: VisualTooltipDataItem[];
    dimmed: boolean;
}

interface loadedImage {
    loadSucceeded: boolean;
    image: HTMLImageElement;
}

// #endregion

// ===================================================================
// #region CLASS: FRAME RENDERER
// ===================================================================

/**
 * Handles frame rendering, including image loading, caching, transitions, captions, and progress dots.
 * Binds tooltips and manages DOM updates for each frame.
 * Communicates user selection events via callbacks.
 */
export class FrameRenderer {
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private readonly maxCacheEntries: number = 10;

    constructor(
        private imageContainer: Selection<HTMLDivElement, any, any, any>,
        private captionContainer: Selection<HTMLDivElement, any, any, any>,
        private progressIndicator: Selection<HTMLDivElement, any, any, any>,
        private tooltipServiceWrapper: ITooltipServiceWrapper,
        private onSelect: (identity: ISelectionId) => void,
    ) { }

    /**
 * Renders a specific frame.
 * @param frame The frame data to render.
 * @param allFrames The complete list of frames for context.
 * @param currentIndex The index of the frame to render.
 * @param isForward The direction of the transition.
 * @param transitionDuration The duration of the transition in milliseconds.
 * @param transitionType The type of transition (e.g., "slideHorizontal").
 * @param showCaption Whether to display the caption text.
 */
    public async renderFrame(
        frame: ImageFrame,
        allFrames: ImageFrame[],
        currentIndex: number,
        isForward: boolean,
        transitionDuration: number,
        transitionType: string,
        showCaption: boolean
    ): Promise<void> {
        // Now calls the updated updateCaption method
        this.updateCaption(frame.caption, showCaption);
        this.updateProgressDots(allFrames, currentIndex);
        this.bindTooltips(frame, allFrames);
        this.imageContainer.on("click", () => this.onSelect(frame.identity));

        await this.applyD3Transition(frame, transitionDuration, transitionType, isForward);
    }

    /**
     * Clears all visual elements from the containers.
     */
    public clearContainers(): void {
        this.imageContainer.selectAll("img").remove();
        this.captionContainer.text("");
        this.progressIndicator.selectAll(".dot").remove();
    }

    /**
 * Clears image container.
 */
    public clearImage(): void {
        this.imageContainer.selectAll("img").remove();
    }

    /**
     * Preloads the image for a given frame index into the cache.
     * @param {ImageFrame} frame - The frame whose image should be preloaded.
     */
    public async preloadImage(frame: ImageFrame): Promise<void> {
        if (!frame?.imageUri) return;
        try {
            await this.loadAndDecode(frame.imageUri);
        } catch {
            // Preloading failures are ignored as the main render will handle them.
        }
    }

    /**
     * Updates the caption text container.
     * @param caption The text of the caption.
     * @param showCaption A boolean to determine if the caption should be visible.
     */
    private updateCaption(caption: string, showCaption: boolean): void {
        const newCaption = showCaption ? caption : "";
        this.captionContainer.text(newCaption);
    }

    private updateProgressDots(allFrames: ImageFrame[], currentIndex: number): void {
        const dots = this.progressIndicator.selectAll<HTMLDivElement, ImageFrame>(".dot").data(allFrames);
        dots.enter().append("div").classed("dot", true)
            .on("click", (event, d) => this.onSelect(d.identity))
            .merge(dots)
            .classed("active", (d, i) => i === currentIndex)
            .classed("dimmed", d => d.dimmed)
            .text((d, i) => i + 1);
    }

    private bindTooltips(currentFrame: ImageFrame, allFrames: ImageFrame[]): void {
        this.tooltipServiceWrapper.addTooltip(
            this.progressIndicator.selectAll(".dot"),
            (datum: ImageFrame) => datum.tooltips,
            (datum: ImageFrame) => datum.identity
        );
        this.tooltipServiceWrapper.addTooltip(
            this.imageContainer,
            () => currentFrame.tooltips,
            () => currentFrame.identity
        );
    }

    private async applyD3Transition(frame: ImageFrame, duration: number, type: string, isForward: boolean): Promise<void> {
        const loadedImg = await this.loadAndDecode(frame.imageUri);
        this.imageContainer.selectAll<HTMLImageElement, any>("img").interrupt();
        this.imageContainer
            //.selectAll<HTMLImageElement, any>("img.exiting-image")
            .selectAll<HTMLImageElement, any>("img")
            .remove();

        // 1. Set up clear, reusable constants
        const axis = type === "slideHorizontal" ? "X" : "Y";
        const isSlide = type === "slideHorizontal" || type === "slideVertical";
        const startValue = isForward ? 100 : -100;
        const endValue = -startValue;

        // 2. Data binding with original key function (including fallback)
        const images = this.imageContainer
            .selectAll<HTMLImageElement, ImageFrame>("img")
            .data([frame], d => {
                if (d.identity !== null) return d.identity.getKey();
                // Fallback for cases where identity might be null
                const array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return `__frame_${d.imageUri}_${array[0]}`;
            });

        const exitSelection = images.exit().attr("class", "exiting-image");

        // 3. Create entering elements and set initial styles
        const enterSelection = images.enter()
            .append("img")
            .attr("src", loadedImg.image.src)
            .attr("alt", loadedImg.loadSucceeded
                ? (frame.caption || "Image")
                : `${frame.caption || "Image"} (image failed to load)`)
            .attr("class", "entered-image")
            .style("position", "absolute")
            .style("top", "0px")
            .style("left", "0px")
            .style("will-change", "transform, opacity")
            .style("opacity", 0);

        // Set initial transform conditionally to satisfy TypeScript
        if (isSlide) {
            enterSelection.style("transform", `translate${axis}(${startValue}%)`);
        }

        // 4. Return promise that resolves when all transitions are complete
        return new Promise(resolve => {
            const t = d3Transition().duration(duration);
            let activeTransitions = 0;

            const onTransitionEnd = () => {
                activeTransitions--;
                if (activeTransitions === 0) {
                    // Original logic to re-order DOM elements
                    this.imageContainer.selectAll("img").order();
                    resolve();
                }
            };

            // Animate entering selection
            if (!enterSelection.empty()) {
                activeTransitions++;
                const transition = enterSelection.transition(t);
                if (isSlide) {
                    transition.styleTween("transform", () => {
                        const interp = d3Interpolate(startValue, 0);
                        return time => `translate${axis}(${interp(time)}%)`;
                    });
                }
                transition.style("opacity", 1)
                    .on("end", () => {
                        enterSelection.style("will-change", null);
                        onTransitionEnd();
                    });
            }

            // Animate exiting selection
            if (!exitSelection.empty()) {
                activeTransitions++;
                exitSelection.style("will-change", "transform, opacity");
                const transition = exitSelection.transition(t);
                if (isSlide) {
                    transition.styleTween("transform", () => {
                        const interp = d3Interpolate(0, endValue);
                        return time => `translate${axis}(${interp(time)}%)`;
                    });
                }
                transition.style("opacity", 0)
                    .on("end", onTransitionEnd)
                    .remove();
            }

            if (activeTransitions === 0) {
                resolve();
            }
        });
    }

    private async loadAndDecode(src: string): Promise<loadedImage> {
        if (!src) return { loadSucceeded: false, image: this.useFallbackSvg() };

        const cached = this.imageCache.get(src);
        if (cached) {
            this.imageCache.delete(src); // Move to end of Map to mark as recently used
            this.imageCache.set(src, cached);
            return { loadSucceeded: true, image: cached };
        }

        const img = new Image();
        let isLoadSuccessful = false;
        try {
            img.src = src;
            await img.decode();
            isLoadSuccessful = true;
        } catch {
            img.src = this.useFallbackSvg().src; // Use fallback on decode error
            isLoadSuccessful = false;
        }

        if (isLoadSuccessful) {
            this.imageCache.set(src, img);
            this.evictOldestIfNeeded();
        }
        return { loadSucceeded: isLoadSuccessful, image: img };
    }

    private evictOldestIfNeeded(): void {
        while (this.imageCache.size > this.maxCacheEntries) {
            const oldestKey = this.imageCache.keys().next().value;
            this.imageCache.delete(oldestKey);
        }
    }

    private useFallbackSvg(): HTMLImageElement {
        const fallbackImage = new Image();
        const svgStr = this.buildFallbackSvgString("#FF0000", "#000000", 0.4);
        fallbackImage.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
        return fallbackImage;
    }

    private buildFallbackSvgString(lineColor: string, bgColor: string, opacity: number): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 20.8 20.8"><g opacity="${opacity}"><path d="m20 20.8.8-.8L.8 0 0 .8Z" fill="${lineColor}"/><path d="M15.4 6.9a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5ZM1.4 18.4v-.5l3-3a1.5 1.5 0 0 0 .6.2 1.4 1.4 0 0 0 1-.4l3-3-.8-.6L5.4 14a.5.5 0 0 1-.7 0 .5.5 0 0 0-.7 0l-2.6 2.4V4.2l-1-1v16.2h16.2l-1-1z" fill="${bgColor}"/><path d="m6.2 3.4-1-1h15.2v15.2l-1-1v-.7l-3.1-3.1-.4.3-.7-.8.8-.6a.5.5 0 0 1 .7 0l2.7 2.8V3.4Z" fill="${bgColor}"/></g></svg>`;
    }
}

// #endregion