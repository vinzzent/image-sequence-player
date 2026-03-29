"use strict";

// #region IMPORTS & INTERFACES

import { Selection } from "d3-selection";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { transition as d3Transition } from "d3-transition";
import { interpolate as d3Interpolate } from "d3-interpolate";
import { ImageFrame } from "../common-interfaces";
import ISelectionId = powerbi.visuals.ISelectionId;

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

// === BEGIN CHANGE: Update FrameRenderer constructor to receive index/label span selections ===
    constructor(
        private imageContainer: Selection<HTMLDivElement, any, any, any>,
        private captionContainer: Selection<HTMLDivElement, any, any, any>,
        private captionIndex: Selection<HTMLSpanElement, any, any, any>,
        private captionLabel: Selection<HTMLSpanElement, any, any, any>,
        private progressIndicator: Selection<HTMLDivElement, any, any, any>,
        private tooltipServiceWrapper: ITooltipServiceWrapper,
        private errorSvgString: string,
        private onSelect: (identity: ISelectionId) => void,
    ) { }
// === END CHANGE ===

    /**
 * Renders a specific frame.
 * @param frame The frame data to render.
 * @param allFrames The complete list of frames for context.
 * @param currentIndex The index of the frame to render.
 * @param isForward The direction of the transition.
 * @param transitionDuration The duration of the transition in milliseconds.
 * @param transitionType The type of transition (e.g., "slideHorizontal").
 * @param showCaption Whether to display the caption text.
 * @param showDotNumbers Whether to show the number of frames.
 * @param formattedIndex Format the text index string to be outputted.
 */
// === BEGIN CHANGE: Add formattedIndex to renderFrame signature ===
    public async renderFrame(
        frame: ImageFrame,
        allFrames: ImageFrame[],
        currentIndex: number,
        isForward: boolean,
        transitionDuration: number,
        transitionType: string,
        showCaption: boolean,
        showDotNumbers: boolean,
        formattedIndex: string
    ): Promise<void> {
        // Now calls the updated updateCaption method
        this.updateCaption(frame.caption, showCaption, formattedIndex);
        this.updateProgressDots(allFrames, currentIndex, showDotNumbers);
        this.bindTooltips(frame, allFrames);
        this.imageContainer.on("click", () => this.onSelect(frame.identity));
        await this.applyD3Transition(frame, transitionDuration, transitionType, isForward);
    }
// === END CHANGE ===

    /**
     * Clears all visual elements from the containers.
     */
// === BEGIN CHANGE: Clear spans gracefully to not destroy inner node structure ===
    public clearContainers() {
        this.imageContainer.selectAll<HTMLImageElement, any>("img").remove();
        this.captionIndex.text("");
        this.captionLabel.text("");
        this.progressIndicator.selectAll<HTMLButtonElement, any>(".dot").remove();
    }
