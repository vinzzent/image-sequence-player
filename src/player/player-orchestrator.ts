"use strict";

// #region IMPORTS, INTERFACES & ENUMS

import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { VisualFormattingSettingsModel } from "../settings";
import { FrameRenderer } from "./frame-renderer";
import { PlayerUIController } from "./player-ui-controller";
import { ImageFrame } from "../interfaces";
import ISelectionId = powerbi.visuals.ISelectionId;
// import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionManager = powerbi.extensibility.ISelectionManager;

interface RenderedOptions {
    allowInteractions: boolean;     
    selectionManager: ISelectionManager;
    tooltipServiceWrapper: ITooltipServiceWrapper;
    controlsWrapper: d3.Selection<HTMLDivElement, any, any, any>;
    progressIndicator: d3.Selection<HTMLDivElement, any, any, any>;
    imageContainer: d3.Selection<HTMLDivElement, any, any, any>;
    captionContainer: d3.Selection<HTMLDivElement, any, any, any>;    
}

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

        this.frameManager = new FrameRenderer(
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
        const showDotNumbers = this.visualSettings.navigationCard.dotNumbers.showDotNumbers.value;
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
                showCaption,
                showDotNumbers
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

// #endregion