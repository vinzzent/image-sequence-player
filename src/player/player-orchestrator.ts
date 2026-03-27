"use strict";

// #region IMPORTS, INTERFACES & ENUMS

import {Selection as d3Selection} from "d3"; 
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { VisualFormattingSettingsModel } from "../settings";
import { FrameRenderer } from "./frame-renderer";
import { PlayerUIController } from "./player-ui-controller";
import { ImageFrame } from "../common-interfaces";
// === BEGIN CHANGE: Import formatIndex ===
import { formatIndex } from "../utils";
// === END CHANGE ===
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;

// === BEGIN CHANGE: Add caption elements to RenderedOptions ===
interface RenderedOptions {
    allowInteractions: boolean;     
    selectionManager: ISelectionManager;
    tooltipServiceWrapper: ITooltipServiceWrapper;
    errorSvgString: string;
    controlsWrapper: d3Selection<HTMLDivElement, any, any, any>;
    progressIndicator: d3Selection<HTMLDivElement, any, any, any>;
    imageContainer: d3Selection<HTMLDivElement, any, any, any>;
    captionContainer: d3Selection<HTMLDivElement, any, any, any>;        
    captionIndex: d3Selection<HTMLSpanElement, any, any, any>;
    captionLabel: d3Selection<HTMLSpanElement, any, any, any>;
}
// === END CHANGE ===

enum PlayerState {
    Idle,
    Loading,
    Playing,
    Paused,
    Transitioning
}

// #endregion

// ===================================================================
// #region CLASS: PLAYER ORCHESTRATOR
// ===================================================================

/**
 * Coordinates the player UI and frame manager, handling playback, stepping, and looping.
 * Maintains playback state, current frame, and visual settings.
 * Manages user interactions, selections, and frame preloading.
 */
export class PlayerOrchestrator {
    private frameManager: FrameRenderer;
    private playerUI: PlayerUIController;
    private playerState: PlayerState = PlayerState.Idle;
    private imageFrames: ImageFrame[] = [];
    private visualSettings: VisualFormattingSettingsModel;
    private currentIndex: number = 0;
    private selectionManager: ISelectionManager;
    private allowInteractions: boolean;
    private spinnerElement: d3Selection<HTMLDivElement, any, any, any>;

    constructor(options: RenderedOptions) {
        this.selectionManager = options.selectionManager;
        this.allowInteractions = options.allowInteractions;

        this.playerUI = new PlayerUIController(
            options.controlsWrapper,
            this.navigateToFrameFromButton.bind(this),
            this.stepFrameFromButton.bind(this),
            this.togglePlayback.bind(this)
        );

// === BEGIN CHANGE: Pass captionIndex and captionLabel to FrameRenderer ===
        this.frameManager = new FrameRenderer(
            options.imageContainer,
            options.captionContainer,
            options.captionIndex,
            options.captionLabel,
            options.progressIndicator,            
            options.tooltipServiceWrapper,
            options.errorSvgString,
            this.selectFrameById.bind(this)
        );
// === END CHANGE ===

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

    /**
    * Toggles playback state between playing and paused based on the current player state.
    */
    private togglePlayback() {        
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        } else if (this.playerState === PlayerState.Paused || this.playerState === PlayerState.Idle) {
            this.startPlayback();
        }
    }

    /**
    * Starts playback if not already playing and there are multiple frames.
    */
    private startPlayback() {        
        if (this.playerState === PlayerState.Playing || this.imageFrames.length <= 1) return;
        // Sets its own state and notifies the UI
        this.playerState = PlayerState.Playing;
        this.playerUI.updatePlayPauseIcon(true);
        this.playbackLoop();
    }

    /**
    * Pauses playback and updates the player UI accordingly.
    */
    private pausePlayback() {
        if (this.playerState === PlayerState.Paused || this.playerState === PlayerState.Idle) return;
        // Sets its own state and notifies the UI
        this.playerState = PlayerState.Paused;
        this.playerUI.updatePlayPauseIcon(false);
        this.playerUI.setTimer(false);
    }

    /**
    * Continuously advances frames at the configured interval while playback is active.
    * @returns A Promise that resolves after setting up the timer for the next frame.
    */
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

    /**
    * Advances the current frame by a specified direction, respecting looping and boundaries.
    * @param direction Number of frames to move; positive for forward, negative for backward.
    * @param duration Optional duration for the frame transition.
    * @returns A Promise that resolves once the frame navigation completes.
    */
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

    /**
    * Advances the frame in a given direction when triggered by a button, pausing playback first.
    * @param direction Number of frames to move; positive for forward, negative for backward.
    * @returns A Promise that resolves once the frame navigation completes.
    */
    private async stepFrameFromButton(direction: number): Promise<void> {
        this.pausePlayback();
        await this.stepFrame(direction, 100);
    }

    /**
    * Navigates to a specific frame, optionally with a transition, and handles selection, preloading, and captions.
    * @param index The target frame index to navigate to; -1 wraps to the last frame.
    * @param duration Optional duration for the frame transition.
    * @returns A Promise that resolves once the frame has been rendered.
    */
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
// === BEGIN CHANGE: Update navigateToFrame to handle formatted index ===
        const showCaption = this.visualSettings.captionCard.show.value;
        const showDotNumbers = this.visualSettings.navigationCard.dotNumbers.showDotNumbers.value;
        const transitionType = this.visualSettings.transitionCard.transitionType.value.value as string;
        const indexType = this.visualSettings.captionCard.indexType.value.value as string;
        
        const formattedIndex = showCaption ? formatIndex(indexType, this.currentIndex, this.imageFrames.length) : "";

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
                showCaption,
                showDotNumbers,
                formattedIndex
            );
        } catch (error) {
            console.error(`Error navigating to frame ${this.currentIndex}:`, error);
        } finally {            
            if (this.playerState === PlayerState.Transitioning) {
                this.playerState = (previousState === PlayerState.Playing) ? PlayerState.Playing : PlayerState.Paused;
            }
        }
// === END CHANGE ===
    }

    /**
    * Navigates to a specific frame when triggered by a button, pausing playback first.
    * @param index The target frame index to navigate to.
    * @returns A Promise that resolves once the frame has been rendered.
    */
    private async navigateToFrameFromButton(index: number): Promise<void> {
        if (this.playerState === PlayerState.Playing || this.playerState === PlayerState.Transitioning) {
            this.pausePlayback();
        }
        await this.navigateToFrame(index, 100);
    }

    /**
    * Selects a frame by its selection identity, pauses playback, and navigates to it if different from the current frame.
    * @param identity The selection identity of the frame to select.
    * @returns A Promise that resolves once navigation to the selected frame completes.
    */
    private async selectFrameById(identity: ISelectionId): Promise<void> {
        if (!this.allowInteractions || !identity) return;
        this.pausePlayback();
        this.selectionManager.select(identity);
        const index = this.imageFrames.findIndex(f => f.identity && f.identity.equals(identity));
        if (index !== -1 && index !== this.currentIndex) {
            await this.navigateToFrame(index, 100);
        }
    }

    /**
    * Sets up an SVG-based loading spinner inside the spinner container element.
    */
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

// #endregion