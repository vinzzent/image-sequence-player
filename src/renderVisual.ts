"use strict";

import { VisualFormattingSettingsModel } from "./settings";
import { interpolate as d3Interpolate } from "d3-interpolate";
import { transition as d3Transition } from "d3-transition";
import { select as d3Select, Selection } from "d3-selection";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { timeout, Timer } from "d3-timer";
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

// --- Interfaces & Enums (Unchanged) ---
interface ImageFrame {
    identity: ISelectionId;
    imageUri: string;
    caption: string;
    tooltips: VisualTooltipDataItem[];
    opacity: number;
}

interface loadedImage {
    loadSucceeded: boolean;
    image: HTMLImageElement;
}

interface IconData {
    viewBox: string;
    path: string;
}

interface RenderedOptions {
    allowInteractions: boolean;
    selectionManager: ISelectionManager;
    controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    captionContainer: d3.Selection<HTMLDivElement, any, any, any>;
    tooltipServiceWrapper: ITooltipServiceWrapper;
}

enum PlayerState {
    Idle,
    Loading,
    Playing,
    Paused,
    Transitioning
}

// ===================================================================
// STEP 1: PLAYER UI CONTROLLER (Corrected Version)
// ===================================================================

/**
 * Manages user interaction controls (play, pause, step) and the playback timer. 
 * It is stateless regarding playback and communicates user actions to the
 * orchestrating Renderer via callbacks.
 */
export class PlayerUIController {
    public isLooping = false;

    private playPauseButton: Selection<HTMLButtonElement, any, any, any>;
    private playbackTimer?: Timer;

    /**
     * Design Decision: The controller uses callbacks (`onNavigate`, `onTogglePlayback`, etc.)
     * to signal intent to the parent Renderer. This decouples the UI from the
     * FrameManager, as the controller doesn't need to know how navigation is implemented.
     */
    constructor(
        private controlsWrapper: Selection<HTMLDivElement, any, any, any>,
        private onNavigate: (index: number) => Promise<void>,
        private onStep: (direction: number) => Promise<void>,
        private onTogglePlayback: () => void
    ) {
        this.setupControls();
    }

    /**
     * Updates the play/pause button icon when instructed by the Renderer.
     * @param {boolean} isPlaying - True to show the 'pause' icon, false for the 'play' icon.
     */
    public updatePlayPauseIcon(isPlaying: boolean): void {
        const icon = isPlaying ? PlayerUIController.ICONS.pause : PlayerUIController.ICONS.play;
        this.updateButtonIcon(this.playPauseButton, icon);
    }

    /**
     * Starts or stops the playback timer.
     * @param {boolean} shouldPlay - True to start the timer, false to stop.
     * @param {() => void} [callback] - The function to execute when the timer elapses. Required only if shouldPlay is true.
     * @param {number} [delayMs] - The delay in milliseconds. Required only if shouldPlay is true.
     */
    public setTimer(shouldPlay: boolean, callback?: () => void, delayMs?: number): void {
        if (this.playbackTimer) this.playbackTimer.stop();

        if (shouldPlay && callback && typeof delayMs !== 'undefined') {
            this.playbackTimer = timeout(callback, delayMs);
        }
    }

    /**
     * Creates and configures all control panel buttons.
     */
    private setupControls(): void {
        this.createIconButton(this.controlsWrapper, PlayerUIController.ICONS.upArrow)
            .classed("panel-indicator", true)
            .on("click", () => {
                const isExpanded = this.controlsWrapper.classed("is-expanded");
                this.controlsWrapper.classed("is-expanded", !isExpanded);
            });

        const controlsPanel = this.controlsWrapper.append("div").classed("controls-panel", true);
        const controlButtons = controlsPanel.append("div").classed("control-buttons", true);

        this.createIconButton(controlButtons, PlayerUIController.ICONS.goToStart).on("click", () => this.onNavigate(0));
        this.createIconButton(controlButtons, PlayerUIController.ICONS.stepBack).on("click", () => this.onStep(-1));
        this.playPauseButton = this.createIconButton(controlButtons, PlayerUIController.ICONS.play).on("click", () => this.onTogglePlayback());
        this.createIconButton(controlButtons, PlayerUIController.ICONS.stepForward).on("click", () => this.onStep(1));
        this.createIconButton(controlButtons, PlayerUIController.ICONS.goToEnd).on("click", () => this.onNavigate(-1)); // -1 is a sentinel for last frame
        this.createIconButton(controlButtons, PlayerUIController.ICONS.loop)
            .classed("loop-toggle", true)
            .on("click", (event) => {
                this.isLooping = !this.isLooping;
                d3Select(event.currentTarget).classed("active", this.isLooping);
            });
    }