// === END CHANGE ===

    /**
    * Clears image container.
    */
    public clearImage(): void {
        this.imageContainer.selectAll<HTMLImageElement, any>("img").remove();
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
     * @param formattedIndex The generated text indicating index string.
     */
// === BEGIN CHANGE: Update updateCaption to output into the respective spans ===
    private updateCaption(caption: string, showCaption: boolean, formattedIndex: string): void {
        const newCaption = showCaption ? caption : "";
        const newIndex = showCaption ? formattedIndex : "";
        this.captionLabel.text(newCaption);
        this.captionIndex.text(newIndex);
    }
// === END CHANGE ===

    /**
    * Updates progress dots, highlighting the current frame and optionally showing numbers. 
    * @param allFrames - Frames to display as dots.
    * @param currentIndex - Index of the active frame.
    * @param showDotNumbers - Show numbers inside dots if true.
    */
    private updateProgressDots(allFrames: ImageFrame[], currentIndex: number, showDotNumbers: boolean): void {
        const dots = this.progressIndicator.selectAll<HTMLButtonElement, ImageFrame>(".dot").data(allFrames);
        
        // --- START OF CHANGE ---
        // Purge leftover DOM elements when dataset shrinks (e.g. from filtering)
        dots.exit().remove();
        // --- END OF CHANGE ---

        dots.enter().append("button").classed("dot", true)
            .on("click", (event, d) => this.onSelect(d.identity))
            .merge(dots)
            .classed("active", (d, i) => i === currentIndex)
            .classed("dimmed", d => d.dimmed)
            .text((d, i) => showDotNumbers ? String(i + 1) : "");
    }

    /**
    * Attaches tooltips to the progress indicator dots and image container for the current frame.
    * @param currentFrame The ImageFrame whose tooltips are currently active.
    * @param allFrames All ImageFrames in the visual (used for reference if needed).
    */
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

    /**
    * Applies a D3-based transition to an image frame, handling slide or fade animations.
    * @param frame The ImageFrame to display with the transition.
    * @param duration Duration of the transition in milliseconds.
    * @param type Type of transition, e.g., "slideHorizontal" or "slideVertical".
    * @param isForward Direction of the transition; true for forward, false for backward.
    * @returns A Promise that resolves once the transition completes.
    **/
    private async applyD3Transition(frame: ImageFrame, duration: number, type: string, isForward: boolean): Promise<void> {
        const loadedImg = await this.loadAndDecode(frame.imageUri);
        this.imageContainer.selectAll<HTMLImageElement, any>("img").interrupt();
        
        if (duration === 0) {
            // 1. Ensure a clean container by removing any previous images.
            this.imageContainer.selectAll<HTMLImageElement, any>("img").remove();

            // 2. Append the new image and set its final styles directly.
            this.imageContainer
                .selectAll("img")
                .data([frame])
                .enter()
                .append(() => loadedImg.image.cloneNode(true) as HTMLImageElement)
                .attr("alt", loadedImg.loadSucceeded
                    ? (frame.caption || "Image")
                    : `${frame.caption || "Image"} (image failed to load)`)
                .attr("class", "entered-image")
                .style("position", "absolute")
                .style("top", "0px")
                .style("left", "0px")
                .style("opacity", 1);

            // 3. Exit the function.
            return Promise.resolve();
        }        

        this.imageContainer
            .selectAll<HTMLImageElement, any>("img.exiting-image")
            .remove();

// === BEGIN CHANGE: Invert horizontal slide transition ===
        // 1. Set up clear, reusable constants
        const axis = type === "slideHorizontal" ? "X" : "Y";
        const isSlide = type === "slideHorizontal" || type === "slideVertical";
        
        // Invert direction for slideHorizontal: moving right-to-left -> left-to-right or vice versa
        // If type is slideHorizontal, we invert the startValue logic compared to Y.
        const startValue = type === "slideHorizontal" 
            ? (isForward ? -100 : 100) 
            : (isForward ? 100 : -100);
            
        const endValue = -startValue;
// === END CHANGE ===

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
            .append(() => loadedImg.image.cloneNode(true) as HTMLImageElement)
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

    /**
    * Loads an image from a source URL or data URI and decodes it for rendering.
    * @param src The image source string to load and decode.
    * @returns A Promise resolving to an object containing the loaded Image and a success flag.
    */
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

    /**
    * Removes the oldest entries from the image cache if it exceeds the maximum size.
    */
    private evictOldestIfNeeded(): void {
        while (this.imageCache.size > this.maxCacheEntries) {
            const oldestKey = this.imageCache.keys().next().value;
            this.imageCache.delete(oldestKey);
        }
    }

    /**
    * Creates an HTMLImageElement using a fallback error SVG.
    * @returns An Image element containing the fallback SVG.
    */
    private useFallbackSvg(): HTMLImageElement {
        const fallbackImage = new Image();
        const svgStr = this.errorSvgString;
        fallbackImage.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
        return fallbackImage;
    }    
}

// #endregion