    private createIconButton(container: Selection<any, any, any, any>, iconData: IconData): Selection<HTMLButtonElement, any, any, any> {
        const button = container.append("button");
        const svg = button.append("svg").attr("viewBox", iconData.viewBox);
        svg.append("path").attr("d", iconData.path);
        return button;
    }

    private updateButtonIcon(button: Selection<HTMLButtonElement, any, any, any>, iconData: IconData): void {
        button.selectAll("*").remove();
        const svg = button.append("svg").attr("viewBox", iconData.viewBox);
        svg.append("path").attr("d", iconData.path);
    }

    private static readonly ICONS: { [key: string]: IconData } = {
        play: { viewBox: "0 0 24 24", path: "M8 5v14l11-7z" },
        pause: { viewBox: "0 0 24 24", path: "M6 19h4V5H6v14zm8-14v14h4V5h-4z" },
        goToStart: { viewBox: "0 0 24 24", path: "M6 6h2v12H6zm3.5 6l8.5 6V6z" },
        stepBack: { viewBox: "0 0 24 24", path: "M11 18V6l-8.5 6 8.5 6zm-2-6l6 4.5V7.5l-6 4.5z" },
        stepForward: { viewBox: "0 0 24 24", path: "M13 6v12l8.5-6-8.5-6zm2 6l-6-4.5v9l6-4.5z" },
        goToEnd: { viewBox: "0 0 24 24", path: "M16 6h2v12h-2zm-3.5 6l-8.5 6V6z" },
        loop: { viewBox: "0 0 24 24", path: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" },
        upArrow: { viewBox: "0 0 24 24", path: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" }
    };
}


// ===================================================================
// STEP 2: FRAME MANAGER
// ===================================================================

/**
 * Handles all DOM manipulations for rendering a frame: loading and caching
 * images, applying D3 transitions, updating captions and progress dots,
 * and binding tooltips.
 */
export class FrameManager {
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

        // Uses the arguments passed from the Renderer directly
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
            .style("opacity", d => d.opacity);
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
            .selectAll<HTMLImageElement, any>("img.exiting-image")
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


// ===================================================================
// STEP 3: RENDERER (ORCHESTRATOR)
// ===================================================================

/**
 * Orchestrates the player and frame manager. It holds the visual's state
 * (frames, settings) and coordinates communication between the UI controller
 * and the frame renderer.
 */
export class Renderer {
    private frameManager: FrameManager;
    private playerUI: PlayerUIController;

    // The Renderer now owns the master playerState.
    private playerState: PlayerState = PlayerState.Idle;

    private imageFrames: ImageFrame[] = [];
    private visualSettings: VisualFormattingSettingsModel;
    private currentIndex: number = 0;

    private selectionManager: ISelectionManager;
    private allowInteractions: boolean;

    private spinnerElement: d3.Selection<HTMLDivElement, any, any, any>;

    constructor(options: RenderedOptions) {
        this.selectionManager = options.selectionManager;
        this.allowInteractions = options.allowInteractions;

        this.playerUI = new PlayerUIController(
            options.controlsWrapper,
            this.navigateToFrameFromButton.bind(this),
            this.stepFrameFromButton.bind(this),
            this.togglePlayback.bind(this)
        );

        this.frameManager = new FrameManager(
            options.imageContainer,
            options.captionContainer,
            options.progressIndicator,
            options.tooltipServiceWrapper,
            this.selectFrameById.bind(this)
        );

        this.spinnerElement = options.imageContainer.append("div").classed("spinner", true);
        this.setupSpinner();
    }

    /**
     * The main entry point for rendering the visual.
     * @param {ImageFrame[]} imageFrames - The data for all image frames.
     * @param {VisualFormattingSettingsModel} visualSettings - Current format settings.
     */
    public async render(imageFrames: ImageFrame[], visualSettings: VisualFormattingSettingsModel): Promise<void> {
        this.imageFrames = imageFrames;
        this.visualSettings = visualSettings;

        this.pausePlayback();

        if (!imageFrames || imageFrames.length === 0) {
            this.playerState = PlayerState.Idle;
            this.frameManager.clearContainers();
            return;
        }

        this.frameManager.clearImage();

        this.playerState = PlayerState.Loading;
        this.spinnerElement.classed("visible", true);

        try {
            await this.navigateToFrame(0, 0); // Render first frame instantly
            this.playerState = PlayerState.Paused;
        } catch (error) {
            console.error("Error during initial render:", error);
            this.playerState = PlayerState.Idle;
        } finally {
            this.spinnerElement.classed("visible", false);
        }
    }

    private togglePlayback(): void {
        // Reads state from this.playerState
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        } else if (this.playerState === PlayerState.Paused || this.playerState === PlayerState.Idle) {
            this.startPlayback();
        }
    }

    private startPlayback(): void {
        // Reads state from this.playerState
        if (this.playerState === PlayerState.Playing || this.imageFrames.length <= 1) return;

        // Sets its own state and notifies the UI
        this.playerState = PlayerState.Playing;
        this.playerUI.updatePlayPauseIcon(true);
        this.playbackLoop();
    }

    private pausePlayback(): void {
        // Reads state from this.playerState
        if (this.playerState === PlayerState.Paused || this.playerState === PlayerState.Idle) return;

        // Sets its own state and notifies the UI
        this.playerState = PlayerState.Paused;
        this.playerUI.updatePlayPauseIcon(false);
        this.playerUI.setTimer(false);
    }

    private async playbackLoop(): Promise<void> {
        // Reads state from this.playerState
        if (this.playerState !== PlayerState.Playing) return;

        const displayTime = this.visualSettings.playbackCard.defaultFrameDuration.value;

        this.playerUI.setTimer(true, async () => {
            if (this.playerState !== PlayerState.Playing) return;

            await this.stepFrame(1);

            // Continue the loop if still in a playing state
            if (this.playerState === PlayerState.Playing) {
                this.playbackLoop();
            }
        }, displayTime);
    }

    private async stepFrame(direction: number, duration?: number): Promise<void> {
        const frameCount = this.imageFrames.length;
        if (frameCount <= 1) return;

        let newIndex = this.currentIndex + direction;

        if (newIndex >= frameCount) {
            if (this.playerUI.isLooping) {
                newIndex = 0;
            } else {
                newIndex = frameCount - 1; // Stop at the last frame
                this.pausePlayback();
            }
        } else if (newIndex < 0) {
            newIndex = this.playerUI.isLooping ? frameCount - 1 : 0;
        }

        if (newIndex !== this.currentIndex) {
            await (duration !== undefined
                ? this.navigateToFrame(newIndex, duration)
                : this.navigateToFrame(newIndex));
        }
    }

    private async stepFrameFromButton(direction: number): Promise<void> {
        this.pausePlayback();
        await this.stepFrame(direction, 100);
    }


    private async navigateToFrame(index: number, duration?: number): Promise<void> {       
        if (!this.imageFrames.length) {
            return;
        }       
        const newIndex = index === -1 ? this.imageFrames.length - 1 : index;
        if (!this.imageFrames[newIndex]) {
            return;
        }        
        const previousState = this.playerState;
        this.playerState = PlayerState.Transitioning;
        const oldIndex = this.currentIndex;
        this.currentIndex = newIndex;
        const frame = this.imageFrames[this.currentIndex];        
        const isSteppingForward = newIndex > oldIndex || (newIndex === 0 && oldIndex === this.imageFrames.length - 1);
        const nextIndexToPreload = (this.currentIndex + 1) % this.imageFrames.length;
        this.frameManager.preloadImage(this.imageFrames[nextIndexToPreload]);       
        if (this.visualSettings.playbackCard.selectionSequence.value && previousState === PlayerState.Playing) {
            this.selectionManager.clear();
            this.selectionManager.select(frame.identity);
        }        
        const showCaption = this.visualSettings.captionCard.show.value;
        const transitionType = this.visualSettings.transitionCard.transitionType.value.value as string;
        const finalDuration = duration ?? (this.visualSettings.transitionCard.show.value
            ? this.visualSettings.transitionCard.transitionDuration.value
            : 0);
        try {            
            await this.frameManager.renderFrame(
                frame,
                this.imageFrames,
                this.currentIndex,
                isSteppingForward,
                finalDuration,
                transitionType,
                showCaption
            );
        } catch (error) {
            console.error(`Error navigating to frame ${this.currentIndex}:`, error);
        } finally {            
            if (this.playerState === PlayerState.Transitioning) {
                this.playerState = (previousState === PlayerState.Playing) ? PlayerState.Playing : PlayerState.Paused;
            }
        }
    }

    private async navigateToFrameFromButton(index: number): Promise<void> {
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        }
        await this.navigateToFrame(index, 100);
    }

    private async selectFrameById(identity: ISelectionId): Promise<void> {
        if (!this.allowInteractions || !identity) return;
        this.pausePlayback();
        this.selectionManager.select(identity);
        const index = this.imageFrames.findIndex(f => f.identity && f.identity.equals(identity));
        if (index !== -1 && index !== this.currentIndex) {
            await this.navigateToFrame(index, 100);
        }
    }

    private setupSpinner(): void {
        const svg = this.spinnerElement.append("svg").attr("width", 50).attr("height", 50).attr("viewBox", "0 0 50 50");
        const circle = svg.append("circle")
            .attr("cx", 25).attr("cy", 25).attr("r", 20).attr("stroke", "#605E5C")
            .attr("stroke-width", 7).attr("fill", "none").attr("stroke-linecap", "round")
            .attr("stroke-dasharray", "94.2 31.4");
        circle.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate")
            .attr("from", "0 25 25").attr("to", "360 25 25").attr("dur", "1s").attr("repeatCount", "indefinite");
    }
}